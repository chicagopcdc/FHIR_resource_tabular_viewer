"""Source abstraction shared by every FHIR data origin."""

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional

from app.services import schema
from app.services.sources import links as links_service
from app.services.sources import profile as profile_service


class SourceLoader(ABC):
    """Common contract for a loadable FHIR data source.

    A source exposes the same three primitives the viewer needs regardless of
    origin: which resource types exist, a paginated search over a type, and a
    single-resource read. ``schema`` is provided once here so the tabular
    column inference is identical across every source implementation (it reuses
    :func:`app.services.schema.infer_columns`, the same logic the live-server
    path uses).
    """

    #: Short machine identifier for the kind of source, e.g. ``"local_file"``.
    source_type: str = "unknown"

    @abstractmethod
    def resource_types(self) -> List[str]:
        """Return the sorted list of resource types available in this source."""

    @abstractmethod
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
        """Return a FHIR ``searchset`` Bundle for ``resource_type``.

        Implementations must honour ``count``/``offset`` pagination and return a
        well-formed Bundle (``resourceType == "Bundle"``) even when empty.
        ``q`` optionally filters by a case-insensitive text match; ``sort`` is a
        dotted column path with ``order`` ``asc``/``desc``.
        """

    @abstractmethod
    def read(self, resource_type: str, resource_id: str) -> Optional[Dict[str, Any]]:
        """Return a single resource by id, or ``None`` if it does not exist."""

    def summary(self) -> Dict[str, int]:
        """Return a ``{resource_type: count}`` map describing the source."""
        return {rt: self.count(rt) for rt in self.resource_types()}

    def close(self) -> None:
        """Release any resources held by this source.

        In-memory sources need nothing; disk-backed ones override this to close
        their database and delete temp files. Called when a source is unloaded.
        """
        return None

    @abstractmethod
    def count(self, resource_type: str) -> int:
        """Return the number of resources of ``resource_type`` in this source."""

    def profile(
        self,
        resource_type: str,
        *,
        top_n: int = 5,
        max_columns: int = 25,
    ) -> Dict[str, Any]:
        """Describe what is in this resource type: completeness and top values.

        The default pulls the resources and profiles them in Python, which is
        fine for in-memory sources. Disk-backed sources override this with SQL
        aggregation so the same numbers come back over millions of rows.
        """
        total = self.count(resource_type)
        bundle = self.search(resource_type, count=max(1, total), offset=0)
        resources = [
            entry.get("resource")
            for entry in bundle.get("entry", [])
            if isinstance(entry.get("resource"), dict)
        ]
        columns = profile_service.profile_resources(
            resources, top_n=top_n, max_columns=max_columns
        )
        return {
            "resourceType": resource_type,
            "total": total,
            "profiled": len(resources),
            "sampled": len(resources) < total,
            "columns": columns,
        }

    def links(self, resource_type: str, *, sample: int = 20_000) -> Dict[str, Any]:
        """Report where this resource type points, and whether those links resolve.

        The default profiles the resources it can load; disk-backed sources
        override the sampling so a multi-GB export does not have to be read into
        memory. Resolution is checked against the loaded dataset only, so a
        dangling link means "not in this file", not "invalid".
        """
        total = self.count(resource_type)
        bundle = self.search(resource_type, count=max(1, min(total, sample)), offset=0)
        resources = [
            entry.get("resource")
            for entry in bundle.get("entry", [])
            if isinstance(entry.get("resource"), dict)
        ]
        return self._links_payload(resource_type, resources, total)

    def _links_payload(
        self, resource_type: str, resources: List[Dict[str, Any]], total: int
    ) -> Dict[str, Any]:
        """Shared shaping for link analysis, given the resources to inspect."""
        analyzed = links_service.analyze_links(
            resources, lambda rt, rid: self.read(rt, rid) is not None
        )
        return {
            "resourceType": resource_type,
            "total": total,
            "analyzed": len(resources),
            "sampled": len(resources) < total,
            "links": analyzed,
        }

    def schema(self, resource_type: str, *, sample: int = 20) -> Dict[str, Any]:
        """Infer tabular columns for ``resource_type`` from a sample of records.

        Shared default so file-backed and server-backed sources produce the
        same column shape the frontend already understands.
        """
        bundle = self.search(resource_type, count=max(1, sample), offset=0)
        resources = [
            entry.get("resource")
            for entry in bundle.get("entry", [])
            if isinstance(entry.get("resource"), dict)
        ]
        columns = schema.infer_columns(resources)
        return {
            "resourceType": resource_type,
            "sample_size": len(resources),
            "total": self.count(resource_type),
            "columns": columns,
        }
