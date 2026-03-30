"""
FastAPI router for aggregate dataset endpoints
"""

import logging
from typing import Dict, Any
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import JSONResponse

from app.config import config
from app.services.aggregation import get_aggregation_service
from app.models.aggregate import (
    AggregateRequest, AggregateResponse, SliceRequest, SliceResponse,
    ProgressResponse, ErrorResponse, DeleteResponse,
    DatasetProfileResponse, DatasetSchemaResponse
)

router = APIRouter(prefix="/aggregate", tags=["aggregate"])
logger = logging.getLogger(__name__)

def check_aggregate_enabled():
    """Dependency to check if aggregate functionality is enabled"""
    if not config.aggregate_enabled:
        raise HTTPException(
            status_code=503,
            detail="Aggregate functionality is currently disabled. Use traditional pagination endpoints."
        )

@router.post("/{resource_type}", response_model=AggregateResponse)
async def create_aggregate(
    resource_type: str,
    request: AggregateRequest,
    _: None = Depends(check_aggregate_enabled)
):
    """
    Create aggregated dataset for a FHIR resource type with given filters.
    Fetches all matching resources following FHIR Bundle.link pagination.
    """
    try:
        logger.info(f"Creating aggregate for {resource_type} with filters: {request.filters}")
        
        aggregation_service = get_aggregation_service()
        result = await aggregation_service.build_dataset(
            resource_type=resource_type,
            search_params={**request.filters, **request.search_params},
            user_id=request.user_session
        )
        
        return AggregateResponse(**result)
        
    except Exception as e:
        logger.error(f"Failed to create aggregate for {resource_type}: {e}")
        raise HTTPException(status_code=500, detail=f"Aggregation failed: {str(e)}")

@router.get("/{dataset_id}/slice", response_model=SliceResponse)
async def get_dataset_slice(
    dataset_id: str,
    offset: int = Query(default=0, ge=0, description="Starting offset"),
    limit: int = Query(default=50, ge=1, le=1000, description="Number of items to return"),
    user_session: str = Query(..., description="User session identifier"),
    _: None = Depends(check_aggregate_enabled)
):
    """
    Get paginated slice of cached dataset.
    Returns items[offset:offset+limit] from the complete cached dataset.
    """
    try:
        logger.debug(f"Getting slice of dataset {dataset_id}: offset={offset}, limit={limit}")
        
        aggregation_service = get_aggregation_service()
        result = await aggregation_service.get_dataset_slice(
            dataset_id=dataset_id,
            offset=offset,
            limit=limit,
            user_id=user_session
        )
        
        return SliceResponse(**result)
        
    except ValueError as e:
        logger.warning(f"Dataset not found: {dataset_id}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to get dataset slice {dataset_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Slice retrieval failed: {str(e)}")

@router.get("/{dataset_id}/progress", response_model=ProgressResponse)
async def get_dataset_progress(
    dataset_id: str,
    _: None = Depends(check_aggregate_enabled)
):
    """
    Get progress information for dataset build.
    Returns build status, progress percentage, and timing information.
    """
    try:
        if not config.aggregate_progress_enabled:
            raise HTTPException(status_code=404, detail="Progress endpoint is disabled")
            
        aggregation_service = get_aggregation_service()
        progress = await aggregation_service.get_progress(dataset_id)
        
        if not progress:
            raise HTTPException(status_code=404, detail=f"Progress not found for dataset: {dataset_id}")
        
        return ProgressResponse(**progress)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get progress for dataset {dataset_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Progress retrieval failed: {str(e)}")

@router.get("/{dataset_id}/profile", response_model=DatasetProfileResponse)
async def get_dataset_profile(
    dataset_id: str,
    user_session: str = Query(..., description="User session identifier"),
    _: None = Depends(check_aggregate_enabled)
):
    """
    Get dataset-level metadata for a cached aggregate dataset.
    Returns status, counts, timing, and source identifiers for the dataset.
    """
    try:
        aggregation_service = get_aggregation_service()
        result = await aggregation_service.get_dataset_profile(
            dataset_id=dataset_id,
            user_id=user_session
        )

        return DatasetProfileResponse(**result)

    except ValueError as e:
        logger.warning(f"Dataset not found: {dataset_id}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to get dataset profile {dataset_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Profile retrieval failed: {str(e)}")

@router.get("/{dataset_id}/schema", response_model=DatasetSchemaResponse)
async def get_dataset_schema(
    dataset_id: str,
    user_session: str = Query(..., description="User session identifier"),
    _: None = Depends(check_aggregate_enabled)
):
    """
    Get inferred schema metadata for a cached aggregate dataset.
    Returns lightweight column definitions derived from sampled cached resources.
    """
    try:
        aggregation_service = get_aggregation_service()
        result = await aggregation_service.get_dataset_schema(
            dataset_id=dataset_id,
            user_id=user_session
        )

        return DatasetSchemaResponse(**result)

    except ValueError as e:
        logger.warning(f"Dataset not found: {dataset_id}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to get dataset schema {dataset_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Schema retrieval failed: {str(e)}")

@router.delete("/{dataset_id}", response_model=DeleteResponse)
async def delete_dataset(
    dataset_id: str,
    user_session: str = Query(..., description="User session identifier"),
    _: None = Depends(check_aggregate_enabled)
):
    """
    Delete cached dataset.
    Removes dataset from cache to free memory and invalidate cached results.
    """
    try:
        logger.info(f"Deleting dataset: {dataset_id}")
        
        aggregation_service = get_aggregation_service()
        deleted = await aggregation_service.delete_dataset(
            dataset_id=dataset_id,
            user_id=user_session
        )
        
        if deleted:
            return DeleteResponse(
                success=True,
                dataset_id=dataset_id,
                message="Dataset deleted successfully"
            )
        else:
            raise HTTPException(status_code=404, detail=f"Dataset not found: {dataset_id}")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete dataset {dataset_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Dataset deletion failed: {str(e)}")

@router.get("/health")
async def aggregate_health():
    """
    Health check endpoint for aggregate service.
    Returns service status and configuration information.
    """
    try:
        return {
            "status": "healthy",
            "aggregate_enabled": config.aggregate_enabled,
            "progress_enabled": config.aggregate_progress_enabled,
            "max_records": config.aggregate_max_records,
            "cache_backend": config.cache_backend,
            "build_timeout_seconds": config.aggregate_max_build_time_seconds
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(status_code=500, detail=f"Health check failed: {str(e)}")

# Note: Exception handlers are handled within individual endpoint try/catch blocks
# APIRouter doesn't support global exception handlers like FastAPI app
