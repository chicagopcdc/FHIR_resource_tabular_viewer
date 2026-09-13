from fastapi import APIRouter, HTTPException, Query
from typing import Dict, List, Optional
import httpx
import logging
from app.config import config
from app.services.schema import infer_columns
import asyncio
from app.services.http import get_json

router = APIRouter(prefix="/metadata", tags=["metadata"])
logger = logging.getLogger(__name__)

# Cache for metadata responses
_metadata_cache = {}
_resource_schema_cache = {}

@router.get("/capability-statement")
async def get_fhir_capability_statement(server_url: Optional[str] = None):
    """
    Fetch FHIR server's capability statement from /metadata endpoint
    Auto-discovers supported resources and their schemas
    """
    try:
        target_url = server_url or config.fhir_base_url
        metadata_url = f"{target_url.rstrip('/')}/metadata"
        
        # Check cache first
        if metadata_url in _metadata_cache:
            logger.info(f"Returning cached metadata for {metadata_url}")
            return _metadata_cache[metadata_url]
        
        logger.info(f"Fetching FHIR metadata from: {metadata_url}")
        
        # FIXED: Use our shared client with automatic retries
        capability_statement = await get_json(metadata_url, timeout_override=30.0)
            
        # Process and extract useful information
        processed_metadata = process_capability_statement(capability_statement)
        
        # Cache the result
        _metadata_cache[metadata_url] = processed_metadata
        
        return processed_metadata
            
    except httpx.HTTPError as e:
        logger.error(f"HTTP error fetching metadata: {str(e)}")
        raise HTTPException(status_code=503, detail=f"Failed to fetch FHIR metadata: {str(e)}")
    except Exception as e:
        logger.error(f"Error processing metadata: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error processing metadata: {str(e)}")

@router.get("/supported-resources")
async def get_supported_resources(server_url: Optional[str] = None):
    # ... (keep your existing get_supported_resources function as is)
    try:
        capability_statement = await get_fhir_capability_statement(server_url)
        
        return {
            "success": True,
            "server_url": server_url or config.fhir_base_url,
            "fhir_version": capability_statement.get("fhir_version", "Unknown"),
            "supported_resources": capability_statement.get("supported_resources", []),
            "total_resources": len(capability_statement.get("supported_resources", [])),
            "resource_details": capability_statement.get("resource_details", {})
        }
        
    except Exception as e:
        logger.error(f"Error getting supported resources: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/resource-schema/{resource_type}")
async def get_resource_schema(
    resource_type: str, 
    server_url: Optional[str] = None,
    sample_size: int = Query(default=10, description="Number of resources to sample for schema inference")
):
    """
    Get inferred schema for a specific FHIR resource type
    Uses both capability statement and sample data to build comprehensive schema
    """
    try:
        target_url = server_url or config.fhir_base_url
        cache_key = f"{target_url}:{resource_type}:{sample_size}"
        
        # Check cache first
        if cache_key in _resource_schema_cache:
            logger.info(f"Returning cached schema for {resource_type}")
            return _resource_schema_cache[cache_key]
        
        # Get capability statement first
        capability_statement = await get_fhir_capability_statement(server_url)
        resource_details = capability_statement.get("resource_details", {}).get(resource_type, {})
        
        # Fetch sample resources to infer actual schema
        sample_url = f"{target_url.rstrip('/')}/{resource_type}?_count={sample_size}"
        
        logger.info(f"Fetching sample {resource_type} resources from: {sample_url}")
        
        try:
            # FIXED: Use our shared client
            bundle = await get_json(sample_url, timeout_override=30.0)
            
            # Extract resources from bundle
            resources = []
            if bundle.get("resourceType") == "Bundle" and "entry" in bundle:
                resources = [entry["resource"] for entry in bundle["entry"] if "resource" in entry]
            elif bundle.get("resourceType") == resource_type:
                resources = [bundle]
            
            # Infer schema from sample resources
            inferred_columns = infer_columns(resources, max_paths=500) if resources else []
            
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                logger.warning(f"No {resource_type} resources found on server (404) - will return basic schema")
                resources = []
                # Return basic FHIR resource schema when no data available
                inferred_columns = get_basic_fhir_schema(resource_type)
            else:
                raise
            
        schema_info = {
            "success": True,
            "resource_type": resource_type,
            "server_url": target_url,
            "sample_size": len(resources),
            "capability_info": resource_details,
            "inferred_schema": {
                "total_columns": len(inferred_columns),
                "columns": inferred_columns[:100],
                "full_column_list": inferred_columns
            },
            "sample_data_available": len(resources) > 0,
            "schema_confidence": "high" if len(resources) >= sample_size else "low"
        }
        
        # Cache the result
        _resource_schema_cache[cache_key] = schema_info
        
        return schema_info
            
    except httpx.HTTPError as e:
        logger.error(f"HTTP error fetching {resource_type} schema: {str(e)}")
        raise HTTPException(status_code=503, detail=f"Failed to fetch {resource_type} data: {str(e)}")
    except Exception as e:
        logger.error(f"Error getting resource schema for {resource_type}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/bulk-resource-schemas")
