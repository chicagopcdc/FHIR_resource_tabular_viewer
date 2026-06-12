"""A :class:`SourceLoader` backed by an uploaded local file, held in memory."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from app.services.sources.base import SourceLoader
from app.services.sources.store import InMemoryFhirStore


class LocalFileSource(SourceLoader):
    """Serve FHIR resources parsed from an uploaded file out of memory."""

    source_type = "local_file"

    def __init__(self, store: InMemoryFhirStore, *, filename: str = ""):
        self._store = store
        self.filename = filename

    @classmethod
    def from_bytes(cls, data: bytes, *, filename: str = "") -> "LocalFileSource":
        return cls(InMemoryFhirStore.from_bytes(data, filename=filename), filename=filename)

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
