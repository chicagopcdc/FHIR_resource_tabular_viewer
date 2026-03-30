"""
FHIR Resource Aggregation Service
Implements complete dataset fetching following FHIR Bundle.link pagination
"""

import asyncio
import json
import logging
import re
import time
from datetime import datetime
from typing import Dict, List, Any, Optional, Tuple
from urllib.parse import urlencode

from app.services import fhir
from app.services.http import get_json
from app.services.cache_manager import get_cache_manager
from app.services.schema import infer_columns, analyze_sample_values
from app.config import config

logger = logging.getLogger(__name__)

class AggregationProgress:
    """Track progress of dataset aggregation"""
    
    def __init__(self, dataset_id: str, resource_type: str, estimated_total: int = 0):
        self.dataset_id = dataset_id
        self.resource_type = resource_type
        self.status = "building"  # building, ready, error, truncated
        self.fetched = 0
        self.estimated_total = estimated_total
        self.started_at = datetime.now()
        self.completed_at: Optional[datetime] = None
        self.error_message: Optional[str] = None
        self.truncated = False
        self.build_time_ms = 0
    
    def update_progress(self, fetched: int, estimated_total: Optional[int] = None):
        """Update progress counters"""
        self.fetched = fetched
        if estimated_total is not None:
            self.estimated_total = estimated_total
    
    def complete(self, final_count: int, truncated: bool = False):
        """Mark aggregation as complete"""
        self.status = "truncated" if truncated else "ready"
        self.fetched = final_count
        self.estimated_total = final_count
        self.completed_at = datetime.now()
        self.truncated = truncated
        self.build_time_ms = int((self.completed_at - self.started_at).total_seconds() * 1000)
    
    def mark_error(self, error_message: str):
        """Mark aggregation as failed"""
        self.status = "error"
        self.error_message = error_message
        self.completed_at = datetime.now()
        self.build_time_ms = int((self.completed_at - self.started_at).total_seconds() * 1000)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert progress to dictionary"""
        progress_percent = 0
        if self.estimated_total > 0:
            progress_percent = min(100, int((self.fetched / self.estimated_total) * 100))
        
        return {
            "dataset_id": self.dataset_id,
            "resource_type": self.resource_type,
            "status": self.status,
            "fetched": self.fetched,
            "estimated_total": self.estimated_total,
            "progress_percent": progress_percent,
            "build_time_ms": self.build_time_ms,
            "started_at": self.started_at.isoformat(),
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "error_message": self.error_message,
            "truncated": self.truncated
        }

class AggregationService:
    """Service for building and managing aggregated FHIR resource datasets"""

    SCHEMA_SAMPLE_SIZE = 25
    
    def __init__(self):
        self.cache_manager = get_cache_manager()
        self.progress_tracking: Dict[str, AggregationProgress] = {}
        self._semaphore = asyncio.Semaphore(config.http_fetch_concurrency)
    
    async def build_dataset(self, resource_type: str, search_params: Dict[str, Any], 
                           user_id: str, server_id: str = "default") -> Dict[str, Any]:
        """Build complete dataset by following FHIR Bundle.link pagination"""
        
        # Generate cache key and check for existing dataset
        cache_key = self.cache_manager.generate_cache_key(
            env=config.environment or "dev",
            server_id=server_id,
            user_id=user_id,
            resource_type=resource_type,
            filters=search_params
        )
        
        # Check cache first
        cached_dataset = await self.cache_manager.get_dataset(cache_key)
        if cached_dataset:
            logger.info(f"Returning cached dataset: {cache_key}")
            return {
                "dataset_id": cached_dataset["dataset_id"],
                "total": len(cached_dataset["resources"]),
                "truncated": cached_dataset.get("truncated", False),
                "build_time_ms": 0,  # Cached
                "cache_hit": True
            }
        
        # Generate new dataset ID and start progress tracking
        dataset_id = self.cache_manager.get_dataset_id()
        progress = AggregationProgress(dataset_id, resource_type)
        self.progress_tracking[dataset_id] = progress
        
        logger.info(f"Starting dataset aggregation: {resource_type} with filters {search_params}")
        
        try:
            # Build the complete dataset
            resources, truncated = await self._fetch_all_resources(
                resource_type, search_params, progress
            )

            progress.complete(len(resources), truncated)
            
            # Store in cache
            dataset = {
                "dataset_id": dataset_id,
                "source_id": server_id,
                "resource_type": resource_type,
                "resources": resources,
                "search_params": search_params,
                "created_at": progress.started_at.isoformat(),
                "truncated": truncated,
                "status": progress.status,
                "build_time_ms": progress.build_time_ms,
                "warnings": []
            }
            
            await self.cache_manager.store_dataset(cache_key, dataset, config.cache_ttl_seconds)
            
            logger.info(f"Dataset build complete: {dataset_id} ({len(resources)} resources, "
                       f"{progress.build_time_ms}ms, truncated={truncated})")
            
            return {
                "dataset_id": dataset_id,
                "total": len(resources),
                "truncated": truncated,
                "build_time_ms": progress.build_time_ms,
                "cache_hit": False
            }
            
        except Exception as e:
            progress.mark_error(str(e))
            logger.error(f"Dataset aggregation failed for {dataset_id}: {e}")
            raise
    
    async def get_dataset_slice(self, dataset_id: str, offset: int, limit: int, 
                               user_id: str) -> Dict[str, Any]:
        """Get paginated slice of cached dataset"""
        dataset = await self._get_dataset_record(dataset_id, user_id)
        
        resources = dataset["resources"]
        total = len(resources)
        
        # Apply pagination slice
        end_offset = min(offset + limit, total)
        slice_items = resources[offset:end_offset]
        
        logger.debug(f"Dataset slice: {dataset_id} offset={offset} limit={limit} "
                    f"returned={len(slice_items)} total={total}")
        
        return {
            "dataset_id": dataset_id,
            "total": total,
            "offset": offset,
            "limit": limit,
            "items": slice_items,
            "has_next": end_offset < total,
            "has_prev": offset > 0,
            "truncated": dataset.get("truncated", False)
        }

    async def get_dataset_profile(self, dataset_id: str, user_id: str) -> Dict[str, Any]:
        """Return proposal-aligned metadata for a cached aggregate dataset."""
        dataset = await self._get_dataset_record(dataset_id, user_id)
        progress = self.progress_tracking.get(dataset_id)

        status = dataset.get("status") or ("truncated" if dataset.get("truncated", False) else "ready")
        progress_percent = 100
        build_time_ms = dataset.get("build_time_ms", 0)

        if progress:
            progress_data = progress.to_dict()
            status = progress_data.get("status", status)
            build_time_ms = progress_data.get("build_time_ms", build_time_ms)
            progress_percent = progress_data.get("progress_percent", progress_percent)

        if status != "building":
            progress_percent = 100

        return {
            "success": True,
            "dataset_id": dataset_id,
            "source_id": dataset.get("source_id", "default"),
            "resource_type": dataset["resource_type"],
            "status": status,
            "progress_percent": progress_percent,
            "total_records": len(dataset["resources"]),
            "truncated": dataset.get("truncated", False),
            "build_time_ms": build_time_ms,
            "created_at": dataset.get("created_at"),
            "warnings": dataset.get("warnings", [])
        }

    async def get_dataset_schema(self, dataset_id: str, user_id: str) -> Dict[str, Any]:
        """Infer a lightweight schema summary for a cached aggregate dataset."""
        dataset = await self._get_dataset_record(dataset_id, user_id)
        resources = dataset.get("resources", [])

        if not resources:
            return {
                "success": True,
                "dataset_id": dataset_id,
                "resource_type": dataset["resource_type"],
                "flatten_profile": "default",
                "columns": [],
                "sampled_records": 0,
                "warnings": [f"No cached {dataset['resource_type']} resources are available for schema inference."]
            }

        sampled_resources = resources[:self.SCHEMA_SAMPLE_SIZE]
        column_paths = infer_columns(sampled_resources, max_paths=200)
        warnings = []

        if len(resources) > len(sampled_resources):
            warnings.append(
                f"Schema inferred from the first {len(sampled_resources)} resources out of {len(resources)} cached resources."
            )

        return {
            "success": True,
            "dataset_id": dataset_id,
            "resource_type": dataset["resource_type"],
            "flatten_profile": "default",
            "columns": [self._build_column_definition(sampled_resources, path) for path in column_paths],
            "sampled_records": len(sampled_resources),
            "warnings": warnings
        }
    
    async def get_progress(self, dataset_id: str) -> Optional[Dict[str, Any]]:
        """Get progress information for dataset build"""
        progress = self.progress_tracking.get(dataset_id)
        return progress.to_dict() if progress else None
    
    async def delete_dataset(self, dataset_id: str, user_id: str) -> bool:
        """Delete dataset from cache"""
        cache_keys = await self.cache_manager.get_user_datasets(user_id)
        
        for cache_key in cache_keys:
            cached = await self.cache_manager.get_dataset(cache_key)
            if cached and cached["dataset_id"] == dataset_id:
                await self.cache_manager.delete_dataset(cache_key)
                logger.info(f"Deleted dataset: {dataset_id}")
                return True
        
        return False

    async def _get_dataset_record(self, dataset_id: str, user_id: str) -> Dict[str, Any]:
        """Find a cached dataset record for the given user."""
        cache_keys = await self.cache_manager.get_user_datasets(user_id)

        for cache_key in cache_keys:
            cached = await self.cache_manager.get_dataset(cache_key)
            if cached and cached["dataset_id"] == dataset_id:
                return cached

        raise ValueError(f"Dataset not found: {dataset_id}")

    def _build_column_definition(self, resources: List[Dict[str, Any]], path: str) -> Dict[str, Any]:
        """Build a stable column metadata object from sampled resources."""
        analysis = analyze_sample_values(resources, path)
        sample_values = analysis.get("sample_values", [])

        example_values: List[str] = []
        seen = set()
        for value in sample_values:
            rendered = self._stringify_sample_value(value)
            if rendered and rendered not in seen:
                seen.add(rendered)
                example_values.append(rendered)
            if len(example_values) >= 3:
                break

        return {
            "name": path,
            "path": path,
            "inferred_type": self._infer_logical_type(sample_values, path),
            "nullable": analysis.get("sample_count", 0) < len(resources),
            "repeated": "[" in path or any(isinstance(value, list) for value in sample_values),
            "example_values": example_values
        }

    def _infer_logical_type(self, sample_values: List[Any], path: str) -> str:
        """Infer a coarse logical type for a sampled column."""
        non_null_values = [value for value in sample_values if value is not None]

        if not non_null_values:
            return "date" if self._looks_like_date_path(path) else "string"
        if any(isinstance(value, list) for value in non_null_values):
            return "array"
        if any(isinstance(value, dict) for value in non_null_values):
            return "object"
        if all(isinstance(value, bool) for value in non_null_values):
            return "boolean"
        if all(isinstance(value, (int, float)) and not isinstance(value, bool) for value in non_null_values):
            return "number"
        if all(isinstance(value, str) for value in non_null_values):
            if all(self._looks_like_date_value(value) for value in non_null_values):
                return "date"

        return "date" if self._looks_like_date_path(path) else "string"

    def _looks_like_date_path(self, path: str) -> bool:
        """Use common FHIR date/time field names as a fallback type hint."""
        return any(token in path.lower() for token in ("date", "time", "issued", "effective", "recorded"))

    def _looks_like_date_value(self, value: str) -> bool:
        """Check whether a string resembles a FHIR date or datetime."""
        candidate = value.strip()
        if not candidate:
            return False

        if re.fullmatch(r"\d{4}(-\d{2}){0,2}", candidate):
            return True

        try:
            datetime.fromisoformat(candidate.replace("Z", "+00:00"))
            return True
        except ValueError:
            return False

    def _stringify_sample_value(self, value: Any) -> str:
        """Convert example values to stable strings for API responses."""
        if isinstance(value, (dict, list)):
            return json.dumps(value, sort_keys=True)
        return str(value)
    
    async def _fetch_all_resources(self, resource_type: str, search_params: Dict[str, Any],
                                  progress: AggregationProgress) -> Tuple[List[Dict], bool]:
        """Fetch all resources following FHIR Bundle.link pagination"""
        
        all_resources = []
        truncated = False
        
        # Build initial URL with search parameters
        base_url = fhir.base().rstrip('/')
        initial_params = {
            "_count": str(config.aggregate_page_count_hint),
            **search_params
        }
        
        next_url = f"{base_url}/{resource_type}?{urlencode(initial_params)}"
        
        # Track for timeout
        start_time = time.time()
        max_time = config.aggregate_max_build_time_seconds
        
        while next_url and len(all_resources) < config.aggregate_max_records:
            # Check timeout
            if time.time() - start_time > max_time:
                logger.warning(f"Dataset build timeout after {max_time}s, stopping at {len(all_resources)} resources")
                truncated = True
                break
            
            try:
                async with self._semaphore:  # Limit concurrency
                    bundle = await get_json(next_url, timeout=config.http_bundle_timeout_seconds)
                
                if not bundle or bundle.get("resourceType") != "Bundle":
                    logger.error(f"Invalid bundle response from {next_url}")
                    break
                
                # Extract resources from bundle
                resources = fhir.entries(bundle)
                resource_list = [r for r in resources if r.get("resourceType") == resource_type]
                all_resources.extend(resource_list)
                
                # Update progress
                bundle_total = bundle.get("total")
                if bundle_total and progress.estimated_total == 0:
                    progress.estimated_total = min(bundle_total, config.aggregate_max_records)
                
                progress.update_progress(len(all_resources))
                
                logger.debug(f"Fetched {len(resource_list)} resources from bundle, "
                           f"total so far: {len(all_resources)}")
                
                # Get next URL from Bundle.link
                next_url = fhir.next_link(bundle)
                
                # Prevent infinite loops
                if not next_url:
                    logger.debug("No next link found, pagination complete")
                    break
            
            except Exception as e:
                logger.error(f"Error fetching bundle from {next_url}: {e}")
                
                # Retry logic
                retries = getattr(self, '_current_retries', 0)
                if retries < config.http_max_retries:
                    self._current_retries = retries + 1
                    await asyncio.sleep(min(2 ** retries, 10))  # Exponential backoff
                    continue
                else:
                    # Max retries exceeded, stop aggregation
                    logger.error(f"Max retries exceeded, stopping aggregation at {len(all_resources)} resources")
                    break
        
        # Check if we hit the record limit
        if len(all_resources) >= config.aggregate_max_records:
            truncated = True
            all_resources = all_resources[:config.aggregate_max_records]
            logger.warning(f"Dataset truncated at {config.aggregate_max_records} records")
        
        self._current_retries = 0  # Reset retry counter
        return all_resources, truncated

# Global aggregation service instance
_aggregation_service: Optional[AggregationService] = None

def get_aggregation_service() -> AggregationService:
    """Get global aggregation service instance"""
    global _aggregation_service
    if _aggregation_service is None:
        _aggregation_service = AggregationService()
    return _aggregation_service
