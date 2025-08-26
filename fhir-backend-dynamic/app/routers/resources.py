from fastapi import APIRouter, HTTPException, Query, Request
from typing import Optional, Dict, List
from urllib.parse import urlparse, parse_qs
from app.services import fhir
from app.services.http import get_json
from app.services.schema import infer_columns
from app.services.errors import map_operation_outcome
import logging

router = APIRouter(prefix="/resources", tags=["resources"])
logger = logging.getLogger(__name__)

def _extract_operation_outcome_text(resp_dict: Dict) -> str:
    """Extract readable error message from OperationOutcome"""
    try:
        if isinstance(resp_dict, dict) and resp_dict.get("resourceType") == "OperationOutcome":
            issues = resp_dict.get("issue", [])
            if issues and isinstance(issues, list):
                first = issues[0]
                return (
                    first.get("diagnostics")
                    or (first.get("details") or {}).get("text")
                    or str(resp_dict)
                )
        return str(resp_dict)
    except Exception:
        return "Unknown error"

def _separate_patient_fields(patient: Dict) -> Dict:
    """Separate patient fields into fixed and dynamic categories"""
    fixed_fields = {
        'id', 'resourceType', 'meta', 'text', 'identifier', 'active',
        'name', 'telecom', 'gender', 'birthDate', 'address', 'photo',
        'maritalStatus', 'multipleBirthBoolean', 'multipleBirthInteger',
        'contact', 'communication', 'generalPractitioner', 'managingOrganization'
    }

    fixed, dynamic = {}, {}
    for key, value in patient.items():
        if key in fixed_fields:
            fixed[key] = value
        else:
            dynamic[key] = value

    return {'fixed': fixed, 'dynamic': dynamic, 'all': patient}

@router.get("")
async def list_resources(exclude: Optional[str] = None):
    """Get all available resource types from FHIR server capabilities"""
    try:
        cap = await fhir.get_capabilities()
        types = fhir.list_resource_types(cap)

        if exclude:
            excluded = set([x.strip() for x in exclude.split(",") if x.strip()])
            types = [t for t in types if t not in excluded]

        return {"success": True, "data": types}
    except Exception as e:
        logger.error(f"Error in list_resources: {str(e)}")
        return {
            "success": False,
            "message": f"Failed to retrieve resource types: {str(e)}",
            "data": []
        }

@router.get("/{resource_type}/schema")
async def resource_schema(
    resource_type: str,
    sample_size: int = Query(20, ge=1, le=50, alias="sample_size")
):
    """Get dynamic schema for any resource type"""
    try:
        # FIXED: Proper URL construction without urljoin
        base_url = fhir.base().rstrip('/') + '/'
        url = base_url + resource_type

        params = {"_count": str(sample_size), "_sort": "-_lastUpdated"}

        bundle = await get_json(url, None, params=params)

        if not isinstance(bundle, dict):
            raise HTTPException(status_code=502, detail="Invalid response from FHIR server")

        entries = bundle.get("entry", [])
        resources = [
            e.get("resource") for e in entries
            if isinstance(e, dict) and isinstance(e.get("resource"), dict)
        ]

        if not resources:
            return {
                "success": True,
                "resource_type": resource_type,
                "schema": {
                    "columns": ["id", "resourceType"],
                    "warnings": [f"No {resource_type} resources found for schema inference."]
                }
            }

        columns = infer_columns(resources, max_paths=200)

        return {
            "success": True,
            "resource_type": resource_type,
            "schema": {"columns": columns}
        }

    except Exception as e:
        logger.error(f"Error in resource_schema: {str(e)}")
        return {
            "success": False,
            "message": f"Schema inference failed: {str(e)}",
            "resource_type": resource_type,
            "schema": {"columns": []}
        }

