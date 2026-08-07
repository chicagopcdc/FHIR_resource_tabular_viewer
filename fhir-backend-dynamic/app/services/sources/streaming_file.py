"""A :class:`SourceLoader` backed by a disk-resident SQLite store.

Used for very large uploads: resources are streamed into SQLite during ingest
rather than held in memory, so a multi-GB NDJSON export can be browsed in full.
Satisfies the same contract as the in-memory sources, so search, sort, schema,
and export all work unchanged.
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional

from app.services.sources import profile as profile_service
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

    def links(self, resource_type: str, *, sample: int = 20_000) -> Dict[str, Any]:
        """Analyze links from a strided sample rather than the whole table."""
        return self._links_payload(
            resource_type,
            self._store.sample_resources(resource_type, sample),
            self.count(resource_type),
        )

    def profile(
        self,
        resource_type: str,
        *,
        top_n: int = 5,
        max_columns: int = 25,
        sample: int = 50_000,
    ) -> Dict[str, Any]:
        """Profile from an evenly strided sample of the stored resources.

        Reading one sample and profiling every column from it is far cheaper
        than aggregating each column separately in SQL, which would re-parse
        every stored body once per column. Results are reported as sampled
        whenever the type holds more resources than the sample size.
        """
        total = self.count(resource_type)
        resources = self._store.sample_resources(resource_type, sample)
        columns = profile_service.profile_resources(
            resources, top_n=top_n, max_columns=max_columns
        )
        # Scale sampled counts up so completeness reads against the real total.
        return {
            "resourceType": resource_type,
            "total": total,
            "profiled": len(resources),
            "sampled": len(resources) < total,
            "columns": columns,
        }

    def close(self) -> None:
        """Release the SQLite connection and delete the temp database."""
        self._store.close()
