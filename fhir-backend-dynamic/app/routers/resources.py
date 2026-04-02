from fastapi import APIRouter, HTTPException, Query, Request
from typing import Optional, Dict, List
from urllib.parse import urlparse, parse_qs
from app.services import fhir
from app.services.http import get_json
from app.services.schema import infer_columns
from app.services.errors import map_operation_outcome
from app.config import config
from app.services.resource_discovery import resource_discovery
from app.services.data_availability import data_availability
import logging
import re
import asyncio
from datetime import datetime, timedelta

router = APIRouter(prefix="/resources", tags=["resources"])
logger = logging.getLogger(__name__)

# Simple in-memory cache for patient pagination
_patient_cache = {}
_cache_expiry = {}
CACHE_DURATION = timedelta(minutes=config.patient_cache_duration_minutes)

# Configuration cache
_config_cache = {
    "fhir_version": None,
    "server_info": None,
    "supported_resources": None,
    "cached_at": None
}
CONFIG_CACHE_DURATION = timedelta(hours=config.config_cache_duration_hours)

def _get_cache_key(params: Dict[str, str]) -> str:
    """Generate cache key from parameters - FIXED: Include filter parameters"""
    # Create a stable cache key that includes filter parameters
    cache_params = []
    
    # Always include pagination params
    cache_params.append(f"count_{params.get('_count', '50')}")
    cache_params.append(f"offset_{params.get('_getpagesoffset', '0')}")
    
    # Include search/filter parameters
    filter_keys = ['name', 'gender', 'birthdate', '_id', '_has', 'telecom']
    for key in sorted(filter_keys):
        if key in params:
            cache_params.append(f"{key}_{params[key]}")
    
    # Include sort
    if '_sort' in params:
        cache_params.append(f"sort_{params['_sort']}")
    
    # Only cache if it's not too complex (max 6 parameters)
    if len(cache_params) <= 6:
        cache_key = "patients_" + "_".join(cache_params)
        logger.debug(f"Generated cache key: {cache_key}")
        return cache_key
    
    logger.debug("Query too complex for caching")
    return None

def _get_cached_response(cache_key: str) -> Optional[Dict]:
    """Get cached response if valid"""
    if cache_key and cache_key in _patient_cache:
        if datetime.now() < _cache_expiry.get(cache_key, datetime.min):
            logger.info(f"Cache hit for {cache_key}")
            return _patient_cache[cache_key]
        else:
            # Cache expired, remove it
            _patient_cache.pop(cache_key, None)
            _cache_expiry.pop(cache_key, None)
    return None

def _cache_response(cache_key: str, response: Dict):
    """Cache a response"""
    if cache_key:
        _patient_cache[cache_key] = response
        _cache_expiry[cache_key] = datetime.now() + CACHE_DURATION
        logger.info(f"Cached response for {cache_key}")
        
        # Clean up old cache entries (keep max config.max_cache_entries entries)
        if len(_patient_cache) > config.max_cache_entries:
            oldest_key = min(_cache_expiry.keys(), key=lambda k: _cache_expiry[k])
            _patient_cache.pop(oldest_key, None)
            _cache_expiry.pop(oldest_key, None)

async def _prefetch_next_page(current_params: Dict[str, str], pagination: Dict):
    """Background prefetch of the next page"""
    try:
        if not pagination.get("has_next"):
            return
            
        # Calculate next page parameters
        count = int(current_params.get("_count", "50"))
        current_offset = int(current_params.get("_getpagesoffset", "0"))
        next_offset = current_offset + count
        
        next_params = current_params.copy()
        next_params["_getpagesoffset"] = str(next_offset)
        
        next_cache_key = _get_cache_key(next_params)
        if next_cache_key and not _get_cached_response(next_cache_key):
            logger.info(f"Background prefetching next page: offset {next_offset}")
            
            # Fetch next page in background
            base_url = fhir.base().rstrip('/') + '/'
            url = base_url + "Patient"
            bundle = await fhir.fetch_bundle_with_deferred_handling(url, next_params)
            
            if bundle and not isinstance(bundle, dict) or bundle.get("resourceType") != "OperationOutcome":
                # Process and cache the response
                all_resources = fhir.entries(bundle)
                patients = [r for r in all_resources if r.get("resourceType") == "Patient"]
                next_pagination = fhir.normalize_pagination(bundle)
                
                next_response = {
                    "success": True,
                    "resource_type": "Patient", 
                    "data": patients,
                    "pagination": next_pagination,
                    "prioritized": False
                }
                _cache_response(next_cache_key, next_response)
                logger.info(f"Successfully prefetched and cached next page")
                
    except Exception as e:
        logger.debug(f"Prefetch failed (non-critical): {e}")

# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------

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

def is_uuid_format(patient_id: str) -> bool:
    """Check if ID follows UUID format pattern (case-insensitive)"""
    if not patient_id:
        return False
    uuid_pattern = r'^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$'
    return bool(re.match(uuid_pattern, patient_id))

async def calculate_patient_data_score(patient_id: str) -> int:
    """Calculate data richness score for a patient by checking just the top resource types quickly"""
    score = 0
    base_url = fhir.base().rstrip('/') + '/'
    
    # Only check the most important resource types for speed
    resource_checks = [
        ('Observation', 5),  # High value - clinical measurements
        ('Condition', 4),    # High value - diagnoses
    ]
    
    for resource_type, points in resource_checks:
        try:
            # Quick check - just get count, don't fetch all data
            url = f"{base_url}{resource_type}"
            params = {"subject": f"Patient/{patient_id}", "_count": "0", "_summary": "count"}
            result = await fhir.fetch_bundle_with_deferred_handling(url, params)
            
            if isinstance(result, dict) and result.get("total", 0) > 0:
                resource_count = result.get("total", 0)
                # Simple scoring - having any resources gives points
                score += points
                if resource_count > 5:
                    score += 1  # Small bonus for having many resources
                
        except Exception as e:
            # Don't let individual resource checks break the whole scoring
            logger.debug(f"Error checking {resource_type} for patient {patient_id}: {e}")
            continue
    
    return score

async def sort_patients_by_data_richness(patients: List[Dict]) -> List[Dict]:
    """Sort patients by data richness score (highest first)"""
    if not patients:
        return patients
    
    # Limit number of patients to score to avoid timeouts (score max 20 patients)
    max_to_score = min(len(patients), 20)
    patients_to_score = patients[:max_to_score]
    remaining_patients = patients[max_to_score:] if len(patients) > max_to_score else []
    
    logger.info(f"Calculating data scores for {len(patients_to_score)} patients (limiting to first {max_to_score})...")
    
    # Calculate scores for limited set of patients
    patient_scores = []
    for patient in patients_to_score:
        patient_id = patient.get('id')
        if patient_id:
            try:
                score = await calculate_patient_data_score(patient_id)
                patient_scores.append((patient, score))
                logger.debug(f"Patient {patient_id}: data score {score}")
            except Exception as e:
                logger.warning(f"Error scoring patient {patient_id}: {e}")
                patient_scores.append((patient, 0))  # Default to 0 if scoring fails
        else:
            patient_scores.append((patient, 0))
    
    # Sort scored patients by score (highest first), then by ID for consistent ordering
    patient_scores.sort(key=lambda x: (-x[1], x[0].get('id', '')))
    
    sorted_patients = [patient for patient, score in patient_scores]
    
    # Add remaining unscored patients at the end
    if remaining_patients:
        sorted_patients.extend(remaining_patients)
    
    # Log the top few for debugging
    top_scores = [(p.get('id'), s) for p, s in patient_scores[:5]]
    logger.info(f"Top data-rich patients: {top_scores}")
    
    return sorted_patients

def _filter_patients_by_resources(patients: List[Dict], all_resources: List[Dict], query_params: Dict[str, str]) -> List[Dict]:
    """Filter patients to only include those that have the specified resources"""
    data_availability = query_params.get("data_availability", "")
    if not data_availability.strip():
        return patients
    
    # Parse the required resource types
    required_resources = []
    resource_filters = [r.strip() for r in data_availability.split(",") if r.strip()]
    for resource_filter in resource_filters:
        if resource_filter.startswith("has_"):
            required_resources.append(resource_filter[4:])  # Remove "has_" prefix
    
    if not required_resources:
        return patients
    
    # Create a mapping of patient ID to their resources
    patient_resources = {}
    for patient in patients:
        patient_id = patient.get("id")
        if patient_id:
            patient_resources[patient_id] = set()
    
    # Go through all resources and map them to patients
    for resource in all_resources:
        if resource.get("resourceType") == "Patient":
            continue
            
        resource_type = resource.get("resourceType")
        if not resource_type:
            continue
            
        # Extract patient reference
        patient_id = None
        for field in ["subject", "patient"]:
            ref = resource.get(field, {})
            if isinstance(ref, dict) and ref.get("reference"):
                ref_str = ref["reference"]
                if ref_str.startswith("Patient/"):
                    patient_id = ref_str.replace("Patient/", "")
                    break
                elif "/" not in ref_str:  # Assume bare ID
                    patient_id = ref_str
                    break
        
        # Add resource type to patient's set
        if patient_id and patient_id in patient_resources:
            patient_resources[patient_id].add(resource_type)
    
    # Filter patients to only those with ALL required resources
    filtered_patients = []
    for patient in patients:
        patient_id = patient.get("id")
        if patient_id and patient_id in patient_resources:
            patient_resource_types = patient_resources[patient_id]
            # Check if patient has ALL required resource types
            if all(req_resource in patient_resource_types for req_resource in required_resources):
                filtered_patients.append(patient)
    
    logger.info(f"Filtered {len(patients)} patients to {len(filtered_patients)} with required resources: {required_resources}")
    return filtered_patients

