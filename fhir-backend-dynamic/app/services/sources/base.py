"""Source abstraction shared by every FHIR data origin."""

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional

from app.services import schema


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
    def search(self, resource_type: str, *, count: int = 50, offset: int = 0) -> Dict[str, Any]:
        """Return a FHIR ``searchset`` Bundle for ``resource_type``.

        Implementations must honour ``count``/``offset`` pagination and return a
        well-formed Bundle (``resourceType == "Bundle"``) even when empty.
        """

    @abstractmethod
    def read(self, resource_type: str, resource_id: str) -> Optional[Dict[str, Any]]:
        """Return a single resource by id, or ``None`` if it does not exist."""

    def summary(self) -> Dict[str, int]:
        """Return a ``{resource_type: count}`` map describing the source."""
        return {rt: self.count(rt) for rt in self.resource_types()}

    @abstractmethod
    def count(self, resource_type: str) -> int:
        """Return the number of resources of ``resource_type`` in this source."""

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
