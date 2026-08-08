# app/routers/filters.py - Fully config-driven dynamic filtering
from fastapi import APIRouter, HTTPException, Query
from typing import Dict, List, Any, Optional
from collections import defaultdict
from app.services.path_extractor import extract_values_by_path
import logging
from datetime import datetime, timedelta
from app.services import fhir
from app.config import FILTER_DEFINITIONS, get_config


router = APIRouter(prefix="/filters", tags=["filters"])
logger = logging.getLogger(__name__)

@router.get("/targets")
async def get_filter_targets():
    """
    Get all available filter targets from configuration.
    Returns the resource types that have filter definitions in config.yaml
    """
    try:
        # Extract unique resource types from filter definitions
        resource_types = list(set(
            filter_def.get("resource") 
            for filter_def in FILTER_DEFINITIONS 
            if filter_def.get("resource")
        ))
        
        # Group filter definitions by resource type
        grouped_by_resource = defaultdict(list)
        for filter_def in FILTER_DEFINITIONS:
            resource_type = filter_def.get("resource")
            if resource_type:
                grouped_by_resource[resource_type].append({
                    "element": filter_def.get("element"),
                    "path": filter_def.get("path"),
                    "display_path": filter_def.get("display_path"),
                    "category_filter": filter_def.get("category_filter"),
                    "description": filter_def.get("description"),
                    "search_parameter": filter_def.get("search_parameter")
                })
        
        return {
            "success": True,
            "resource_types": resource_types,
            "grouped_by_resource": dict(grouped_by_resource),
            "total_filters": len(FILTER_DEFINITIONS),
            "generated_at": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error getting filter targets: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/ui-config")
async def get_filter_ui_config():
    """
    Get filter UI configuration from config.yaml
    """
    try:
        config = get_config()
        ui_config = config.get('filter_ui', {})
        
        return {
            "success": True,
            "ui_config": ui_config
        }
        
    except Exception as e:
        logger.error(f"Error getting filter UI config: {str(e)}")
        return {
            "success": False,
            "ui_config": {"sections": []},
            "message": str(e)
        }

@router.get("/{resource_type}/metadata")
async def get_filter_metadata(
    resource_type: str, 
    sample_size: int = Query(50, ge=10, le=200)
):
    """
     filter metadata for a specific resource type based on config.yaml definitions
    """
    try:
        logger.info(f"Generating filter metadata for {resource_type} (sample: {sample_size})")
        
        # Find filter definitions for this resource type from config
        config_filters = [
            filter_def for filter_def in FILTER_DEFINITIONS 
            if filter_def.get('resource') == resource_type
        ]
        
        if not config_filters:
            return {
                "success": True,
                "resource_type": resource_type,
                "filters": [],
                "message": f"No filter definitions found in config for {resource_type}"
            }
        
        # Fetch sample data from FHIR server
        base_url = fhir.base().rstrip('/') + '/'
        url = base_url + resource_type
        params = {"_count": str(sample_size)}
        
        logger.info(f"Fetching sample data from: {url}")
        bundle = await fhir.fetch_bundle_with_deferred_handling(url, params)
        
        if not isinstance(bundle, dict) or bundle.get("resourceType") != "Bundle":
            raise HTTPException(status_code=502, detail="Invalid response from FHIR server")
        
        resources = fhir.entries(bundle)
        
        if not resources:
            return {
                "success": True,
                "resource_type": resource_type,
                "filters": [],
                "message": f"No {resource_type} resources found for filter analysis"
            }
        
        # Build filters from config definitions
        filters = []
        for filter_config in config_filters:
            try:
                filter_ui = build_filter_from_config(filter_config, resources)
                if filter_ui:
                    filters.append(filter_ui)
            except Exception as e:
                logger.warning(f"Error building filter for {filter_config.get('element', 'unknown')}: {str(e)}")
                continue
        
        return {
            "success": True,
            "resource_type": resource_type,
            "sample_size": len(resources),
            "filters": filters,
            "config_filters_used": len(config_filters),
            "generated_at": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error generating filter metadata for {resource_type}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

def build_filter_from_config(filter_config: Dict, resources: List[Dict]) -> Optional[Dict]:
    """
    Build a filter definition from config and live FHIR data
    """
    try:
        element = filter_config.get('element')
        path = filter_config.get('path')
        display_path = filter_config.get('display_path', path)
        category_filter = filter_config.get('category_filter')

        if not element or not path:
            logger.warning(f"Filter config missing required fields: element={element}, path={path}")
            return None


        # Extract values from resources
        values = []
        display_values = []

        for resource in resources:
            # Apply category filter if specified (for Observation resources)
            if category_filter:
                resource_categories = extract_values_by_path([resource], 'category[0].coding[0].code') or []
                if not resource_categories or category_filter not in resource_categories:
                    continue

            # Extract raw values and display values
            raw_vals = extract_values_by_path([resource], path) or []
            disp_vals = extract_values_by_path([resource], display_path) or []

            # Process extracted values
            for i, rv in enumerate(raw_vals):
                if not rv:
                    continue
                values.append(str(rv))
                # Use display value if available, otherwise use raw value
                dv = disp_vals[i] if i < len(disp_vals) and disp_vals[i] else rv
                display_values.append(str(dv))

        if not values:
            logger.info(f"No values found for filter {element}")
            return None

        # Create options
        options = create_filter_options(values, display_values)

        return {
            "key": element,
            "label": format_label(element),
            "type": "multi_select",
            "description": filter_config.get('description', f"Filter by {element}"),
            "options": options,
            "ui_component": "searchable_multi_select" if len(options) > 10 else "checkbox_group",
            "search_parameter": filter_config.get('search_parameter'),
            "source": "config"
        }

    except Exception as e:
        logger.error(f"Error building filter from config: {str(e)}")
        return None


def create_filter_options(values: List[str], display_values: List[str] = None) -> List[Dict]:
    """
    Create normalized filter options with counts
    """
    if not values:
        return []
    
    # Count occurrences
    value_counts = {}
    display_mapping = {}
    
    for i, value in enumerate(values):
        if value:
            value_counts[value] = value_counts.get(value, 0) + 1
            
            # Map to display value if available
            if display_values and i < len(display_values) and display_values[i]:
                display_mapping[value] = display_values[i]
    
    # Create options
    options = []
    for value, count in value_counts.items():
        label = display_mapping.get(value, value)
        
        options.append({
            "value": value,
            "label": str(label),
            "count": count
        })
    
    # Sort by count (descending) then by label
    options.sort(key=lambda x: (-x["count"], x["label"].lower()))
    
    return options

def format_label(text: str) -> str:
    """Convert field name to readable label"""
    if not text:
        return ""
    
    # Convert snake_case and camelCase to Title Case
    import re
    # Handle camelCase
    text = re.sub(r'([a-z])([A-Z])', r'\1 \2', text)
    # Handle snake_case and kebab-case
    text = text.replace('_', ' ').replace('-', ' ')
    # Title case
    return ' '.join(word.capitalize() for word in text.split())