def process_search_parameters(query_params: Dict[str, str], resource_type: str) -> Dict[str, str]:
    """Process search parameters from frontend (search box, etc.) - FIXED: Better filter handling"""
    processed: Dict[str, str] = {}
    revinclude_resources = []
    
    logger.info(f"Processing search parameters: {query_params}")
    
    for key, value in query_params.items():
        if key in ("_count", "_getpagesoffset", "_getpages", "top_n", "fetch_all"):
            continue

        if key in ("search", "q", "query"):
            if value and value.strip():
                search_term = value.strip()
                if resource_type.lower() == "patient":
                    if is_uuid_format(search_term):
                        processed["_id"] = search_term
                    elif search_term.isdigit() or (len(search_term) > 6 and " " not in search_term):
                        # If it's all digits (like "1200") or a long string without spaces, treat as ID
                        processed["_id"] = search_term
                    elif "@" in search_term:
                        processed["telecom"] = search_term
                    else:
                        processed["name"] = search_term
                else:
                    processed["_text"] = search_term
        elif key == "condition_code" and resource_type.lower() == "patient":
            # Handle condition code filtering for patients using _has parameter
            if value and value.strip():
                condition_code = value.strip()
                processed["_has"] = f"Condition:patient:code={condition_code}"
        elif key == "age_min" and resource_type.lower() == "patient":
            # Handle minimum age filtering - convert to FHIR birthdate parameter
            if value and value.strip() and value.isdigit():
                from datetime import datetime
                current_year = datetime.now().year
                birth_year = current_year - int(value)
                processed["birthdate"] = f"le{birth_year}-12-31"
                logger.info(f"Age filter: min age {value} -> birthdate le{birth_year}-12-31")
        elif key == "age_max" and resource_type.lower() == "patient":
            # Handle maximum age filtering - convert to FHIR birthdate parameter
            if value and value.strip() and value.isdigit():
                from datetime import datetime
                current_year = datetime.now().year
                birth_year = current_year - int(value)
                processed["birthdate"] = f"ge{birth_year}-01-01"
                logger.info(f"Age filter: max age {value} -> birthdate ge{birth_year}-01-01")
        elif key == "gender" and resource_type.lower() == "patient":
            # Handle gender filtering - direct FHIR parameter
            if value:
                if isinstance(value, list):
                    # Handle array of genders from frontend
                    valid_genders = [g.strip().lower() for g in value if g.strip().lower() in ["male", "female", "other", "unknown"]]
                    if valid_genders:
                        processed["gender"] = ",".join(valid_genders)  # FHIR supports comma-separated values
                        logger.info(f"Gender filter (multiple): {valid_genders}")
                elif isinstance(value, str) and value.strip().lower() in ["male", "female", "other", "unknown"]:
                    processed["gender"] = value.strip().lower()
                    logger.info(f"Gender filter: {value}")
        elif key == "age_range" and resource_type.lower() == "patient":
            # Handle age range filters from frontend
            if value and isinstance(value, dict):
                age_from = value.get('from')
                age_to = value.get('to')
                if age_from and age_from.isdigit():
                    from datetime import datetime
                    current_year = datetime.now().year
                    birth_year = current_year - int(age_from)
                    processed["birthdate"] = f"le{birth_year}-12-31"
                if age_to and age_to.isdigit():
                    from datetime import datetime
                    current_year = datetime.now().year
                    birth_year = current_year - int(age_to)
                    existing_birthdate = processed.get("birthdate", "")
                    if existing_birthdate:
                        # Combine with existing constraint
                        processed["birthdate"] = f"ge{birth_year}-01-01,{existing_birthdate}"
                    else:
                        processed["birthdate"] = f"ge{birth_year}-01-01"
                logger.info(f"Age range filter: {age_from}-{age_to} -> {processed.get('birthdate', '')}")
        elif key == "data_availability" and resource_type.lower() == "patient":
            # Handle resource-based filtering for patients
            if value and value.strip():
                # Parse comma-separated resource types like "has_Observation,has_Condition"
                resource_filters = [r.strip() for r in value.split(",") if r.strip()]
                for resource_filter in resource_filters:
                    if resource_filter.startswith("has_"):
                        resource_type_name = resource_filter[4:]  # Remove "has_" prefix
                        # Map to appropriate revinclude parameter
                        if resource_type_name == "Observation":
                            revinclude_resources.append("Observation:subject")
                        elif resource_type_name == "Condition":
                            revinclude_resources.append("Condition:subject")
                        elif resource_type_name == "Procedure":
                            revinclude_resources.append("Procedure:subject")
                        elif resource_type_name == "MedicationRequest":
                            revinclude_resources.append("MedicationRequest:subject")
                        elif resource_type_name == "Encounter":
                            revinclude_resources.append("Encounter:subject")
                        elif resource_type_name == "DiagnosticReport":
                            revinclude_resources.append("DiagnosticReport:subject")
                        elif resource_type_name == "DocumentReference":
                            revinclude_resources.append("DocumentReference:subject")
                        elif resource_type_name == "AllergyIntolerance":
                            revinclude_resources.append("AllergyIntolerance:patient")
                        elif resource_type_name == "Immunization":
                            revinclude_resources.append("Immunization:patient")
        else:
            processed[key] = value
    
    # Add revinclude parameters if any resource filters were specified
    if revinclude_resources:
        processed["_revinclude"] = ",".join(revinclude_resources)
        
    return processed

def get_valid_sort_for_resource(resource_type: str, existing_params: dict) -> Optional[str]:
    """Get valid server-side sort, avoiding override if already present"""
    if any(k.startswith('_sort') for k in existing_params.keys()):
        return existing_params.get('_sort')

    rt = resource_type.lower()
    if rt == "patient":
        return "_id"           # sort by ID for sequential ordering
    if rt == "observation":
        return "-date"
    if rt == "condition":
        return "-onset-date"
    if rt == "medicationrequest":
        return "-authoredon"
    return None

async def get_server_total_count(url: str, search_params: Dict[str, str]) -> Optional[int]:
    """Try to get total from server using _summary=count"""
    try:
        params = {**(search_params or {}), "_summary": "count", "_count": "0"}
        bundle = await fhir.fetch_bundle_with_deferred_handling(url, params)
        if isinstance(bundle, dict) and bundle.get("total") is not None:
            return bundle.get("total")

        params = {**(search_params or {}), "_count": "1"}
        bundle = await fhir.fetch_bundle_with_deferred_handling(url, params)
        return bundle.get("total") if isinstance(bundle, dict) else None
    except Exception as e:
        logger.warning(f"Could not determine total count: {e}")
        return None

async def try_fallback_search(url: str, original_params: dict, resource_type: str):
    """Fallbacks when primary search returns empty results"""
    # Strategy 1: remove sorting
    fallback_params = {k: v for k, v in original_params.items() if not k.startswith('_sort')}
    try:
        logger.info(f"Fallback: no sorting for {resource_type}")
        bundle = await fhir.fetch_bundle_with_deferred_handling(url, fallback_params)
        if isinstance(bundle, dict) and bundle.get("entry"):
            return bundle
    except Exception as e:
        logger.warning(f"Fallback (no sort) failed: {e}")

    # Strategy 2: minimal params
    minimal_params = {"_count": original_params.get("_count", "50")}
    try:
        logger.info(f"Fallback: minimal params for {resource_type}")
        bundle = await fhir.fetch_bundle_with_deferred_handling(url, minimal_params)
        if isinstance(bundle, dict) and bundle.get("entry"):
            return bundle
    except Exception as e:
        logger.warning(f"Fallback (minimal) failed: {e}")

    return None

# ----------------------------------------------------------------------
# Configuration and Status endpoints
# ----------------------------------------------------------------------

async def _get_cached_config():
    """Get cached configuration or fetch new one"""
    now = datetime.now()
    
    # Check if cache is valid
    if (_config_cache["cached_at"] and 
        _config_cache["server_info"] and
        now - _config_cache["cached_at"] < CONFIG_CACHE_DURATION):
        return _config_cache["server_info"]
    
    # Fetch new configuration
    try:
        base_url = fhir.base().rstrip('/') + '/'
        cap = await fhir.get_capabilities()
        
        server_info = {
            "fhir_version": cap.get("fhirVersion"),
            "server_name": cap.get("software", {}).get("name"),
            "server_version": cap.get("software", {}).get("version"),
            "base_url": base_url,
            "supported_resources": fhir.list_resource_types(cap)
        }
        
        # Update cache
        _config_cache.update({
            "server_info": server_info,
            "cached_at": now
        })
        
        logger.info("Configuration cached successfully")
        return server_info
        
    except Exception as e:
        logger.error(f"Error fetching server configuration: {e}")
        return None


@router.get("/config/status")
async def get_backend_status():
    """Get current backend status and configuration"""
    try:
        # Use cached configuration
        server_info = await _get_cached_config()
        
        fhir_status = "connected" if server_info else "error"
        fhir_details = server_info or {"error": "Failed to connect to FHIR server"}
        
        # Cache status
        cache_status = {
            "patient_cache_size": len(_patient_cache),
            "cache_entries": list(_patient_cache.keys()),
            "cache_duration_minutes": int(CACHE_DURATION.total_seconds() / 60)
        }
        
        return {
            "success": True,
            "backend_version": "1.0.0",
            "timestamp": datetime.now().isoformat(),
            "fhir_server": {
                "status": fhir_status,
                "details": fhir_details
            },
            "cache": cache_status,
            "configuration": {
                "fhir_base_url": config.fhir_base_url,
                "backend_port": config.backend_port,
                "default_page_size": config.default_page_size,
                "max_page_size": config.max_page_size,
                "supported_resources": config.supported_resources
            },
            "supported_features": config.features
        }
    except Exception as e:
        logger.error(f"Error getting backend status: {e}")
        return {
            "success": False,
            "error": str(e),
            "backend_version": "1.0.0",
            "timestamp": datetime.now().isoformat()
        }

