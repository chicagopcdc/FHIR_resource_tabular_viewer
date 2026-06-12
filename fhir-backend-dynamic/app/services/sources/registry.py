"""In-memory registry of loaded :class:`SourceLoader` instances.

Mirrors :mod:`app.services.registry` (which tracks live FHIR servers) but for
file/object-backed sources. Each registered source gets a short id the frontend
uses on subsequent requests.
"""

from __future__ import annotations

import threading
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.services.sources.base import SourceLoader


class _Entry:
    __slots__ = ("source_id", "name", "loader", "created_at")

    def __init__(self, source_id: str, name: str, loader: SourceLoader):
        self.source_id = source_id
        self.name = name
        self.loader = loader
        self.created_at = datetime.now(timezone.utc)

    def metadata(self) -> Dict[str, Any]:
        return {
            "source_id": self.source_id,
            "name": self.name,
            "source_type": self.loader.source_type,
            "created_at": self.created_at.isoformat(),
            "resource_types": self.loader.resource_types(),
            "summary": self.loader.summary(),
            "total": sum(self.loader.summary().values()),
        }


_SOURCES: Dict[str, _Entry] = {}
_LOCK = threading.Lock()


def add_source(loader: SourceLoader, *, name: str) -> Dict[str, Any]:
    """Register ``loader`` under a fresh id and return its metadata."""
    source_id = uuid.uuid4().hex[:12]
    entry = _Entry(source_id, name, loader)
    with _LOCK:
        _SOURCES[source_id] = entry
    return entry.metadata()


def get_source(source_id: str) -> SourceLoader:
    entry = _SOURCES.get(source_id)
    if entry is None:
        raise KeyError(f"Source '{source_id}' not found")
    return entry.loader

def get_metadata(source_id: str) -> Dict[str, Any]:
    entry = _SOURCES.get(source_id)
    if entry is None:
        raise KeyError(f"Source '{source_id}' not found")
    return entry.metadata()


def list_sources() -> List[Dict[str, Any]]:
    with _LOCK:
        return [entry.metadata() for entry in _SOURCES.values()]


def remove_source(source_id: str) -> bool:
    with _LOCK:
        return _SOURCES.pop(source_id, None) is not None


def clear() -> None:
    with _LOCK:
        _SOURCES.clear()
