
from fastapi import APIRouter, HTTPException, UploadFile, File
from app.services import source_registry
from app.services.file_store import parse_fhir_file, FileStore
from app.config import config
import logging

router = APIRouter(prefix="/sources", tags=["sources"])
logger = logging.getLogger(__name__)

# Maximum upload size: 50 MB
MAX_UPLOAD_BYTES = 50 * 1024 * 1024


@router.post("/file")
async def upload_file_source(file: UploadFile = File(...)):
    """
    Upload a FHIR Bundle JSON or NDJSON file to use as the active data source.
    All subsequent FHIR queries will be served from this file until it is
    deleted via DELETE /api/sources/file.
    """
    try:
        content = await file.read()
        if len(content) > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"File too large. Maximum allowed size is {MAX_UPLOAD_BYTES // (1024 * 1024)} MB."
            )
        if len(content) == 0:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")

        resource_map = parse_fhir_file(content)
        if not resource_map:
            raise HTTPException(
                status_code=422,
                detail="No FHIR resources found in the uploaded file. "
                       "Supported formats: Bundle JSON, NDJSON."
            )

        store = FileStore(resource_map)
        source_registry.set_file(file.filename or "uploaded_file", store)

        counts = store.resource_counts()
        logger.info(f"File source activated: {file.filename}, counts: {counts}")

        return {
            "success": True,
            "name": file.filename,
            "resource_counts": counts,
            "total_resources": sum(counts.values()),
            "message": (
                f"File '{file.filename}' loaded successfully. "
                f"{sum(counts.values())} resources across {len(counts)} types. "
                "All FHIR queries will now be served from this file."
            ),
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error loading file source: {exc}")
        raise HTTPException(status_code=500, detail=f"Failed to parse file: {exc}")


@router.get("/active")
async def get_active_source():
    """Return information about the currently active data source."""
    if source_registry.is_file_active():
        store = source_registry.get_file_store()
        counts = store.resource_counts() if store else {}
        return {
            "type": "file",
            "name": source_registry.get_file_name(),
            "resource_counts": counts,
            "total_resources": sum(counts.values()),
            "base_url": None,
        }

    return {
        "type": "live",
        "name": None,
        "resource_counts": None,
        "total_resources": None,
        "base_url": config.fhir_base_url,
    }


@router.delete("/file")
async def clear_file_source():
    """
    Remove the active file store and revert to the live FHIR server.
    No-op if no file is currently loaded.
    """
    was_active = source_registry.is_file_active()
    name = source_registry.get_file_name()
    source_registry.clear_file()

    if was_active:
        logger.info(f"File source cleared: {name}")
        return {
            "success": True,
            "message": f"File source '{name}' cleared. Reverted to live FHIR server at {config.fhir_base_url}.",
            "active_source": "live",
        }

    return {
        "success": True,
        "message": "No file source was active. Already using live FHIR server.",
        "active_source": "live",
    }