@router.get("/{resource_type}")
async def search_resources(
    resource_type: str,
    _count: int = Query(50, ge=1, le=100),
    _getpages: Optional[str] = Query(None),
    _getpagesoffset: Optional[int] = Query(None, ge=0),
    request: Request = None
):
    """Search any resource type with proper pagination handling."""
    try:
        params: Dict[str, str] = {}

        # FIXED: Proper URL construction
        base_url = fhir.base().rstrip('/') + '/'

        # Handle pagination tokens from server
        if _getpages:
            url = base_url
            params["_getpages"] = _getpages
            params["_getpagesoffset"] = str(_getpagesoffset or 0)
            params["_count"] = str(_count)
            params["_bundletype"] = "searchset"
        else:
            url = base_url + resource_type
            params["_count"] = str(_count)

            # Pass through any client query params (except paging internals)
            if request:
                for k, v in request.query_params.items():
                    if k not in ("_count", "_getpagesoffset", "_getpages"):
                        params[k] = v

            # Use minimal parameters that work reliably
            # Don't request _total=accurate as it times out on 3.5M+ patients
            # params["_total"] = "accurate"  # Causes 500 errors - removed
            
            # Keep it simple for maximum compatibility

        logger.info(f"Searching {resource_type} with params: {params}")
        
        # Use the enhanced bundle fetching to handle deferred pagination
        bundle = await fhir.fetch_bundle_with_deferred_handling(url, params)

        # OperationOutcome handling
        if isinstance(bundle, dict) and bundle.get("resourceType") == "OperationOutcome":
            error_text = _extract_operation_outcome_text(bundle)
            logger.error(f"FHIR error: {error_text}")
            return {
                "success": False,
                "message": f"FHIR server error: {error_text}",
                "resource_type": resource_type,
                "data": [],
                "pagination": {"count": 0, "has_next": False, "total": None}
            }

        # Extract entries from current page using the proper fhir.entries() function
        data = fhir.entries(bundle)
        logger.info(f"Extracted {len(data)} {resource_type} resources from bundle")

        # Get pagination info
        pagination = fhir.normalize_pagination(bundle)
        
        # CRITICAL: Get the accurate total from the bundle
        bundle_total = bundle.get("total")
        if bundle_total is not None:
            pagination["total"] = bundle_total
            logger.info(f"Server reports total: {bundle_total}")
        else:
            pagination["total"] = len(data)
            logger.warning("No total provided by server, using current page count")

        # Get next/prev links
        next_link = fhir.next_link(bundle)
        prev_link = fhir.prev_link(bundle)

        def _extract_pagination_params(u: Optional[str]):
            if not u:
                return None
            qs = parse_qs(urlparse(u).query)
            out = {}
            for k, v in qs.items():
                if isinstance(v, list) and v:
                    out[k] = v[0]
            return out

        pagination.update({
            "offset": _getpagesoffset or 0,
            "count": len(data),
            "has_next": bool(next_link),
            "has_prev": bool(prev_link),
            "next_query": _extract_pagination_params(next_link),
            "prev_query": _extract_pagination_params(prev_link),
        })

        logger.info(f"Pagination info: total={pagination.get('total')}, has_next={pagination.get('has_next')}, has_prev={pagination.get('has_prev')}")

        return {
            "success": True,
            "resource_type": resource_type,
            "data": data,
            "pagination": pagination
        }

    except Exception as e:
        logger.error(f"Error in search_resources: {str(e)}")
        return {
            "success": False,
            "message": f"Search failed: {str(e)}",
            "resource_type": resource_type,
            "data": [],
            "pagination": {"count": 0, "has_next": False, "total": None}
        }

@router.get("/{resource_type}/page")
async def page_resource(resource_type: str, page_url: str):
    """Follow FHIR Bundle pagination links"""
    try:
        # FIXED: Proper URL validation
        base = fhir.base().rstrip('/')
        if not (page_url.startswith(base) or page_url.startswith(base + "/")):
            raise HTTPException(status_code=400, detail="Invalid page_url")

        bundle = await get_json(page_url, None, params=None)

        if isinstance(bundle, dict) and bundle.get("resourceType") == "OperationOutcome":
            error_text = _extract_operation_outcome_text(bundle)
            return {
                "success": False,
                "message": f"FHIR server error: {error_text}",
                "resource_type": resource_type,
                "data": [],
                "pagination": {"count": 0, "has_next": False, "total": None}
            }

        data = fhir.entries(bundle)
        pagination = fhir.normalize_pagination(bundle)
        pagination["total"] = bundle.get("total")

        return {
            "success": True,
            "resource_type": resource_type,
            "data": data,
            "pagination": pagination
        }

    except Exception as e:
        logger.error(f"Error in page_resource: {str(e)}")
        return {
            "success": False,
            "message": f"Pagination failed: {str(e)}",
            "resource_type": resource_type,
            "data": [],
            "pagination": {"count": 0, "has_next": False, "total": None}
        }

@router.get("/{resource_type}/{id}")
async def read_resource(resource_type: str, id: str):
    """Read a specific resource by ID"""
    try:
        # FIXED: Proper URL construction
        base_url = fhir.base().rstrip('/') + '/'
        url = base_url + f"{resource_type}/{id}"
        
        resource = await get_json(url, None)

        if isinstance(resource, dict) and resource.get("resourceType") == "OperationOutcome":
            error_text = _extract_operation_outcome_text(resource)
            return {
                "success": False,
                "message": f"FHIR server error: {error_text}",
                "data": None
            }

        return {"success": True, "data": resource}
    except Exception as e:
        logger.error(f"Error in read_resource: {str(e)}")
        return {
            "success": False,
            "message": f"Resource read failed: {str(e)}",
            "data": None
        }

