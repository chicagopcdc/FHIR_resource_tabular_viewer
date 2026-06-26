"""A :class:`SourceLoader` backed by an uploaded local file, held in memory."""

from __future__ import annotations

from app.services.sources.memory_source import InMemoryStoreSource
from app.services.sources.store import InMemoryFhirStore


class LocalFileSource(InMemoryStoreSource):
    """Serve FHIR resources parsed from an uploaded file out of memory."""

    source_type = "local_file"

    def __init__(self, store: InMemoryFhirStore, *, filename: str = ""):
        super().__init__(store)
        self.filename = filename

    @classmethod
    def from_bytes(cls, data: bytes, *, filename: str = "") -> "LocalFileSource":
        return cls(InMemoryFhirStore.from_bytes(data, filename=filename), filename=filename)