@router.post("/config/cache/clear")
async def clear_cache():
    """Clear the patient cache"""
    try:
        cleared_count = len(_patient_cache)
        _patient_cache.clear()
        _cache_expiry.clear()
        
        return {
            "success": True,
            "message": f"Cache cleared. Removed {cleared_count} entries.",
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error clearing cache: {e}")
        return {"success": False, "error": str(e)}

@router.get("/startup/status") 
async def get_startup_status_detailed():
    """Get detailed startup status and system health"""
    try:
        from app.startup import get_startup_status
        startup_info = get_startup_status()
        
        # Add additional runtime information
        runtime_info = {
            "cache_stats": {
                "patient_cache_size": len(_patient_cache),
                "config_cache_age_hours": (
                    (datetime.now() - _config_cache.get("cached_at", datetime.min)).total_seconds() / 3600
                    if _config_cache.get("cached_at") else None
                ),
                "cache_entries": list(_patient_cache.keys())
            },
            "configuration": {
                "patient_cache_duration_minutes": config.patient_cache_duration_minutes,
                "config_cache_duration_hours": config.config_cache_duration_hours,
                "max_cache_entries": config.max_cache_entries,
                "default_page_size": config.default_page_size,
                "max_page_size": config.max_page_size
            },
            "features": config.features,
            "supported_resources": config.supported_resources
        }
        
        return {
            "success": True,
            "startup_status": startup_info,
            "runtime_info": runtime_info,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error getting startup status: {e}")
        return {
            "success": False,
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }

# ----------------------------------------------------------------------
# Debug endpoints
# ----------------------------------------------------------------------

@router.get("/debug/server-test")
async def debug_server_connection():
    """Quick server tests (capabilities & UUID presence)"""
    try:
        base_url = fhir.base().rstrip('/') + '/'
        results = {"base_url": base_url, "tests": []}

        try:
            cap = await fhir.get_capabilities()
            results["tests"].append({
                "name": "Capabilities",
                "success": True,
                "fhir_version": cap.get("fhirVersion"),
                "server_name": cap.get("software", {}).get("name"),
                "server_version": cap.get("software", {}).get("version"),
            })
        except Exception as e:
            results["tests"].append({"name": "Capabilities", "success": False, "error": str(e)})

        try:
            url = base_url + "Patient"
            params = {"_count": "100"}
            bundle = await fhir.fetch_bundle_with_deferred_handling(url, params)
            patients = fhir.entries(bundle) if isinstance(bundle, dict) else []
            # UUID detection removed - no longer needed for highlighting
            results["tests"].append({
                "name": "Basic Patient Count", 
                "success": True,
                "total_patients": len(patients)
            })
        except Exception as e:
            results["tests"].append({"name": "Basic Patient Count", "success": False, "error": str(e)})

        return {"success": True, "results": results}
    except Exception as e:
        logger.error(f"Debug server-test failed: {str(e)}")
        return {"success": False, "error": str(e)}

@router.get("/debug/direct-test")
async def debug_direct_fhir_test():
    """Direct call to public HAPI for quick validation"""
    import httpx
    try:
        base_url = "https://hapi.fhir.org/baseR4/"
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.get(f"{base_url}Patient", params={"_count": "50"},
                                 headers={"Accept": "application/fhir+json"})
        if r.status_code != 200:
            return {"success": False, "status_code": r.status_code, "error": r.text}
        data = r.json()
        patients = [e.get("resource", {}) for e in data.get("entry", [])]
        return {
            "success": True,
            "total_patients": len(patients)
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

# ----------------------------------------------------------------------
# Patient utilities
# ----------------------------------------------------------------------


@router.get("/Patient/search/by-condition")
async def search_patients_by_condition(
    condition_code: str = Query(..., description="Condition code to search for (e.g., J20N7001)"),
    _count: int = Query(50, ge=1, le=200),
    age_min: Optional[int] = Query(None, ge=0, le=150, description="Minimum age"),
    age_max: Optional[int] = Query(None, ge=0, le=150, description="Maximum age"),
    gender: Optional[str] = Query(None, regex="^(male|female|other|unknown)$", description="Patient gender")
):
    """Search patients by condition code with optional age and gender filtering"""
    try:
        base_url = fhir.base().rstrip('/') + '/'
        url = base_url + "Patient"
        
        # Build search parameters
        params = {
            "_has": f"Condition:patient:code={condition_code}",
            "_count": str(_count)
        }
        
        # Add age filtering via birthdate
        if age_min is not None or age_max is not None:
            current_year = datetime.now().year
            
            if age_min is not None and age_max is not None:
                # Age range
                min_birth_year = current_year - age_max
                max_birth_year = current_year - age_min
                params["birthdate"] = f"ge{min_birth_year}-01-01&birthdate=le{max_birth_year}-12-31"
            elif age_min is not None:
                # Only minimum age
                max_birth_year = current_year - age_min
                params["birthdate"] = f"le{max_birth_year}-12-31"
            elif age_max is not None:
                # Only maximum age
                min_birth_year = current_year - age_max
                params["birthdate"] = f"ge{min_birth_year}-01-01"
        
        # Add gender filtering
        if gender:
            params["gender"] = gender.lower()
        
        logger.info(f"Searching patients by condition code {condition_code} with params: {params}")
        
        # Execute search
        bundle = await fhir.fetch_bundle_with_deferred_handling(url, params)
        
        if isinstance(bundle, dict) and bundle.get("resourceType") == "OperationOutcome":
            error_msg = _extract_operation_outcome_text(bundle)
            return {
                "success": False,
                "message": f"FHIR server error: {error_msg}",
                "search_params": {
                    "condition_code": condition_code,
                    "age_min": age_min,
                    "age_max": age_max,
                    "gender": gender
                },
                "data": [],
                "count": 0
            }
        
        # Extract patients from results
        all_resources = fhir.entries(bundle)
        patients = [r for r in all_resources if r.get("resourceType") == "Patient"]
        
        # Calculate ages for display
        for patient in patients:
            if patient.get("birthDate"):
                try:
                    birth_date = datetime.fromisoformat(patient["birthDate"].replace("Z", "+00:00"))
                    age = datetime.now().year - birth_date.year
                    if datetime.now().month < birth_date.month or (
                        datetime.now().month == birth_date.month and datetime.now().day < birth_date.day
                    ):
                        age -= 1
                    patient["calculated_age"] = max(0, age)
                except:
                    patient["calculated_age"] = None
            else:
                patient["calculated_age"] = None
        
        return {
            "success": True,
            "search_params": {
                "condition_code": condition_code,
                "age_min": age_min,
                "age_max": age_max,
                "gender": gender
            },
            "data": patients,
            "count": len(patients),
            "total": bundle.get("total"),
            "message": f"Found {len(patients)} patients with condition code {condition_code}"
        }
        
    except Exception as e:
        logger.error(f"Error searching patients by condition {condition_code}: {e}")
        return {
            "success": False,
            "message": str(e),
            "search_params": {
                "condition_code": condition_code,
                "age_min": age_min,
                "age_max": age_max,
                "gender": gender
            },
            "data": [],
            "count": 0
        }

@router.get("/Patient/{patient_id}/resources/{resource_type}")
async def get_patient_resources(
    patient_id: str,
    resource_type: str,
    _count: int = Query(50, ge=1, le=500),
    _getpagesoffset: int = Query(0, ge=0),
    page: int = Query(1, ge=1)
):
    """Fetch a specific resource type for a patient with pagination support"""
    try:
        base_url = fhir.base().rstrip('/') + '/'
        url = base_url + resource_type
        
        # Build query parameters
        if resource_type in ['AllergyIntolerance', 'Immunization']:
            params = {"patient": f"Patient/{patient_id}", "_count": str(_count)}
        else:
            params = {"subject": f"Patient/{patient_id}", "_count": str(_count)}
            
        # Add pagination parameters
        if _getpagesoffset > 0:
            params["_getpagesoffset"] = str(_getpagesoffset)
            
        logger.info(f"Fetching {resource_type} for patient {patient_id}, page {page}, count {_count}")
        
        bundle = await fhir.fetch_bundle_with_deferred_handling(url, params)
        
        if isinstance(bundle, dict) and bundle.get("resourceType") == "OperationOutcome":
            return {"success": False, "message": _extract_operation_outcome_text(bundle),
                    "data": [], "resource_type": resource_type, "pagination": {"page": page, "per_page": _count, "total": 0, "has_next": False}}
        
        data = fhir.entries(bundle)
        
        # Build pagination info
        pagination = fhir.normalize_pagination(bundle)
        pagination.update({
            "page": page,
            "per_page": _count,
            "total": bundle.get("total"),
            "has_next": bool(fhir.next_link(bundle)),
            "has_prev": _getpagesoffset > 0
        })
        
        return {
            "success": True, 
            "resource_type": resource_type, 
            "patient_id": patient_id,
            "data": data, 
            "count": len(data),
            "pagination": pagination
        }
    except Exception as e:
        logger.error(f"Error fetching {resource_type} for patient {patient_id}: {e}")
        return {"success": False, "message": str(e), "data": [], "resource_type": resource_type, 
                "pagination": {"page": page, "per_page": _count, "total": 0, "has_next": False}}

@router.get("/Patient/{patient_id}/resources/{resource_type}/filtered")
async def get_patient_resources_filtered(
    patient_id: str,
    resource_type: str,
    _count: int = Query(100, ge=1, le=500),
    # Measurement/Lab filters
    measurement_type: Optional[str] = Query(None, description="Filter by measurement/test type (code_display)"),
    value_min: Optional[float] = Query(None, description="Minimum value"),
    value_max: Optional[float] = Query(None, description="Maximum value"),
    unit: Optional[str] = Query(None, description="Filter by unit"),
    status: Optional[str] = Query(None, description="Filter by status"),
    date_from: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    # Notes filters
    document_type: Optional[str] = Query(None, description="Filter by document type"),
    author: Optional[str] = Query(None, description="Filter by author"),
    # General category filter
    category: Optional[str] = Query(None, description="Filter by category")
):
    """Fetch and filter a specific resource type for a patient with advanced filtering"""
    try:
        base_url = fhir.base().rstrip('/') + '/'
        url = base_url + resource_type
        if resource_type in ['AllergyIntolerance', 'Immunization']:
            params = {"patient": f"Patient/{patient_id}", "_count": str(_count)}
        else:
            params = {"subject": f"Patient/{patient_id}", "_count": str(_count)}
        
        # Fetch all resources first
        bundle = await get_json(url, None, params=params)
        if isinstance(bundle, dict) and bundle.get("resourceType") == "OperationOutcome":
            return {"success": False, "message": _extract_operation_outcome_text(bundle),
                    "data": [], "resource_type": resource_type, "filters_applied": {}}
        
        data = fhir.entries(bundle)
        original_count = len(data)
        
        # Apply filters based on resource type and parameters
        filters_applied = {}
        filtered_data = data
        
        if resource_type == "Observation":
            filtered_data = _filter_observations(filtered_data, {
                'measurement_type': measurement_type,
                'value_min': value_min,
                'value_max': value_max,
                'unit': unit,
                'status': status,
                'date_from': date_from,
                'date_to': date_to,
                'category': category
            })
            filters_applied = {k: v for k, v in {
                'measurement_type': measurement_type,
                'value_min': value_min,
                'value_max': value_max,
                'unit': unit,
                'status': status,
                'date_from': date_from,
                'date_to': date_to,
                'category': category
            }.items() if v is not None}
        
        elif resource_type in ["DocumentReference", "DiagnosticReport"]:
            filtered_data = _filter_documents(filtered_data, {
                'document_type': document_type,
                'author': author,
                'status': status,
                'date_from': date_from,
                'date_to': date_to,
                'category': category
            })
            filters_applied = {k: v for k, v in {
                'document_type': document_type,
                'author': author,
                'status': status,
                'date_from': date_from,
                'date_to': date_to,
                'category': category
            }.items() if v is not None}
        
        logger.info(f"Filtered {resource_type} for patient {patient_id}: {original_count} -> {len(filtered_data)} items")
        
        return {
            "success": True, 
            "resource_type": resource_type, 
            "patient_id": patient_id,
            "data": filtered_data, 
            "count": len(filtered_data),
            "original_count": original_count,
            "filters_applied": filters_applied
        }
    except Exception as e:
        logger.error(f"Error fetching filtered {resource_type} for patient {patient_id}: {e}")
        return {"success": False, "message": str(e), "data": [], "resource_type": resource_type}

def _filter_observations(observations: List[Dict], filters: Dict) -> List[Dict]:
    """Filter observations based on measurement/lab criteria"""
    filtered = observations
    
    # Filter by measurement type
    if filters.get('measurement_type'):
        filtered = [obs for obs in filtered 
                   if obs.get('code_display', '').lower().find(filters['measurement_type'].lower()) != -1]
    
    # Filter by value range
    if filters.get('value_min') is not None or filters.get('value_max') is not None:
        def in_range(obs):
            try:
                value = obs.get('value_quantity')
                if value is None:
                    return False
                value = float(value)
                if filters.get('value_min') is not None and value < filters['value_min']:
                    return False
                if filters.get('value_max') is not None and value > filters['value_max']:
                    return False
                return True
            except (ValueError, TypeError):
                return False
        filtered = [obs for obs in filtered if in_range(obs)]
    
    # Filter by unit
    if filters.get('unit'):
        filtered = [obs for obs in filtered 
                   if obs.get('value_unit', '').lower().find(filters['unit'].lower()) != -1]
    
    # Filter by status
    if filters.get('status'):
        filtered = [obs for obs in filtered 
                   if obs.get('status', '').lower() == filters['status'].lower()]
    
    # Filter by date range
    if filters.get('date_from') or filters.get('date_to'):
        def in_date_range(obs):
            try:
                date_str = obs.get('effective_date') or obs.get('effectiveDateTime', '')
                if not date_str:
                    return False
                
                # Extract date part (YYYY-MM-DD)
                obs_date = date_str[:10] if len(date_str) >= 10 else date_str
                
                if filters.get('date_from') and obs_date < filters['date_from']:
                    return False
                if filters.get('date_to') and obs_date > filters['date_to']:
                    return False
                return True
            except:
                return False
        filtered = [obs for obs in filtered if in_date_range(obs)]
    
    # Filter by category
    if filters.get('category'):
        filtered = [obs for obs in filtered 
                   if _get_observation_category(obs).lower().find(filters['category'].lower()) != -1]
    
    return filtered

def _filter_documents(documents: List[Dict], filters: Dict) -> List[Dict]:
    """Filter document references and diagnostic reports"""
    filtered = documents
    
    # Filter by document type
    if filters.get('document_type'):
        filtered = [doc for doc in filtered
                   if _get_document_type(doc).lower().find(filters['document_type'].lower()) != -1]
    
    # Filter by author
    if filters.get('author'):
        filtered = [doc for doc in filtered
                   if _get_document_author(doc).lower().find(filters['author'].lower()) != -1]
    
    # Filter by status
    if filters.get('status'):
        filtered = [doc for doc in filtered 
                   if doc.get('status', '').lower() == filters['status'].lower()]
    
    # Filter by date range
    if filters.get('date_from') or filters.get('date_to'):
        def in_date_range(doc):
            try:
                date_str = doc.get('date') or doc.get('effectiveDateTime') or doc.get('issued', '')
                if not date_str:
                    return False
                
                # Extract date part (YYYY-MM-DD)
                doc_date = date_str[:10] if len(date_str) >= 10 else date_str
                
                if filters.get('date_from') and doc_date < filters['date_from']:
                    return False
                if filters.get('date_to') and doc_date > filters['date_to']:
                    return False
                return True
            except:
                return False
        filtered = [doc for doc in filtered if in_date_range(doc)]
    
    return filtered

def _get_observation_category(obs: Dict) -> str:
    """Get observation category for filtering"""
    if obs.get('category') and obs['category']:
        category = obs['category'][0] if isinstance(obs['category'], list) else obs['category']
        if isinstance(category, dict):
            if category.get('coding') and category['coding']:
                return category['coding'][0].get('display', category['coding'][0].get('code', ''))
            return category.get('text', '')
    return obs.get('code_display', '')

def _get_document_type(doc: Dict) -> str:
    """Get document type for filtering"""
    if doc.get('type') and isinstance(doc['type'], dict):
        if doc['type'].get('coding') and doc['type']['coding']:
            return doc['type']['coding'][0].get('display', doc['type']['coding'][0].get('code', ''))
        return doc['type'].get('text', '')
    return doc.get('resourceType', '')

def _get_document_author(doc: Dict) -> str:
    """Get document author for filtering"""
    if doc.get('author') and doc['author']:
        author = doc['author'][0] if isinstance(doc['author'], list) else doc['author']
        if isinstance(author, dict):
            return author.get('display', author.get('reference', ''))
    return ''

# ----------------------------------------------------------------------
# Global Metadata Endpoints for Dynamic Filtering
# ----------------------------------------------------------------------

@router.get("/metadata/observations")
async def get_observations_metadata():
    """Get metadata about all observations in the server for dynamic filtering"""
    try:
        base_url = fhir.base().rstrip('/') + '/'
        url = base_url + "Observation"
        
        # Get a large sample of observations to analyze
        params = {"_count": "1000"}
        bundle = await get_json(url, None, params=params)
        
        if isinstance(bundle, dict) and bundle.get("resourceType") == "OperationOutcome":
            return {"success": False, "message": _extract_operation_outcome_text(bundle), "metadata": {}}
        
        observations = fhir.entries(bundle)
        
        # Analyze observations to build metadata
        metadata = {
            "measurement_types": {},  # {display_name: count}
            "units": {},             # {unit: count}
            "statuses": {},          # {status: count}  
            "categories": {},        # {category: count}
            "value_ranges": {},      # {measurement_type: {min, max, unit}}
            "total_observations": len(observations)
        }
        
        for obs in observations:
            # Measurement types
            code_display = obs.get('code_display', 'Unknown')
            metadata["measurement_types"][code_display] = metadata["measurement_types"].get(code_display, 0) + 1
            
            # Units
            unit = obs.get('value_unit', '')
            if unit:
                metadata["units"][unit] = metadata["units"].get(unit, 0) + 1
            
            # Statuses
            status = obs.get('status', 'Unknown')
            metadata["statuses"][status] = metadata["statuses"].get(status, 0) + 1
            
            # Categories
            category = _get_observation_category(obs)
            if category:
                metadata["categories"][category] = metadata["categories"].get(category, 0) + 1
            
            # Value ranges per measurement type
            if obs.get('value_quantity') is not None and code_display != 'Unknown':
                try:
                    value = float(obs.get('value_quantity'))
                    if code_display not in metadata["value_ranges"]:
                        metadata["value_ranges"][code_display] = {
                            "min": value,
                            "max": value, 
                            "unit": unit,
                            "count": 1
                        }
                    else:
                        range_info = metadata["value_ranges"][code_display]
                        range_info["min"] = min(range_info["min"], value)
                        range_info["max"] = max(range_info["max"], value)
                        range_info["count"] += 1
                        if not range_info["unit"] and unit:
                            range_info["unit"] = unit
                except (ValueError, TypeError):
                    pass
        
        # Sort by frequency (most common first)
        metadata["measurement_types"] = dict(sorted(metadata["measurement_types"].items(), key=lambda x: x[1], reverse=True))
        metadata["units"] = dict(sorted(metadata["units"].items(), key=lambda x: x[1], reverse=True))
        metadata["statuses"] = dict(sorted(metadata["statuses"].items(), key=lambda x: x[1], reverse=True))
        metadata["categories"] = dict(sorted(metadata["categories"].items(), key=lambda x: x[1], reverse=True))
        
        logger.info(f"Generated observations metadata: {len(metadata['measurement_types'])} measurement types, {len(metadata['units'])} units")
        
        return {
            "success": True,
            "resource_type": "Observation",
            "metadata": metadata
        }
        
    except Exception as e:
        logger.error(f"Error generating observations metadata: {e}")
        return {"success": False, "message": str(e), "metadata": {}}

@router.get("/metadata/documents")
async def get_documents_metadata():
    """Get metadata about all document references and diagnostic reports for dynamic filtering"""
    try:
        base_url = fhir.base().rstrip('/') + '/'
        
        metadata = {
            "document_types": {},    # {type: count}
            "statuses": {},          # {status: count}
            "authors": {},           # {author: count}
            "total_documents": 0
        }
        
        # Analyze DocumentReferences
        doc_url = base_url + "DocumentReference"
        params = {"_count": "500"}
        try:
            bundle = await get_json(doc_url, None, params=params)
            if not (isinstance(bundle, dict) and bundle.get("resourceType") == "OperationOutcome"):
                docs = fhir.entries(bundle)
                metadata["total_documents"] += len(docs)
                
                for doc in docs:
                    # Document types
                    doc_type = _get_document_type(doc)
                    if doc_type:
                        metadata["document_types"][doc_type] = metadata["document_types"].get(doc_type, 0) + 1
                    
                    # Statuses
                    status = doc.get('status', 'Unknown')
                    metadata["statuses"][status] = metadata["statuses"].get(status, 0) + 1
                    
                    # Authors
                    author = _get_document_author(doc)
                    if author:
                        # Limit author names to avoid too much data
                        author = author[:50] + "..." if len(author) > 50 else author
                        metadata["authors"][author] = metadata["authors"].get(author, 0) + 1
        except Exception as e:
            logger.warning(f"Could not fetch DocumentReferences: {e}")
        
        # Analyze DiagnosticReports
        diag_url = base_url + "DiagnosticReport"
        try:
            bundle = await get_json(diag_url, None, params=params)
            if not (isinstance(bundle, dict) and bundle.get("resourceType") == "OperationOutcome"):
                reports = fhir.entries(bundle)
                metadata["total_documents"] += len(reports)
                
                for report in reports:
                    # Document types
                    doc_type = _get_document_type(report)
                    if doc_type:
                        metadata["document_types"][doc_type] = metadata["document_types"].get(doc_type, 0) + 1
                    
                    # Statuses  
                    status = report.get('status', 'Unknown')
                    metadata["statuses"][status] = metadata["statuses"].get(status, 0) + 1
        except Exception as e:
            logger.warning(f"Could not fetch DiagnosticReports: {e}")
        
        # Sort by frequency
        metadata["document_types"] = dict(sorted(metadata["document_types"].items(), key=lambda x: x[1], reverse=True))
        metadata["statuses"] = dict(sorted(metadata["statuses"].items(), key=lambda x: x[1], reverse=True))  
        metadata["authors"] = dict(sorted(metadata["authors"].items(), key=lambda x: x[1], reverse=True)[:20])  # Top 20 authors
        
        logger.info(f"Generated documents metadata: {len(metadata['document_types'])} document types, {len(metadata['authors'])} authors")
        
        return {
            "success": True,
            "resource_type": "Documents",
            "metadata": metadata
        }
        
    except Exception as e:
        logger.error(f"Error generating documents metadata: {e}")
        return {"success": False, "message": str(e), "metadata": {}}

@router.get("/Patient/filtered")
async def get_patients_with_global_filters(
    request: Request,
    _count: int = Query(50, ge=1, le=500),
    _getpagesoffset: int = Query(0, ge=0),
    # Patient filters
    gender: Optional[str] = Query(None, description="Filter by gender"),
    age_min: Optional[int] = Query(None, description="Minimum age"),
    age_max: Optional[int] = Query(None, description="Maximum age"),
    # Global observation filters  
    has_measurement_type: Optional[str] = Query(None, description="Filter patients who have specific measurement type"),
    measurement_value_min: Optional[float] = Query(None, description="Minimum measurement value"),
    measurement_value_max: Optional[float] = Query(None, description="Maximum measurement value"),
    measurement_unit: Optional[str] = Query(None, description="Filter by measurement unit"),
    # Global document filters
    has_document_type: Optional[str] = Query(None, description="Filter patients who have specific document type"),
    document_status: Optional[str] = Query(None, description="Filter by document status")
):
    """Get patients with global filters applied - filters across ALL patients and their resources"""
    
    try:
        # Build FHIR query parameters for patients
        params = {
            "_count": str(_count),
            "_getpagesoffset": str(_getpagesoffset)
        }
        
        # Add basic patient filters
        if gender:
            params["gender"] = gender
            
        # Get all patients first (or filtered by basic criteria)
        base_url = fhir.base().rstrip('/') + '/'
        url = base_url + "Patient"
        bundle = await get_json(url, None, params=params)
        
        if isinstance(bundle, dict) and bundle.get("resourceType") == "OperationOutcome":
            return {"success": False, "message": _extract_operation_outcome_text(bundle), "data": [], "pagination": {}}
        
        all_patients = fhir.entries(bundle)
        original_count = len(all_patients)
        
        # Apply global filters that require checking patient resources
        filtered_patients = all_patients
        filters_applied = {}
        
        if gender:
            filters_applied["gender"] = gender
            
        # Age filtering
        if age_min is not None or age_max is not None:
            age_filtered = []
            for patient in filtered_patients:
                birth_date = patient.get('birthDate')
                if birth_date:
                    try:
                        age = datetime.now().year - int(birth_date[:4])
                        if ((age_min is None or age >= age_min) and 
                            (age_max is None or age <= age_max)):
                            age_filtered.append(patient)
                    except:
                        pass
            filtered_patients = age_filtered
            if age_min is not None:
                filters_applied["age_min"] = age_min
            if age_max is not None:
                filters_applied["age_max"] = age_max
        
        # Global measurement filtering - check if patients have specific observations
        if has_measurement_type or measurement_value_min is not None or measurement_value_max is not None or measurement_unit:
            measurement_filtered = []
            
            for patient in filtered_patients:
                patient_id = patient.get('id')
                if not patient_id:
                    continue
                    
                # Check patient's observations
                try:
                    obs_url = base_url + "Observation"
                    obs_params = {"subject": f"Patient/{patient_id}", "_count": "200"}
                    obs_bundle = await get_json(obs_url, None, params=obs_params)
                    
                    if isinstance(obs_bundle, dict) and obs_bundle.get("resourceType") == "OperationOutcome":
                        continue
                        
                    observations = fhir.entries(obs_bundle)
                    patient_matches = False
                    
                    for obs in observations:
                        # Check measurement type
                        if has_measurement_type:
                            code_display = obs.get('code_display', '')
                            if has_measurement_type.lower() not in code_display.lower():
                                continue
                                
                        # Check measurement value range
                        if measurement_value_min is not None or measurement_value_max is not None:
                            try:
                                value = float(obs.get('value_quantity', 0))
                                if ((measurement_value_min is not None and value < measurement_value_min) or
                                    (measurement_value_max is not None and value > measurement_value_max)):
                                    continue
                            except:
                                continue
                        
                        # Check unit
                        if measurement_unit:
                            unit = obs.get('value_unit', '')
                            if measurement_unit.lower() not in unit.lower():
                                continue
                        
                        # If we get here, this observation matches all criteria
                        patient_matches = True
                        break
                    
                    if patient_matches:
                        measurement_filtered.append(patient)
                        
                except Exception as e:
                    logger.warning(f"Error checking observations for patient {patient_id}: {e}")
                    continue
                    
            filtered_patients = measurement_filtered
            if has_measurement_type:
                filters_applied["has_measurement_type"] = has_measurement_type
            if measurement_value_min is not None:
                filters_applied["measurement_value_min"] = measurement_value_min
            if measurement_value_max is not None:
                filters_applied["measurement_value_max"] = measurement_value_max
            if measurement_unit:
                filters_applied["measurement_unit"] = measurement_unit
        
        # Global document filtering - similar approach for documents
        if has_document_type or document_status:
            doc_filtered = []
            
            for patient in filtered_patients:
                patient_id = patient.get('id')
                if not patient_id:
                    continue
                    
                try:
                    patient_has_matching_docs = False
                    
                    # Check DocumentReferences
                    doc_url = base_url + "DocumentReference"  
                    doc_params = {"subject": f"Patient/{patient_id}", "_count": "50"}
                    doc_bundle = await get_json(doc_url, None, params=doc_params)
                    
                    if not (isinstance(doc_bundle, dict) and doc_bundle.get("resourceType") == "OperationOutcome"):
                        docs = fhir.entries(doc_bundle)
                        for doc in docs:
                            if has_document_type:
                                doc_type = _get_document_type(doc)
                                if has_document_type.lower() not in doc_type.lower():
                                    continue
                            if document_status:
                                status = doc.get('status', '')
                                if document_status.lower() != status.lower():
                                    continue
                            patient_has_matching_docs = True
                            break
                    
                    # Check DiagnosticReports if not found in DocumentReferences
                    if not patient_has_matching_docs:
                        diag_url = base_url + "DiagnosticReport"
                        diag_params = {"subject": f"Patient/{patient_id}", "_count": "50"}
                        diag_bundle = await get_json(diag_url, None, params=diag_params)
                        
                        if not (isinstance(diag_bundle, dict) and diag_bundle.get("resourceType") == "OperationOutcome"):
                            reports = fhir.entries(diag_bundle)
                            for report in reports:
                                if has_document_type:
                                    doc_type = _get_document_type(report)
                                    if has_document_type.lower() not in doc_type.lower():
                                        continue
                                if document_status:
                                    status = report.get('status', '')
                                    if document_status.lower() != status.lower():
                                        continue
                                patient_has_matching_docs = True
                                break
                    
                    if patient_has_matching_docs:
                        doc_filtered.append(patient)
                        
                except Exception as e:
                    logger.warning(f"Error checking documents for patient {patient_id}: {e}")
                    continue
            
            filtered_patients = doc_filtered
            if has_document_type:
                filters_applied["has_document_type"] = has_document_type
            if document_status:
                filters_applied["document_status"] = document_status
        
        # Build pagination info
        pagination = {
            "total": len(filtered_patients),
            "has_next": len(filtered_patients) > _count + _getpagesoffset,
            "has_prev": _getpagesoffset > 0,
            "count": _count,
            "offset": _getpagesoffset,
            "next_query": None,
            "prev_query": None
        }
        
        logger.info(f"Global patient filtering: {len(filtered_patients)}/{original_count} patients match criteria")
        
        return {
            "success": True,
            "resource_type": "Patient", 
            "data": filtered_patients,
            "pagination": pagination,
            "filters_applied": filters_applied,
            "original_count": original_count
        }
        
    except Exception as e:
        logger.error(f"Error in global patient filtering: {e}")
        return {"success": False, "message": str(e), "data": [], "pagination": {}}

# ----------------------------------------------------------------------
# Resource listing & schema
# ----------------------------------------------------------------------

@router.get("")
async def list_resources(exclude: Optional[str] = None, discovery_mode: Optional[str] = None):
    """List resource types using dynamic discovery or server capabilities"""
    try:
        if discovery_mode and discovery_mode in ["dynamic", "static", "hybrid"]:
            # Override discovery mode for this request
            original_mode = config.resource_discovery_mode
            config._config["fhir"]["resource_discovery"]["mode"] = discovery_mode
            
        # Use resource discovery service
        resources = await resource_discovery.get_supported_resources()
        
        if exclude:
            excluded = set([x.strip() for x in exclude.split(",") if x.strip()])
            resources = [r for r in resources if r not in excluded]
        
        return {
            "success": True, 
            "data": resources,
            "discovery_mode": config.resource_discovery_mode,
            "total_count": len(resources)
        }
    except Exception as e:
        logger.error(f"Error in list_resources: {e}")
        return {"success": False, "message": f"Failed to retrieve resource types: {e}", "data": []}

@router.get("/discovery/status")
async def get_resource_discovery_status():
    """Get resource discovery status and configuration"""
    try:
        status = await resource_discovery.get_discovery_status()
        return {"success": True, **status}
    except Exception as e:
        logger.error(f"Error getting discovery status: {e}")
        return {"success": False, "message": str(e)}

@router.post("/discovery/refresh")
async def refresh_resource_discovery():
    """Force refresh resource discovery from FHIR server"""
    try:
        result = await resource_discovery.refresh_discovery()
        return result
    except Exception as e:
        logger.error(f"Error refreshing discovery: {e}")
        return {"success": False, "message": str(e)}

@router.get("/categories")
async def get_resource_categories():
    """Get resources organized by categories"""
    try:
        categories = await resource_discovery.get_resource_categories()
        return {
            "success": True,
            "categories": categories,
            "total_categories": len(categories),
            "discovery_mode": config.resource_discovery_mode
        }
    except Exception as e:
        logger.error(f"Error getting resource categories: {e}")
        return {"success": False, "message": str(e), "categories": {}}

@router.get("/data-availability")
async def check_data_availability():
    """Check which resources actually contain data"""
    try:
        availability = await data_availability.check_resource_data_availability()
        summary = await data_availability.get_availability_summary()
        
        return {
            "success": True,
            "summary": summary,
            "resource_availability": availability,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error checking data availability: {e}")
        return {"success": False, "message": str(e)}

@router.get("/with-data")
async def get_resources_with_data(min_count: int = Query(1, ge=0)):
    """Get only resources that actually have data"""
    try:
        resources_with_data = await data_availability.get_resources_with_data(min_count)
        
        return {
            "success": True,
            "resources_with_data": resources_with_data,
            "total_count": len(resources_with_data),
            "min_count_filter": min_count,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error getting resources with data: {e}")
        return {"success": False, "message": str(e), "resources_with_data": []}

@router.get("/top-by-data")
async def get_top_resources_by_data(limit: int = Query(10, ge=1, le=50)):
    """Get top resources by data count"""
    try:
        top_resources = await data_availability.get_top_resources_by_data(limit)
        
        return {
            "success": True,
            "top_resources": top_resources,
            "limit": limit,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error getting top resources: {e}")
        return {"success": False, "message": str(e), "top_resources": []}

@router.post("/data-availability/refresh")
async def refresh_data_availability():
    """Force refresh data availability check"""
    try:
        result = await data_availability.force_refresh()
        return result
    except Exception as e:
        logger.error(f"Error refreshing data availability: {e}")
        return {"success": False, "message": str(e)}

@router.post("/check-specific")
async def check_specific_resources(resource_types: List[str]):
    """Check data availability for specific resource types"""
    try:
        if not resource_types:
            return {"success": False, "message": "No resource types provided"}
        
        availability = await data_availability.check_specific_resources(resource_types)
        
        return {
            "success": True,
            "resource_availability": availability,
            "checked_resources": resource_types,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error checking specific resources: {e}")
        return {"success": False, "message": str(e)}

@router.get("/{resource_type}/schema")
async def resource_schema(
    resource_type: str,
    sample_size: int = Query(20, ge=1, le=50, alias="sample_size")
):
    """Infer a simple schema by sampling resources"""
    try:
        base_url = fhir.base().rstrip('/') + '/'
        url = base_url + resource_type
        params = {"_count": str(sample_size)}
        valid_sort = get_valid_sort_for_resource(resource_type, params)
        if valid_sort:
            params["_sort"] = valid_sort

        bundle = await get_json(url, None, params=params)
        if not isinstance(bundle, dict):
            raise HTTPException(status_code=502, detail="Invalid response from FHIR server")

        entries = bundle.get("entry", [])
        resources = [e.get("resource") for e in entries
                     if isinstance(e, dict) and isinstance(e.get("resource"), dict)]

        if not resources:
            return {"success": True, "resource_type": resource_type,
                    "schema": {"columns": ["id", "resourceType"],
                               "warnings": [f"No {resource_type} resources found for schema inference."]}}

        columns = infer_columns(resources, max_paths=200)
        return {"success": True, "resource_type": resource_type, "schema": {"columns": columns}}
    except Exception as e:
        logger.error(f"Error in resource_schema: {e}")
        return {"success": False, "message": f"Schema inference failed: {e}",
                "resource_type": resource_type, "schema": {"columns": []}}

# ----------------------------------------------------------------------
# METADATA-DRIVEN PATIENT SEARCH
# ----------------------------------------------------------------------

@router.get("/Patient/with-filters")
async def search_patients_with_metadata_filters(
    request: Request,
    _count: int = Query(50, ge=1, le=500),
    _getpagesoffset: int = Query(0, ge=0),
    applied_filters: Optional[str] = Query(None, description="JSON string of applied filters")
):
    """
    Search patients using metadata-driven filtering.
    When filters are applied, finds patients who have resources matching the filter criteria.
    This ensures the frontend filtering function operates on the correct subset of patients.
    """
    try:
        from app.config import FILTER_DEFINITIONS
        import json

        base_url = fhir.base().rstrip('/') + '/'

        # Parse applied filters
        filters = {}
        if applied_filters:
            try:
                filters = json.loads(applied_filters)
                logger.info(f"Applied filters: {filters}")
            except json.JSONDecodeError:
                logger.warning(f"Invalid JSON in applied_filters: {applied_filters}")

        # If no filters applied, use regular patient search
        if not filters:
            return await search_resources("Patient", _count, False, None, _getpagesoffset, request)

        # Build FHIR _has: queries from filters
        patient_url = base_url + "Patient"
        search_params = {
            "_count": str(_count),  # Use the requested page size, not 10000!
            "_getpagesoffset": str(_getpagesoffset),  # Use the requested offset
            "_total": "accurate"  # Force accurate total counting for complex queries
        }

        # Convert each filter to a FHIR _has: query
        for filter_key, filter_values in filters.items():
            if not filter_values:  # Skip empty filters
                continue

            # Find the filter definition from config
            filter_def = None
            for fd in FILTER_DEFINITIONS:
                if fd.get('element') == filter_key:
                    filter_def = fd
                    break

            if not filter_def:
                logger.warning(f"No filter definition found for {filter_key}")
                continue

            resource_type = filter_def.get('resource')
            search_parameter = filter_def.get('search_parameter')
            category_filter = filter_def.get('category_filter')
            patient_reference = filter_def.get('patient_reference', 'patient')

            logger.info(f"Building _has: query for {filter_key} -> {resource_type}:{search_parameter}")

                
            # Handle regular array-based filters
            if isinstance(filter_values, list):
                # Build _has: query for each filter value
                for filter_value in filter_values:
                    if resource_type == "Patient":
                        # Direct patient search parameter - combine multiple values
                        if search_parameter in search_params:
                            # Convert to list if not already
                            if not isinstance(search_params[search_parameter], list):
                                search_params[search_parameter] = [search_params[search_parameter]]
                            search_params[search_parameter].append(filter_value)
                        else:
                            search_params[search_parameter] = filter_value
                    else:
                        # _has: query for related resources - combine multiple values
                        has_key = f"_has:{resource_type}:{patient_reference}:{search_parameter}"
                        if category_filter:
                            # For observations with categories, include category filter
                            if has_key in search_params:
                                # Convert to list if not already
                                if not isinstance(search_params[has_key], list):
                                    search_params[has_key] = [search_params[has_key]]
                                search_params[has_key].append(filter_value)
                            else:
                                search_params[has_key] = filter_value
                            # Add category as additional constraint
                            category_has_key = f"_has:{resource_type}:{patient_reference}:category"
                            search_params[category_has_key] = category_filter
                        else:
                            if has_key in search_params:
                                # Convert to list if not already
                                if not isinstance(search_params[has_key], list):
                                    search_params[has_key] = [search_params[has_key]]
                                search_params[has_key].append(filter_value)
                            else:
                                search_params[has_key] = filter_value
            else:
                logger.warning(f"Unsupported filter value type for {filter_key}: {type(filter_values)}")

        logger.info(f"FHIR Patient search with _has: queries: {search_params}")
        
        # Check if query is too complex (may cause timeouts)
        has_params = [k for k in search_params.keys() if k.startswith('_has:')]
        
        # If we have _has: queries, use optimized approach for better performance
        if has_params:
            logger.info("Using optimized approach for _has: queries to avoid timeouts")
            return await handle_has_queries_optimized(search_params, base_url, _count, _getpagesoffset)
        
        # Check for high-volume resource types that are known to be slow
        high_volume_resources = ['Observation', 'DiagnosticReport', 'DocumentReference']
        involves_high_volume = any(
            any(resource in param for resource in high_volume_resources)
            for param in has_params
        )
        
        # For filtered queries, respect the requested page size from frontend
        # This ensures proper pagination behavior
        original_count = int(search_params.get("_count", 50))
        logger.info(f"Using requested page size: {original_count}")
        
        # Keep the requested count - no need to override it
        # The frontend will handle pagination properly with server-filtered results
        
        # Build URL with proper handling of array parameters (for birthdate ranges)
        url_parts = []
        for k, v in search_params.items():
            if isinstance(v, list):
                for val in v:
                    url_parts.append(f"{k}={val}")
            else:
                url_parts.append(f"{k}={v}")
        final_url = f"{patient_url}?" + "&".join(url_parts)
        logger.info(f"Final FHIR URL: {final_url}")
        logger.info(f"Requested _count: {_count}, FHIR _count param: {search_params['_count']}")
        
        # Log the _has: parameters for debugging
        has_params_debug = {k: v for k, v in search_params.items() if k.startswith('_has:')}
        logger.info(f"_has: query parameters: {has_params_debug}")

        # Execute the FHIR Patient search with _has: parameters
        try:
            from app.services.http import get_json
            import time
            start_time = time.time()
            logger.info(f"Starting FHIR request at {time.strftime('%H:%M:%S')}")
            
            # Use longer timeout for all filtered queries since they involve _has: searches
            timeout_seconds = 90.0  # Always use extended timeout for filtered queries
            bundle = await get_json(patient_url, None, params=search_params, timeout_override=timeout_seconds)
            
            elapsed = time.time() - start_time
            logger.info(f"FHIR request completed in {elapsed:.2f} seconds")
            
            if isinstance(bundle, dict) and bundle.get("resourceType") == "OperationOutcome":
                logger.warning(f"FHIR search returned OperationOutcome: {bundle}")
                return {
                    "success": False,
                    "message": f"FHIR search error: {bundle.get('text', {}).get('div', 'Unknown error')}",
                    "resource_type": "Patient",
                    "data": []
                }

            # Extract patients from bundle
            patients = []
            if bundle and bundle.get("resourceType") == "Bundle":
                entries = bundle.get("entry", [])
                patients = [entry.get("resource") for entry in entries 
                          if entry.get("resource", {}).get("resourceType") == "Patient"]

            # Build pagination from bundle
            total = bundle.get("total", len(patients))
            
            # Enhanced logging for debugging pagination issues
            logger.info(f"FHIR Bundle info: total={total}, entries={len(patients)}, offset={_getpagesoffset}, count_param={search_params['_count']}")
            
            # Ensure we have a reasonable total - if FHIR server didn't provide accurate total, 
            # estimate based on current results
            if total is None or total < len(patients):
                # If no total provided or total seems too low, estimate conservatively
                if len(patients) == int(search_params["_count"]):
                    # Full page returned, likely more results exist
                    estimated_total = _getpagesoffset + len(patients) + 1  # At least one more
                    logger.warning(f"FHIR server didn't provide accurate total. Estimating: {estimated_total}")
                    total = estimated_total
                else:
                    # Partial page returned, this might be the last page
                    total = _getpagesoffset + len(patients)
                    logger.info(f"Partial page returned, calculated total: {total}")
            
            pagination = {
                "total": len(patients),  # Total matches current loaded records
                "count": len(patients),
                "has_next": False,  # No next page since we loaded all records
                "has_prev": False,  # No previous page since we start from beginning
                "offset": 0,  # Always start from offset 0 for filtered queries
                "per_page": len(patients),  # All records are on this "page"
                "page": 1,  # Always page 1 since we show all results
                "original_requested": _count,  # Keep track of what was originally requested
                "loaded_all_filtered": True  # Flag to indicate all filtered records are loaded
            }

            logger.info(f"FHIR search returned {len(patients)} patients (total: {total}, has_next: {pagination['has_next']}, page: {pagination['page']})")

            return {
                "success": True,
                "resource_type": "Patient",
                "data": patients,
                "pagination": pagination,
                "filters_applied": filters,
                "matching_patient_count": total,
                "search_method": "fhir_has_queries",
                "query_optimized": False,
                "server_page_size": int(search_params["_count"])
            }

        except Exception as e:
            error_msg = str(e)
            if "timeout" in error_msg.lower():
                if len(has_params) > 1:
                    user_msg = f"Complex filter query timed out. Try using fewer filters at once or be more specific with your selections. ({len(has_params)} filters applied)"
                else:
                    user_msg = f"Filter query timed out. Try being more specific with your filter selection."
            else:
                user_msg = f"FHIR search failed: {error_msg}"
            
            logger.error(f"Error in FHIR _has: search: {e}")
            return {
                "success": False,
                "message": user_msg,
                "resource_type": "Patient", 
                "data": [],
                "pagination": {"count": 0, "has_next": False, "total": 0},
                "query_complexity": len(has_params)
            }

    except Exception as e:
        logger.error(f"Error in metadata-driven patient search: {e}")
        return {
            "success": False,
            "message": str(e),
            "resource_type": "Patient",
            "data": [],
            "pagination": {"count": 0, "has_next": False, "total": None}
        }

async def handle_has_queries_optimized(search_params, base_url, _count, _getpagesoffset):
    """
    Handle _has: queries using optimized two-step approach:
    1. Query the target resource type to get patient references
    2. Query patients directly using the found references
    """
    try:
        logger.info("🚀 Starting optimized two-step query approach")
        
        # Extract _has: parameters and direct patient parameters
        has_params = {}
        patient_params = {}
        
        for key, value in search_params.items():
            if key.startswith('_has:'):
                has_params[key] = value
            else:
                patient_params[key] = value
        
        # Step 1: Query target resources to get patient references
        patient_refs = set()
        
        for has_key, has_value in has_params.items():
            # Parse _has: query: _has:Observation:patient:code
            parts = has_key.split(':')
            if len(parts) >= 4:
                resource_type = parts[1]
                search_param = parts[3]
                
                # Build direct resource query
                resource_url = f"{base_url}{resource_type}"
                resource_params = {
                    search_param: has_value,
                    "_count": "500",  # Increase limit to get more patient references
                    "_elements": "subject"  # Only get subject references
                }
                
                logger.info(f"🔍 Step 1: Querying {resource_type} with {search_param}={has_value}")
                
                try:
                    # Query the resource type directly
                    bundle = await fhir.fetch_bundle_with_deferred_handling(resource_url, resource_params)
                    resources = fhir.entries(bundle)
                    
                    # Extract patient references
                    for resource in resources:
                        subject_ref = resource.get('subject', {}).get('reference')
                        if subject_ref and subject_ref.startswith('Patient/'):
                            patient_id = subject_ref.replace('Patient/', '')
                            patient_refs.add(patient_id)
                    
                    logger.info(f"✅ Found {len(patient_refs)} unique patient references so far")
                    
                    # Don't limit patient refs - we'll handle pagination properly in Step 2
                    
                except Exception as e:
                    logger.warning(f"⚠️ Error querying {resource_type}: {str(e)}")
                    continue
        
        if not patient_refs:
            logger.info("❌ No matching patients found in Step 1")
            return {
                "success": True,
                "data": [],
                "pagination": {
                    "page": (_getpagesoffset // _count) + 1,
                    "per_page": _count,
                    "total": 0,
                    "has_next": False,
                    "has_prev": _getpagesoffset > 0,
                    "optimized": True
                },
                "matching_patient_count": 0,
                "query_optimized": True
            }
        
        logger.info(f"🎯 Step 2: Querying patients with {len(patient_refs)} patient IDs")
        
        # Convert patient_refs to list for proper indexing
        all_patient_ids = list(patient_refs)
        total_matches = len(all_patient_ids)
        
        # For filtered queries, return ALL matching patients (frontend does client-side pagination)
        # Don't slice by page - get all patient IDs
        page_patient_ids = all_patient_ids
        
        if not page_patient_ids:
            logger.info("❌ No patient IDs for this page offset")
            return {
                "success": True,
                "data": [],
                "pagination": {
                    "page": (_getpagesoffset // _count) + 1,
                    "per_page": _count,
                    "total": total_matches,
                    "has_next": False,
                    "has_prev": _getpagesoffset > 0,
                    "optimized": True
                },
                "matching_patient_count": total_matches,
                "query_optimized": True
            }
        
        logger.info(f"📄 Returning ALL {total_matches} matching patients for client-side pagination")
        
        # Step 2: Query patients directly using page-specific patient IDs
        # Handle potential URL length limits by batching if needed
        patients = []
        
        if len(page_patient_ids) > 100:
            # If too many IDs, batch them to avoid URL length limits
            logger.info(f"⚠️ Batching {len(page_patient_ids)} patient IDs to avoid URL length limits")
            batch_size = 50
            for i in range(0, len(page_patient_ids), batch_size):
                batch_ids = page_patient_ids[i:i + batch_size]
                patient_ids = ','.join(batch_ids)
                
                patient_url = f"{base_url}Patient"
                final_params = {
                    "_id": patient_ids,
                    "_count": str(len(batch_ids))
                }
                
                # Add any direct patient parameters (like gender, birthdate)
                for k, v in patient_params.items():
                    if not k.startswith('_has:') and k not in ['_count', '_getpagesoffset', '_total']:
                        final_params[k] = v
                
                logger.info(f"🔍 Step 2a: Querying batch {i//batch_size + 1} with {len(batch_ids)} patients")
                
                try:
                    bundle = await fhir.fetch_bundle_with_deferred_handling(patient_url, final_params)
                    batch_patients = fhir.entries(bundle)
                    patients.extend(batch_patients)
                    logger.info(f"✅ Batch {i//batch_size + 1} returned {len(batch_patients)} patients")
                except Exception as e:
                    logger.error(f"❌ Error in batch {i//batch_size + 1}: {str(e)}")
                    continue
        else:
            # Normal case - query all patient IDs at once
            patient_ids = ','.join(page_patient_ids)
            
            patient_url = f"{base_url}Patient"
            final_params = {
                "_id": patient_ids,
                "_count": str(len(page_patient_ids))
            }
            
            # Add any direct patient parameters (like gender, birthdate)
            for k, v in patient_params.items():
                if not k.startswith('_has:') and k not in ['_count', '_getpagesoffset', '_total']:
                    final_params[k] = v
            
            logger.info(f"🔍 Step 2: Querying ALL {len(page_patient_ids)} patients (no server-side pagination)")
            
            # Execute final patient query
            bundle = await fhir.fetch_bundle_with_deferred_handling(patient_url, final_params)
            patients = fhir.entries(bundle)
        
        logger.info(f"✅ Optimized query returned {len(patients)} patients total (frontend will handle pagination)")
        
        # Return all patients - frontend does client-side pagination
        return {
            "success": True,
            "data": patients,
            "pagination": {
                "page": 1,  # Always page 1 since we return all results
                "per_page": len(patients),  # All results per "page"
                "total": total_matches,
                "has_next": False,  # No next page since we return everything
                "has_prev": False,  # No previous page
                "optimized": True,
                "loaded_all_filtered": True  # Flag to indicate all filtered records are loaded
            },
            "matching_patient_count": total_matches,
            "query_optimized": True,
            "search_method": "two_step_optimized_all_results"
        }
        
    except Exception as e:
        logger.error(f"💥 Error in optimized _has: query handler: {str(e)}")
        return {
            "success": False,
            "message": f"Optimized query failed: {str(e)}",
            "data": [],
            "pagination": {
                "page": (_getpagesoffset // _count) + 1,
                "per_page": _count,
                "total": 0,
                "has_next": False,
                "has_prev": _getpagesoffset > 0,
                "optimized": False
            }
        }

def extract_filter_values(resource: Dict, path: str) -> List[str]:
    """
    Extract values from a FHIR resource using the filter path definition.
    Reuses the logic from filters.py for consistency.
    """
    from app.routers.filters import extract_value_by_path
    return extract_value_by_path(resource, path) or []

def extract_patient_id_from_resource(resource: Dict, resource_type: str) -> Optional[str]:
    """
    Extract patient ID from a FHIR resource based on resource type.
    """
    if not resource:
        return None

    # Different resources reference patients differently
    patient_ref_fields = []
    
    if resource_type in ['AllergyIntolerance', 'Immunization']:
        patient_ref_fields = ['patient']
    else:
        patient_ref_fields = ['subject', 'patient']
    
    for field in patient_ref_fields:
        ref = resource.get(field)
        if isinstance(ref, dict) and ref.get('reference'):
            ref_str = ref['reference']
            if ref_str.startswith('Patient/'):
                return ref_str.replace('Patient/', '')
            elif '/' not in ref_str:  # Assume bare ID
                return ref_str
    
    return None

# ----------------------------------------------------------------------
# MAIN SEARCH
# ----------------------------------------------------------------------

@router.get("/{resource_type}")
async def search_resources(
    resource_type: str,
    _count: int = Query(50, ge=1, le=1000),
    fetch_all: bool = Query(False, description="Fetch all available records (patients only) - DEPRECATED"),
    _getpages: Optional[str] = Query(None),
    _getpagesoffset: Optional[int] = Query(None, ge=0),
    request: Request = None
):
    """Search resources from FHIR server with server-side filtering and proper pagination.
    """
    try:
        params: Dict[str, str] = {}
        base_url = fhir.base().rstrip('/') + '/'

        if _getpages:
            url = base_url
            params["_getpages"] = _getpages
            params["_getpagesoffset"] = str(_getpagesoffset or 0)
            params["_count"] = str(_count)
            params["_bundletype"] = "searchset"
        else:
            url = base_url + resource_type

            # Count - FIXED: Don't fetch all data when filters are applied
            params["_count"] = str(_count)
            
            # Add offset parameter for HAPI FHIR pagination
            if _getpagesoffset and _getpagesoffset > 0:
                params["_getpagesoffset"] = str(_getpagesoffset)
                
            logger.info(f"Setting count to {_count} for paginated search, offset: {_getpagesoffset or 0}")

            # Search params
            search_params: Dict[str, str] = {}
            if request:
                query_dict = dict(request.query_params)
                search_params = process_search_parameters(query_dict, resource_type)
                params.update(search_params)

            # Server-side sort for all resource types
            if not any(k.startswith('_sort') for k in params.keys()):
                valid_sort = get_valid_sort_for_resource(resource_type, params)
                if valid_sort:
                    params["_sort"] = valid_sort

        # Check cache AFTER parameters are finalized (including sort)
        cache_key = None
        if resource_type.lower() == "patient":
            cache_key = _get_cache_key(params)
            cached_response = _get_cached_response(cache_key)
            if cached_response:
                return cached_response

        logger.info(f"Searching {resource_type} with params: {params}")

        # Execute initial fetch
        bundle = await fhir.fetch_bundle_with_deferred_handling(url, params)
        if isinstance(bundle, dict) and bundle.get("resourceType") == "OperationOutcome":
            # Try fallback before giving up
            fb = await try_fallback_search(url, params, resource_type)
            if fb is None:
                return {"success": False, "message": _extract_operation_outcome_text(bundle),
                        "resource_type": resource_type, "data": [],
                        "pagination": {"count": 0, "has_next": False, "total": None}}
            bundle = fb

        all_resources = fhir.entries(bundle)
        if resource_type.lower() != "patient":
            data = all_resources
        else:
            # Get all patients from the resources
            patients = [r for r in all_resources if r.get("resourceType") == "Patient"]
            
            # Apply data_availability filtering if specified
            if request and "data_availability" in dict(request.query_params):
                data = _filter_patients_by_resources(patients, all_resources, dict(request.query_params))
            else:
                # Just return patients as-is from server
                data = patients

        # Pagination info
        pagination = fhir.normalize_pagination(bundle)
        bundle_total = bundle.get("total")
        pagination["total"] = bundle_total if bundle_total is not None else (len(all_resources) if not pagination.get("has_next") else None)

        # Next/Prev params
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

        response = {
            "success": True,
            "resource_type": resource_type,
            "data": data,
            "pagination": pagination,
        }
        if resource_type.lower() == "patient":
            response["prioritized"] = False
            
        # Cache patient responses
        if cache_key and resource_type.lower() == "patient":
            _cache_response(cache_key, response)
            
            # Background prefetch next page
            asyncio.create_task(_prefetch_next_page(params, response.get("pagination", {})))
            
        return response

    except Exception as e:
        logger.error(f"Error in search_resources: {e}")
        return {"success": False, "message": f"Search failed: {e}",
                "resource_type": resource_type, "data": [],
                "pagination": {"count": 0, "has_next": False, "total": None}}

# ----------------------------------------------------------------------
# Pagination follow-up
# ----------------------------------------------------------------------

@router.get("/{resource_type}/page")
async def page_resource(resource_type: str, page_url: str):
    """Follow FHIR Bundle pagination links"""
    try:
        base = fhir.base().rstrip('/')
        if not (page_url.startswith(base) or page_url.startswith(base + "/")):
            raise HTTPException(status_code=400, detail="Invalid page_url")

        bundle = await get_json(page_url, None, params=None)
        if isinstance(bundle, dict) and bundle.get("resourceType") == "OperationOutcome":
            error_text = _extract_operation_outcome_text(bundle)
            return {"success": False, "message": f"FHIR server error: {error_text}",
                    "resource_type": resource_type, "data": [],
                    "pagination": {"count": 0, "has_next": False, "total": None}}

        data = fhir.entries(bundle)

        pagination = fhir.normalize_pagination(bundle)
        pagination["total"] = bundle.get("total")
        return {"success": True, "resource_type": resource_type, "data": data, "pagination": pagination}
    except Exception as e:
        logger.error(f"Error in page_resource: {e}")
        return {"success": False, "message": f"Pagination failed: {e}",
                "resource_type": resource_type, "data": [],
                "pagination": {"count": 0, "has_next": False, "total": None}}

# ----------------------------------------------------------------------
# Read resource(s)
# ----------------------------------------------------------------------

@router.get("/Patient/facets")
async def get_patient_facets(
    _count: int = Query(50, ge=1, le=1000),
    top_n: int = Query(10, ge=1, le=50),
    request: Request = None
):
    """Get facets (aggregated metadata) for patients, including resource counts and top conditions/observations"""
    try:
        params: Dict[str, str] = {}
        base_url = fhir.base().rstrip('/') + '/'
        url = base_url + "Patient"
        
        # Process search parameters if any
        search_params: Dict[str, str] = {}
        if request:
            query_dict = dict(request.query_params)
            search_params = process_search_parameters(query_dict, "Patient")
            params.update(search_params)
        
        params["_count"] = str(_count)
        
        # Define revinclude map for patient resources
        revinclude_map = {
            "Observation": "subject",
            "Condition": "subject", 
            "Procedure": "subject",
            "MedicationRequest": "subject",
            "Encounter": "subject",
            "DiagnosticReport": "subject",
            "DocumentReference": "subject",
            "AllergyIntolerance": "patient",
            "Immunization": "patient"
        }
        
        # Fetch patients first (without revinclude for now)
        logger.info(f"Fetching patients with params: {params}")
        bundle = await fhir.fetch_bundle_with_deferred_handling(url, params)
        
        if isinstance(bundle, dict) and bundle.get("resourceType") == "OperationOutcome":
            error_msg = _extract_operation_outcome_text(bundle)
            return {"success": False, "message": f"FHIR server error: {error_msg}", 
                    "facets": {"has_resource_counts": {}, "condition_codes": [], "observation_codes": []}}
        
        # Extract patients
        all_resources = fhir.entries(bundle)
        patients = [r for r in all_resources if r.get("resourceType") == "Patient"]
        patient_ids = [p.get("id") for p in patients if p.get("id")]
        
        # Resource types to count via _summary=count (one concurrent request each)
        resource_types_to_count = [
            "DiagnosticReport", "Observation", "Condition", "Procedure",
            "MedicationRequest", "Encounter", "DocumentReference",
            "AllergyIntolerance", "Immunization"
        ]

        async def _count_resource(resource_type: str) -> tuple[str, int]:
            """Fetch total count for a resource type using _summary=count"""
            try:
                rt_url = base_url + resource_type
                count_bundle = await fhir.fetch_bundle_with_deferred_handling(
                    rt_url, {"_summary": "count", "_count": "0"}
                )
                total = count_bundle.get("total", 0) if isinstance(count_bundle, dict) else 0
                return resource_type, total
            except Exception as exc:
                logger.warning(f"Could not count {resource_type}: {exc}")
                return resource_type, 0

        count_results = await asyncio.gather(
            *[_count_resource(rt) for rt in resource_types_to_count]
        )

        facets = {
            "has_resource_counts": {
                f"has_{rt}": count for rt, count in count_results
            },
            "condition_codes": [],
            "observation_codes": []
        }

        logger.info(f"Computed facets for {len(patients)} patients with {len(patient_ids)} IDs")

        return {
            "success": True,
            "facets": facets,
            "patient_count": len(patients),
            "total_resources": len(all_resources) - len(patients)
        }
        
    except Exception as e:
        logger.error(f"Error in get_patient_facets: {e}")
        return {
            "success": False, 
            "message": f"Failed to compute patient facets: {e}",
            "facets": {
                "has_resource_counts": {},
                "condition_codes": [],
                "observation_codes": []
            }
        }

@router.get("/{resource_type}/{id}")
async def read_resource(resource_type: str, id: str):
    """Read a specific resource by ID"""
    try:
        base_url = fhir.base().rstrip('/') + '/'
        url = base_url + f"{resource_type}/{id}"
        resource = await get_json(url, None)
        if isinstance(resource, dict) and resource.get("resourceType") == "OperationOutcome":
            return {"success": False, "message": f"FHIR server error: {_extract_operation_outcome_text(resource)}", "data": None}
        return {"success": True, "data": resource}
    except Exception as e:
        logger.error(f"Error in read_resource: {e}")
        return {"success": False, "message": f"Resource read failed: {e}", "data": None}

@router.get("/{resource_type}/{id}/detailed")
async def read_resource_detailed(resource_type: str, id: str):
    """Read a specific resource with field separation (for Patient details view)"""
    try:
        base_url = fhir.base().rstrip('/') + '/'
        url = base_url + f"{resource_type}/{id}"
        resource = await get_json(url, None)

        if isinstance(resource, dict) and resource.get("resourceType") == "OperationOutcome":
            return {"success": False, "message": f"FHIR server error: {_extract_operation_outcome_text(resource)}",
                    "fixed": {}, "dynamic": {}, "all": None}

        if resource_type.lower() == "patient" and isinstance(resource, dict):
            separated = _separate_patient_fields(resource)
            return {"success": True, "fixed": separated["fixed"], "dynamic": separated["dynamic"],
                    "all": separated["all"], "resource_type": resource_type}

        return {"success": True, "fixed": {}, "dynamic": resource if resource else {},
                "all": resource, "resource_type": resource_type}
    except Exception as e:
        logger.error(f"Error in read_resource_detailed: {e}")
        return {"success": False, "message": f"Resource read failed: {e}",
                "fixed": {}, "dynamic": {}, "all": None}
