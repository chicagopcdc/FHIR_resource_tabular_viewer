"""
app/services/source_registry.py

Holds the currently active data source: either the live FHIR server (default)
or an in-memory FileStore loaded from an uploaded file.

All state is module-level so it behaves as a process-wide singleton.
"""
from __future__ import annotations
from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from app.services.file_store import FileStore

_active_store: Optional["FileStore"] = None
_active_file_name: Optional[str] = None


def set_file(name: str, store: "FileStore") -> None:
    """Register an in-memory file store as the active source."""
    global _active_store, _active_file_name
    _active_store = store
    _active_file_name = name


def clear_file() -> None:
    """Clear the file store and revert to the live FHIR server."""
    global _active_store, _active_file_name
    _active_store = None
    _active_file_name = None


def is_file_active() -> bool:
    """Return True when requests should be served from the file store."""
    return _active_store is not None


def get_file_name() -> Optional[str]:
    return _active_file_name


def get_file_store() -> Optional["FileStore"]:
    return _active_store
