"""Shared base for sources backed by an in-memory store.

Both the local-file and S3 sources differ only in *how they obtain bytes*; once
parsed into an :class:`InMemoryFhirStore` the read/search behaviour is identical.
This base captures that common behaviour so each concrete source only provides
its constructor.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from app.services.sources.base import SourceLoader
from app.services.sources.store import InMemoryFhirStore


class InMemoryStoreSource(SourceLoader):
    """A :class:`SourceLoader` whose data lives in an :class:`InMemoryFhirStore`."""

    def __init__(self, store: InMemoryFhirStore):
        self._store = store

    def resource_types(self) -> List[str]:
        return self._store.resource_types()

    def count(self, resource_type: str) -> int:
        return self._store.count(resource_type)

    def summary(self) -> Dict[str, int]:
        return self._store.summary()

    def search(self, resource_type: str, *, count: int = 50, offset: int = 0) -> Dict[str, Any]:
        return self._store.search(resource_type, count=count, offset=offset)

    def read(self, resource_type: str, resource_id: str) -> Optional[Dict[str, Any]]:
        return self._store.read(resource_type, resource_id)