async def get_bulk_resource_schemas(
    server_url: Optional[str] = None,
    resource_types: Optional[str] = Query(None, description="Comma-separated list of resource types"),
    sample_size: int = Query(default=5, description="Number of resources to sample per type")
):
    """
    Get schemas for multiple resource types in parallel
    Useful for building comprehensive frontend column configurations
    """
    try:
        target_url = server_url or config.fhir_base_url
        
        # Get supported resources if not specified
        if not resource_types:
            capability_statement = await get_fhir_capability_statement(server_url)
            supported_resources = capability_statement.get("supported_resources", [])
            # Focus on commonly used clinical resources
            priority_resources = [
                "Patient", "Observation", "DiagnosticReport", "DocumentReference", 
                "Condition", "Procedure", "MedicationRequest", "Encounter",
                "Immunization", "AllergyIntolerance"
            ]
            resource_list = [r for r in priority_resources if r in supported_resources][:8]
        else:
            resource_list = [r.strip() for r in resource_types.split(",")]
        
        logger.info(f"Fetching schemas for resources: {resource_list}")
        
        # Fetch schemas in parallel
        tasks = []
        for resource_type in resource_list:
            task = get_resource_schema(resource_type, server_url, sample_size)
            tasks.append(task)
        
        # Wait for all schemas
        schema_results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Process results
        schemas = {}
        errors = {}
        
        for i, result in enumerate(schema_results):
            resource_type = resource_list[i]
            if isinstance(result, Exception):
                errors[resource_type] = str(result)
                logger.error(f"Failed to get schema for {resource_type}: {result}")
            else:
                schemas[resource_type] = result
        
        return {
            "success": True,
            "server_url": target_url,
            "requested_resources": resource_list,
            "successful_schemas": len(schemas),
            "failed_schemas": len(errors),
            "schemas": schemas,
            "errors": errors if errors else None,
            "usage_note": "Use 'schemas[ResourceType].inferred_schema.full_column_list' for complete column definitions"
        }
        
    except Exception as e:
        logger.error(f"Error getting bulk resource schemas: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/cache")
async def clear_metadata_cache():
    """Clear all metadata and schema caches"""
    global _metadata_cache, _resource_schema_cache
    
    cache_stats = {
        "metadata_entries_cleared": len(_metadata_cache),
        "schema_entries_cleared": len(_resource_schema_cache)
    }
    
    _metadata_cache.clear()
    _resource_schema_cache.clear()
    
    logger.info("Metadata and schema caches cleared")
    
    return {
        "success": True,
        "message": "All metadata caches cleared",
        "statistics": cache_stats
    }

