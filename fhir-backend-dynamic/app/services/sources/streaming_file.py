"""A :class:`SourceLoader` backed by a disk-resident SQLite store.

Used for very large uploads: resources are streamed into SQLite during ingest
rather than held in memory, so a multi-GB NDJSON export can be browsed in full.
Satisfies the same contract as the in-memory sources, so search, sort, schema,
and export all work unchanged.
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional

from app.services.sources.base import SourceLoader
from app.services.sources.sqlite_store import SqliteFhirStore


class StreamingFileSource(SourceLoader):
    """Serve FHIR resources from a disk-backed SQLite store."""

    source_type = "streaming_file"

    def __init__(self, store: SqliteFhirStore, *, filename: str = ""):
        self._store = store
        self.filename = filename

    @classmethod
    def from_lines(
        cls,
        lines: Iterable[bytes],
        *,
        filename: str = "",
        max_resources: Optional[int] = None,
    ) -> "StreamingFileSource":
        """Ingest an iterable of NDJSON lines into a fresh disk store."""
        store = SqliteFhirStore()
        try:
            store.ingest_lines(lines, max_resources=max_resources)
        except Exception:
            store.close()
            raise
        return cls(store, filename=filename)

    def resource_types(self) -> List[str]:
        return self._store.resource_types()

    def count(self, resource_type: str) -> int:
        return self._store.count(resource_type)

    def summary(self) -> Dict[str, int]:
        return self._store.summary()

    def search(
        self,
        resource_type: str,
        *,
        count: int = 50,
        offset: int = 0,
        q: Optional[str] = None,
        sort: Optional[str] = None,
        order: str = "asc",
    ) -> Dict[str, Any]:
        return self._store.search(
            resource_type, count=count, offset=offset, q=q, sort=sort, order=order
        )

    def read(self, resource_type: str, resource_id: str) -> Optional[Dict[str, Any]]:
        return self._store.read(resource_type, resource_id)

    def close(self) -> None:
        """Release the SQLite connection and delete the temp database."""
        self._store.close()
