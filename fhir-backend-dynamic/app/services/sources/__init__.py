"""
Pluggable FHIR data sources.

This package introduces a small abstraction over *where* FHIR resources come
from. Historically the backend only ever proxied a live FHIR server
(``config.fhir_base_url`` + HTTP). The :class:`SourceLoader` interface lets the
viewer ingest resources from other origins - starting with uploaded local files
- behind a single, consistent contract so the transformation and viewer layers
stay independent of the origin.

Implementations:
    * :class:`~app.services.sources.local_file.LocalFileSource` - resources
      parsed from an uploaded JSON / NDJSON / Bundle payload, held in memory.

Future implementations (e.g. S3-backed) only need to satisfy the same
:class:`SourceLoader` contract.
"""

from app.services.sources.base import SourceLoader
from app.services.sources.local_file import LocalFileSource
from app.services.sources.store import InMemoryFhirStore, FhirParseError

__all__ = [
    "SourceLoader",
    "LocalFileSource",
    "InMemoryFhirStore",
    "FhirParseError",
]