def get_basic_fhir_schema(resource_type: str) -> List[str]:
    """
    Return basic FHIR schema when no sample data is available
    """
    basic_fields = [
        "id",
        "resourceType", 
        "meta.versionId",
        "meta.lastUpdated",
        "meta.profile[0]",
        "text.status",
        "text.div"
    ]
    
    # Add resource-specific fields
    resource_specific = {
        "Condition": [
            "clinicalStatus.coding[0].system",
            "clinicalStatus.coding[0].code", 
            "clinicalStatus.coding[0].display",
            "verificationStatus.coding[0].system",
            "verificationStatus.coding[0].code",
            "verificationStatus.coding[0].display", 
            "code.coding[0].system",
            "code.coding[0].code",
            "code.coding[0].display",
            "code.text",
            "subject.reference",
            "encounter.reference",
            "onsetDateTime",
            "recordedDate"
        ],
        "Procedure": [
            "status",
            "code.coding[0].system", 
            "code.coding[0].code",
            "code.coding[0].display",
            "code.text",
            "subject.reference",
            "encounter.reference",
            "performedDateTime",
            "performer[0].actor.reference"
        ],
        "MedicationRequest": [
            "status",
            "intent", 
            "medicationCodeableConcept.coding[0].system",
            "medicationCodeableConcept.coding[0].code",
            "medicationCodeableConcept.coding[0].display",
            "medicationCodeableConcept.text",
            "subject.reference",
            "encounter.reference",
            "authoredOn",
            "requester.reference"
        ],
        "Immunization": [
            "status",
            "vaccineCode.coding[0].system",
            "vaccineCode.coding[0].code", 
            "vaccineCode.coding[0].display",
            "vaccineCode.text",
            "patient.reference",
            "encounter.reference",
            "occurrenceDateTime",
            "primarySource",
            "location.reference"
        ]
    }
    
    specific_fields = resource_specific.get(resource_type, [])
    return basic_fields + specific_fields

def process_capability_statement(capability_statement: Dict) -> Dict:
    """
    Process raw FHIR capability statement into useful format
    """
    try:
        fhir_version = capability_statement.get("fhirVersion", "Unknown")
        
        supported_resources = []
        resource_details = {}
        
        # Extract supported resources from rest.resource
        for rest in capability_statement.get("rest", []):
            for resource in rest.get("resource", []):
                resource_type = resource.get("type")
                if resource_type:
                    supported_resources.append(resource_type)
                    
                    # Extract detailed information
                    resource_details[resource_type] = {
                        "interactions": [i.get("code") for i in resource.get("interaction", [])],
                        "search_params": [
                            {
                                "name": p.get("name"),
                                "type": p.get("type"),
                                "definition": p.get("definition")
                            } for p in resource.get("searchParam", [])
                        ],
                        "versioning": resource.get("versioning"),
                        "conditional_create": resource.get("conditionalCreate", False),
                        "conditional_update": resource.get("conditionalUpdate", False),
                        "conditional_delete": resource.get("conditionalDelete")
                    }
        
        # Remove duplicates and sort
        supported_resources = sorted(list(set(supported_resources)))
        
        return {
            "fhir_version": fhir_version,
            "server_name": capability_statement.get("software", {}).get("name", "Unknown"),
            "server_version": capability_statement.get("software", {}).get("version", "Unknown"),
            "supported_resources": supported_resources,
            "total_resources": len(supported_resources),
            "resource_details": resource_details,
            "publisher": capability_statement.get("publisher", "Unknown"),
            "date": capability_statement.get("date"),
            "raw_capability_statement": capability_statement  # Include full response for advanced users
        }
        
    except Exception as e:
        logger.error(f"Error processing capability statement: {str(e)}")
        return {
            "fhir_version": "Unknown",
            "supported_resources": [],
            "total_resources": 0,
            "resource_details": {},
            "error": f"Failed to process capability statement: {str(e)}"
        }