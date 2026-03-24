import logging
from typing import Dict, Any
from fastapi import APIRouter, HTTPException, Depends, Query, BackgroundTasks, status
from fastapi.responses import JSONResponse

from app.config import config
from app.services.aggregation import get_aggregation_service
from app.models.aggregate import (
    AggregateRequest, AggregateResponse, SliceRequest, SliceResponse,
    ProgressResponse, ErrorResponse, DeleteResponse
)

# 1. Use a more descriptive tag for OpenAPI/Swagger docs
router = APIRouter(prefix="/aggregate", tags=["Data Aggregation"])
logger = logging.getLogger("app.aggregate")

def check_aggregate_enabled():
    """Dependency to check if aggregate functionality is enabled."""
    if not config.aggregate_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Aggregate functionality is disabled. Please use standard pagination."
        )

@router.post("/{resource_type}", 
             status_code=status.HTTP_202_ACCEPTED, 
             response_model=AggregateResponse)
async def create_aggregate(
    resource_type: str,
    request: AggregateRequest,
    background_tasks: BackgroundTasks, # For non-blocking execution
    _: None = Depends(check_aggregate_enabled)
):
    """
    Trigger an aggregated dataset build in the background.
    Returns 202 Accepted immediately to prevent HTTP timeouts.
    """
    logger.info("Initiating aggregate build for %s | Session: %s", resource_type, request.user_session)
    
    aggregation_service = get_aggregation_service()
    
    # Generate ID first so we can return it immediately
    dataset_id = f"ds_{resource_type}_{hash(request.user_session)}"
    
    # Move the heavy lifting to a background thread/task
    background_tasks.add_task(
        aggregation_service.build_dataset,
        resource_type=resource_type,
        search_params={**request.filters, **request.search_params},
        user_id=request.user_session,
        dataset_id=dataset_id
    )
    
    return {
        "dataset_id": dataset_id,
        "status": "processing",
        "message": "Aggregation started in background."
    }

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