@router.get("/{resource_type}/{id}/detailed")
async def read_resource_detailed(resource_type: str, id: str):
    """Read a specific resource with field separation (for Patient details view)"""
    try:
        logger.info(f"Fetching detailed {resource_type} with ID: {id}")
        
        # FIXED: Proper URL construction
        base_url = fhir.base().rstrip('/') + '/'
        url = base_url + f"{resource_type}/{id}"
        
        logger.info(f"Making request to URL: {url}")
        resource = await get_json(url, None)
        
        logger.info(f"Response type: {type(resource)}")
        if isinstance(resource, dict):
            logger.info(f"Resource type from server: {resource.get('resourceType')}")

        if isinstance(resource, dict) and resource.get("resourceType") == "OperationOutcome":
            error_text = _extract_operation_outcome_text(resource)
            logger.error(f"FHIR error: {error_text}")
            return {
                "success": False,
                "message": f"FHIR server error: {error_text}",
                "fixed": {},
                "dynamic": {},
                "all": None
            }

        if resource_type.lower() == "patient" and isinstance(resource, dict):
            logger.info("Separating patient fields")
            separated = _separate_patient_fields(resource)
            logger.info(f"Fixed fields count: {len(separated['fixed'])}")
            logger.info(f"Dynamic fields count: {len(separated['dynamic'])}")
            return {
                "success": True,
                "fixed": separated["fixed"],
                "dynamic": separated["dynamic"], 
                "all": separated["all"],
                "resource_type": resource_type
            }

        logger.info(f"Returning non-patient resource: {resource_type}")
        return {
            "success": True,
            "fixed": {},
            "dynamic": resource if resource else {},
            "all": resource,
            "resource_type": resource_type
        }

    except Exception as e:
        logger.error(f"Error in read_resource_detailed: {str(e)}", exc_info=True)
        return {
            "success": False,
            "message": f"Resource read failed: {str(e)}",
            "fixed": {},
            "dynamic": {},
            "all": None
        }

@router.get("/{resource_type}/test")
async def test_resource_connection(resource_type: str):
    """Test endpoint to verify basic server connectivity and response"""
    try:
        base_url = fhir.base().rstrip('/') + '/'
        
        # Test with minimal parameters
        test_queries = [
            {"_count": "10"},  # Basic query
            {"_count": "10", "_total": "accurate"},  # With total
            {"_count": "50"},  # Your current default
        ]
        
        results = {}
        for i, params in enumerate(test_queries):
            try:
                url = base_url + resource_type
                logger.info(f"Testing query {i+1}: {url} with {params}")
                
                bundle = await get_json(url, None, params=params)
                
                results[f"query_{i+1}"] = {
                    "params": params,
                    "success": True,
                    "entries_count": len(bundle.get("entry", [])),
                    "total": bundle.get("total"),
                    "bundle_type": bundle.get("type"),
                    "has_next": bool(fhir.next_link(bundle))
                }
            except Exception as e:
                results[f"query_{i+1}"] = {
                    "params": params,
                    "success": False,
                    "error": str(e)
                }
        
        return {
            "success": True,
            "resource_type": resource_type,
            "server_base": base_url,
            "test_results": results
        }
        
    except Exception as e:
        logger.error(f"Test error: {str(e)}")
        return {
            "success": False,
            "message": str(e),
            "resource_type": resource_type
        }

@router.get("/{resource_type}/debug")
async def debug_resource_pagination(resource_type: str):
    """Debug endpoint to check actual pagination behavior"""
    try:
        base_url = fhir.base().rstrip('/') + '/'
        
        # Test different page sizes and parameters
        test_results = {}
        
        for count in [10, 50, 100, 200]:
            url = base_url + resource_type
            params = {
                "_count": str(count),
                "_total": "accurate",
                "_summary": "count"
            }
            
            try:
                bundle = await get_json(url, None, params=params)
                
                test_results[f"count_{count}"] = {
                    "requested_count": count,
                    "actual_entries": len(bundle.get("entry", [])),
                    "total_from_server": bundle.get("total"),
                    "has_next_link": bool(fhir.next_link(bundle)),
                    "bundle_type": bundle.get("type"),
                    "links": [{"relation": link.get("relation"), "url": link.get("url")} 
                             for link in bundle.get("link", [])]
                }
            except Exception as e:
                test_results[f"count_{count}"] = {"error": str(e)}
        
        # Test direct capabilities query
        try:
            cap_url = base_url + "metadata"
            capabilities = await get_json(cap_url, None)
            
            # Look for resource limits in capabilities
            resource_limits = None
            for rest in capabilities.get("rest", []):
                for resource in rest.get("resource", []):
                    if resource.get("type") == resource_type:
                        resource_limits = {
                            "interactions": [i.get("code") for i in resource.get("interaction", [])],
                            "search_params": len(resource.get("searchParam", [])),
                            "versioning": resource.get("versioning"),
                            "conditional_create": resource.get("conditionalCreate"),
                            "conditional_update": resource.get("conditionalUpdate")
                        }
                        break
            
            test_results["capabilities"] = {
                "fhir_version": capabilities.get("fhirVersion"),
                "resource_limits": resource_limits,
                "server_name": capabilities.get("software", {}).get("name"),
                "server_version": capabilities.get("software", {}).get("version")
            }
        except Exception as e:
            test_results["capabilities"] = {"error": str(e)}
        
        return {
            "success": True,
            "resource_type": resource_type,
            "server_base": base_url,
            "debug_results": test_results
        }
        
    except Exception as e:
        logger.error(f"Debug error: {str(e)}")
        return {
            "success": False,
            "message": str(e),
            "resource_type": resource_type
        }