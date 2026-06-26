"""Endpoints for loadable FHIR data sources (local file uploads).

These complement the live-server endpoints: instead of proxying a remote FHIR
server, they serve resources the user uploaded directly. The response shapes
(searchset Bundles, schema column lists) mirror the live path so the frontend's
tabular viewer can consume either origin.
"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, File, UploadFile, Query
from pydantic import BaseModel, Field

from app.services.sources import registry as source_registry
from app.services.sources.local_file import LocalFileSource
from app.services.sources.s3_file import S3FileSource, S3Settings, S3Error
from app.services.sources.store import FhirParseError

router = APIRouter(prefix="/sources", tags=["sources"])
logger = logging.getLogger(__name__)


class S3LoadRequest(BaseModel):
    """Body for loading a FHIR object directly from S3."""

    uri: str = Field(..., description="s3://bucket/key URI of the FHIR object")
    region: Optional[str] = None
    endpoint_url: Optional[str] = Field(None, description="Custom endpoint, e.g. MinIO/LocalStack")
    access_key_id: Optional[str] = None
    secret_access_key: Optional[str] = None
    session_token: Optional[str] = None


@router.post("/upload")
async def upload_source(file: UploadFile = File(...)):
    """Upload a FHIR file (resource, Bundle, JSON array, or NDJSON).

    Returns a ``source_id`` plus a per-type resource summary. The id is used on
    the other ``/sources/{source_id}/...`` endpoints.
    """
    try:
        data = await file.read()
    except Exception as exc:  # pragma: no cover - defensive
        logger.error("Failed reading upload %s: %s", file.filename, exc)
        raise HTTPException(status_code=400, detail="Could not read uploaded file.")

    try:
        loader = LocalFileSource.from_bytes(data, filename=file.filename or "")
    except FhirParseError as exc:
        # Expected, user-actionable validation failures.
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception("Unexpected error parsing upload %s", file.filename)
        raise HTTPException(status_code=500, detail=f"Failed to load file: {exc}")

    metadata = source_registry.add_source(loader, name=file.filename or "uploaded-file")
    logger.info(
        "Loaded source %s from %s (%d resources, %d types)",
        metadata["source_id"], file.filename, metadata["total"],
        len(metadata["resource_types"]),
    )
    return {"success": True, "data": metadata}


@router.post("/s3")
async def load_s3_source(body: S3LoadRequest):
    """Load a FHIR object directly from S3 (``s3://bucket/key``).

    Credentials fall back to the standard AWS chain when not supplied. Same
    response shape as ``/upload``.
    """
    settings = S3Settings(
        region=body.region,
        endpoint_url=body.endpoint_url,
        access_key_id=body.access_key_id,
        secret_access_key=body.secret_access_key,
        session_token=body.session_token,
    )
    try:
        loader = S3FileSource.from_s3(body.uri, settings=settings)
    except FhirParseError as exc:
        # NOTE: FhirParseError subclasses ValueError, so it must be caught first.
        raise HTTPException(status_code=422, detail=str(exc))
    except ValueError as exc:
        # Malformed s3:// URI.
        raise HTTPException(status_code=400, detail=str(exc))
    except S3Error as exc:
        # Fetch/auth failure talking to S3.
        raise HTTPException(status_code=502, detail=str(exc))
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception("Unexpected error loading S3 source %s", body.uri)
        raise HTTPException(status_code=500, detail=f"Failed to load S3 object: {exc}")

    metadata = source_registry.add_source(loader, name=body.uri)
    logger.info(
        "Loaded S3 source %s from %s (%d resources)",
        metadata["source_id"], body.uri, metadata["total"],
    )
    return {"success": True, "data": metadata}


@router.get("")
async def list_sources():
    """List all currently loaded sources."""
    return {"success": True, "data": source_registry.list_sources()}


@router.get("/{source_id}")
async def get_source(source_id: str):
    """Return metadata (resource types + counts) for one source."""
    try:
        return {"success": True, "data": source_registry.get_metadata(source_id)}
    except KeyError:
        raise HTTPException(status_code=404, detail="Source not found")


@router.get("/{source_id}/resources/{resource_type}")
async def search_resources(
    source_id: str,
    resource_type: str,
    count: int = Query(50, ge=1, le=1000),
    offset: int = Query(0, ge=0),
):
    """Return a paginated FHIR searchset Bundle for a resource type."""
    try:
        loader = source_registry.get_source(source_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Source not found")
    bundle = loader.search(resource_type, count=count, offset=offset)
    return {"success": True, "data": bundle}


@router.get("/{source_id}/resources/{resource_type}/schema")
async def resource_schema(
    source_id: str,
    resource_type: str,
    sample: int = Query(20, ge=1, le=1000),
):
    """Infer tabular columns for a resource type from a sample of records."""
    try:
        loader = source_registry.get_source(source_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Source not found")
    return {"success": True, "data": loader.schema(resource_type, sample=sample)}


@router.get("/{source_id}/resources/{resource_type}/{resource_id}")
async def read_resource(source_id: str, resource_type: str, resource_id: str):
    """Return a single resource by id from a source."""
    try:
        loader = source_registry.get_source(source_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Source not found")
    resource = loader.read(resource_type, resource_id)
    if resource is None:
        raise HTTPException(status_code=404, detail="Resource not found")
    return {"success": True, "data": resource}


@router.delete("/{source_id}")
async def delete_source(source_id: str):
    """Unload a source and free its memory."""
    if not source_registry.remove_source(source_id):
        raise HTTPException(status_code=404, detail="Source not found")
    return {"success": True, "message": f"Source {source_id} removed"}
