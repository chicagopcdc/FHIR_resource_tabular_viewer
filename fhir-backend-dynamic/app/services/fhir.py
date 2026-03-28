# app/services/fhir.py - FIXED: Robust FHIR service with better error handling
import os
from typing import Dict, List, Any, Optional, Set, Tuple
from urllib.parse import urlparse, parse_qs
from app.services.http import get_json
from app.config import config
import logging
import re
from datetime import datetime

logger = logging.getLogger(__name__)

def base() -> str:
    """Get FHIR base URL with proper trailing slash from config"""
    base_url = config.fhir_base_url
    if not base_url.endswith("/"):
        base_url += "/"
    return base_url

async def get_capabilities() -> Dict:
    """Get FHIR server capabilities using config"""
    url = base() + "metadata"
    return await get_json(url, None)

def parse_resources_from_capabilities(cap: Dict) -> List[Dict]:
    """Extract resource information from capabilities statement"""
    out = []
    for r in (cap.get("rest") or []):
        for res in (r.get("resource") or []):
            out.append({
                "type": res.get("type"),
                "interactions": [i.get("code") for i in (res.get("interaction") or []) if isinstance(i, dict)],
                "searchParams": [
                    {"name": sp.get("name"), "type": sp.get("type"), "definition": sp.get("definition")}
                    for sp in (res.get("searchParam") or [])
                ],
            })
    return out

def list_resource_types(cap: Dict) -> List[str]:
    """Get list of supported resource types from capabilities"""
    return sorted({x.get("type") for x in parse_resources_from_capabilities(cap) if x.get("type")})

def capability_dict(cap: Dict) -> Dict[str, Any]:
    """Convert capabilities to structured dictionary"""
    return {
        "fhirVersion": cap.get("fhirVersion"),
        "resources": parse_resources_from_capabilities(cap),
        "security": cap.get("security"),
    }

def entries(bundle: Dict) -> List[Dict]:
    """Extract resources from a FHIR Bundle with robust handling"""
    if not isinstance(bundle, dict):
        logger.warning("Bundle is not a dictionary")
        return []
    
    resources = []
    
    if bundle.get("resourceType") == "Bundle":
        total = bundle.get("total")
        entry_list = bundle.get("entry", [])
        logger.debug(f"Bundle: type={bundle.get('type')}, total={total}, entries={len(entry_list)}")
    
    for entry in (bundle.get("entry") or []):
        if not isinstance(entry, dict):
            continue
            
        if isinstance(entry.get("resource"), dict):
            resources.append(entry["resource"])
        elif entry.get("resourceType"):  # Some servers inline the resource
            resources.append(entry)
    
    logger.debug(f"Extracted {len(resources)} resources from bundle")
    return resources

def next_link(bundle: Dict) -> Optional[str]:
    """Extract next page link from Bundle"""
    for ln in (bundle.get("link") or []):
        if ln.get("relation") == "next":
            next_url = ln.get("url")
            logger.debug(f"Found next link: {next_url}")
            return next_url
    return None

def prev_link(bundle: Dict) -> Optional[str]:
    """Extract previous page link from Bundle"""
    for ln in (bundle.get("link") or []):
        if ln.get("relation") in ("prev", "previous"):
            prev_url = ln.get("url")
            logger.debug(f"Found prev link: {prev_url}")
            return prev_url
    return None

def normalize_pagination(bundle: Dict) -> Dict[str, Any]:
    """Return consistent pagination computed from extracted resources"""
    nxt = next_link(bundle)
    prv = prev_link(bundle)
    extracted = entries(bundle)
    
    pagination = {
        "total": bundle.get("total"),
        "has_next": bool(nxt),
        "has_prev": bool(prv),
        "count": len(extracted),
    }
    
    logger.debug(f"Normalized pagination: {pagination}")
    return pagination

def is_pagination_url(url: str) -> bool:
    """Check if URL contains pagination tokens"""
    try:
        parsed = urlparse(url)
        query_params = parse_qs(parsed.query)
        return "_getpages" in query_params
    except:
        return False

def extract_pagination_token(url: str) -> Optional[str]:
    """Extract _getpages token from URL"""
    try:
        parsed = urlparse(url)
        query_params = parse_qs(parsed.query)
        pages_list = query_params.get("_getpages", [])
        return pages_list[0] if pages_list else None
    except:
        return None

async def fetch_bundle_with_deferred_handling(url: str, params: Optional[Dict] = None) -> Dict:
    """
    Enhanced bundle fetching with deferred pagination handling.
    Handles HAPI's deferred paging and server errors gracefully.
    When a local file source is active, serves all requests from the
    in-memory FileStore instead of making any HTTP calls.
    """
    # --- File store short-circuit (lazy import avoids circular imports) ---
    from app.services import source_registry  # noqa: PLC0415
    if source_registry.is_file_active():
        return source_registry.get_file_store().query(url, params or {})
    # --- End file store short-circuit ---

    logger.info(f"Fetching bundle from: {url}")
    if params:
        logger.info(f"With params: {params}")

    # Filter out custom parameters that aren't part of FHIR standard
    fhir_params = {}
    if params:
        custom_params = {'fetch_all'}  # Add custom parameters to filter out
        fhir_params = {k: v for k, v in params.items() if k not in custom_params}
        if len(fhir_params) != len(params):
            logger.info(f"Filtered params for FHIR server: {fhir_params}")
    
    try:
        # Primary request with filtered parameters
        bundle = await get_json(url, None, params=fhir_params)
        
        if not isinstance(bundle, dict):
            logger.error(f"Invalid response type: {type(bundle)}")
            return create_empty_bundle()
        
        # Check for server errors
        if bundle.get("resourceType") == "OperationOutcome":
            logger.error(f"Server returned OperationOutcome: {bundle}")
            return bundle  # Return the error to be handled upstream
        
        # Check if this is a valid Bundle
        if bundle.get("resourceType") != "Bundle":
            logger.warning(f"Unexpected resource type: {bundle.get('resourceType')}")
            return create_empty_bundle()
        
        entries_list = bundle.get("entry", [])
        logger.info(f"Bundle returned {len(entries_list)} entries")
        
        # Handle HAPI deferred paging (empty bundle with next link)
        if not entries_list:
            next_url = next_link(bundle)
            if next_url:
                logger.info("HAPI deferred paging detected - following next link")
                
                try:
                    deferred_bundle = await get_json(next_url, None, params=None)
                    
                    if (isinstance(deferred_bundle, dict) and 
                        deferred_bundle.get("resourceType") == "Bundle" and
                        deferred_bundle.get("entry")):
                        
                        logger.info(f"Deferred bundle returned {len(deferred_bundle.get('entry', []))} entries")
                        
                        # Merge metadata from original with entries from deferred
                        bundle["entry"] = deferred_bundle.get("entry", [])
                        
                        # Update links from the deferred bundle
                        if deferred_bundle.get("link"):
                            bundle["link"] = deferred_bundle.get("link")
                        
                        # Update total if available
                        if deferred_bundle.get("total") is not None:
                            bundle["total"] = deferred_bundle.get("total")
                        
                        return bundle
                    else:
                        logger.warning("Deferred link returned empty or invalid bundle")
                        
                except Exception as e:
                    logger.error(f"Failed to fetch deferred bundle: {e}")
            else:
                logger.info("Empty bundle with no next link - truly empty result set")
        
        return bundle
        
    except Exception as e:
        logger.error(f"Error fetching bundle: {e}")
        # Return empty bundle instead of failing completely
        return create_empty_bundle()

def create_empty_bundle() -> Dict:
    """Create an empty FHIR Bundle"""
    return {
        "resourceType": "Bundle",
        "type": "searchset",
        "total": 0,
        "entry": [],
        "link": []
    }

# =============================================================================
# NEW: Dynamic Capability Detection and Patient Prioritization Helpers
# =============================================================================

def detect_revinclude_support(cap: Dict) -> Dict[str, List[str]]:
    """Detect which _revinclude parameters are supported by the server"""
    revinclude_map = {}
    
    for rest in (cap.get("rest") or []):
        for resource in (rest.get("resource") or []):
            resource_type = resource.get("type")
            if not resource_type:
                continue
                
            # Check for _revinclude support in search parameters
            search_params = resource.get("searchParam") or []
            supports_revinclude = any(
                sp.get("name") == "_revinclude" for sp in search_params
            )
            
            if supports_revinclude:
                # Map clinical resource types to their patient reference paths
                clinical_resources = {
                    "Observation": ["subject", "patient"],
                    "Condition": ["subject", "patient"], 
                    "Encounter": ["subject", "patient"],
                    "MedicationRequest": ["subject", "patient"],
                    "Procedure": ["subject", "patient"],
                    "AllergyIntolerance": ["patient"],
                    "Immunization": ["patient"],
                    "DiagnosticReport": ["subject", "patient"],
                    "DocumentReference": ["subject", "patient"],
                    "CareTeam": ["subject", "patient"],
                    "CarePlan": ["subject", "patient"],
                    "ServiceRequest": ["subject", "patient"]
                }
                
                if resource_type in clinical_resources:
                    revinclude_map[resource_type] = clinical_resources[resource_type]
    
    logger.info(f"Detected _revinclude support for: {list(revinclude_map.keys())}")
    return revinclude_map

def build_revinclude_params(revinclude_map: Dict[str, List[str]], prefer_iterate: bool = True) -> List[str]:
    """Build _revinclude parameter list from capability map"""
    revinclude_params = []
    
    for resource_type, reference_paths in revinclude_map.items():
        # Try the first reference path (usually 'subject' or 'patient')
        ref_path = reference_paths[0]
        
        # Add :iterate if preferred and likely supported
        if prefer_iterate and resource_type in ["Observation", "Condition", "Encounter"]:
            revinclude_params.append(f"{resource_type}:{ref_path}:iterate")
        else:
            revinclude_params.append(f"{resource_type}:{ref_path}")
    
    return revinclude_params

def is_uuid_format(patient_id: str) -> bool:
    """Check if patient ID follows UUID format"""
    if not patient_id or not isinstance(patient_id, str):
        return False
    uuid_pattern = r'^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$'
    return bool(re.match(uuid_pattern, patient_id))

def parse_meta_last_updated(resource: Dict) -> Optional[datetime]:
    """Parse meta.lastUpdated timestamp from FHIR resource"""
    try:
        meta = resource.get("meta", {})
        last_updated = meta.get("lastUpdated")
        if not last_updated:
            return None
            
        # Handle various ISO datetime formats
        # Remove 'Z' suffix and parse
        if last_updated.endswith('Z'):
            last_updated = last_updated[:-1] + '+00:00'
        
        # Try parsing with different formats
        for fmt in [
            "%Y-%m-%dT%H:%M:%S.%f%z",
            "%Y-%m-%dT%H:%M:%S%z", 
            "%Y-%m-%dT%H:%M:%S.%f",
            "%Y-%m-%dT%H:%M:%S"
        ]:
            try:
                return datetime.strptime(last_updated, fmt)
            except ValueError:
                continue
                
        return None
    except Exception as e:
        logger.debug(f"Failed to parse lastUpdated: {e}")
        return None

def extract_patient_references_from_bundle(bundle: Dict) -> Set[str]:
    """Extract patient IDs referenced by included resources"""
    referenced_patients = set()
    
    for entry in bundle.get("entry", []):
        resource = entry.get("resource")
        if not resource:
            continue
            
        resource_type = resource.get("resourceType")
        
        # Skip Patient resources themselves
        if resource_type == "Patient":
            continue
            
        # Extract patient references from various fields
        for field in ["subject", "patient"]:
            ref = resource.get(field, {})
            if isinstance(ref, dict) and ref.get("reference"):
                ref_str = ref["reference"]
                # Handle both "Patient/123" and "123" formats
                if ref_str.startswith("Patient/"):
                    patient_id = ref_str.replace("Patient/", "")
                    referenced_patients.add(patient_id)
                elif not "/" in ref_str:  # Assume bare ID
                    referenced_patients.add(ref_str)
    
    return referenced_patients

def rank_patients_by_data_richness(
    patients: List[Dict], 
    referenced_patients: Set[str]
) -> List[Dict]:
    """Rank patients prioritizing those with related clinical data"""
    
    def get_ranking_key(patient: Dict) -> Tuple[int, int, int, str]:
        patient_id = patient.get("id", "")
        
        # Priority 1: Has related clinical data (1 = has data, 0 = no data)
        has_related_data = 1 if patient_id in referenced_patients else 0
        
        # Priority 2: UUID format preferred (1 = UUID, 0 = not UUID)
        is_uuid = 1 if is_uuid_format(patient_id) else 0
        
        # Priority 3: Newer lastUpdated preferred (negative timestamp for DESC sort)
        last_updated = parse_meta_last_updated(patient)
        last_updated_priority = int(last_updated.timestamp()) if last_updated else 0
        
        # Return tuple for sorting (higher values first, except for ID which is ASC)
        return (has_related_data, is_uuid, last_updated_priority, patient_id)
    
    # Sort by the ranking key (DESC for first 3, ASC for ID)
    ranked_patients = sorted(
        patients, 
        key=get_ranking_key,
        reverse=True  # This will sort DESC by the tuple comparison
    )
    
    logger.info(f"Ranked {len(patients)} patients - {len(referenced_patients)} have related data")
    return ranked_patients

def compute_patient_facets(
    bundle: Dict, 
    patient_ids: List[str], 
    revinclude_map: Dict[str, List[str]],
    top_n: int = 10
) -> Dict[str, Any]:
    """Compute dynamic facets from bundle with revincluded resources"""
    facets = {
        "has_resource_counts": {},
        "condition_codes": [],
        "observation_codes": []
    }
    
    # Track which patients have which resource types
    patient_resources = {pid: set() for pid in patient_ids}
    condition_codes = {}
    observation_codes = {}
    
    # Process all resources in the bundle
    for entry in bundle.get("entry", []):
        resource = entry.get("resource")
        if not resource:
            continue
            
        resource_type = resource.get("resourceType")
        if resource_type == "Patient":
            continue
            
        # Extract patient reference
        patient_ref = None
        for field in ["subject", "patient"]:
            ref = resource.get(field, {})
            if isinstance(ref, dict) and ref.get("reference"):
                ref_str = ref["reference"]
                if ref_str.startswith("Patient/"):
                    patient_ref = ref_str.replace("Patient/", "")
                    break
                elif not "/" in ref_str:  # Assume bare ID
                    patient_ref = ref_str
                    break
        
        if patient_ref and patient_ref in patient_resources:
            patient_resources[patient_ref].add(resource_type)
            
            # Extract codes for specific resource types
            if resource_type == "Condition":
                code_info = extract_code_info(resource)
                if code_info:
                    key = f"{code_info['system']}|{code_info['code']}"
                    if key not in condition_codes:
                        condition_codes[key] = {
                            "system": code_info["system"],
                            "code": code_info["code"], 
                            "display": code_info["display"],
                            "count": 0
                        }
                    condition_codes[key]["count"] += 1
                    
            elif resource_type == "Observation":
                code_info = extract_code_info(resource)
                if code_info:
                    key = f"{code_info['system']}|{code_info['code']}"
                    if key not in observation_codes:
                        observation_codes[key] = {
                            "system": code_info["system"],
                            "code": code_info["code"],
                            "display": code_info["display"],
                            "count": 0
                        }
                    observation_codes[key]["count"] += 1
    
    # Compute resource type counts
    for resource_type in revinclude_map.keys():
        count = sum(1 for resources in patient_resources.values() if resource_type in resources)
        facets["has_resource_counts"][f"has_{resource_type}"] = count
    
    # Sort and limit top codes
    facets["condition_codes"] = sorted(
        condition_codes.values(),
        key=lambda x: x["count"],
        reverse=True
    )[:top_n]
    
    facets["observation_codes"] = sorted(
        observation_codes.values(),
        key=lambda x: x["count"],
        reverse=True
    )[:top_n]
    
    return facets

def extract_code_info(resource: Dict) -> Optional[Dict[str, str]]:
    """Extract code system, code, and display from FHIR resource"""
    # Try different code fields based on resource type
    code_fields = ["code", "category", "type"]
    
    for field in code_fields:
        code_elem = resource.get(field)
        if not code_elem:
            continue
            
        # Handle CodeableConcept
        if isinstance(code_elem, dict):
            codings = code_elem.get("coding", [])
            if codings and isinstance(codings, list):
                coding = codings[0]  # Use first coding
                return {
                    "system": coding.get("system", "unknown"),
                    "code": coding.get("code", "unknown"),
                    "display": coding.get("display") or code_elem.get("text", "Unknown")
                }
        # Handle array of CodeableConcepts
        elif isinstance(code_elem, list) and code_elem:
            first_elem = code_elem[0]
            if isinstance(first_elem, dict):
                codings = first_elem.get("coding", [])
                if codings and isinstance(codings, list):
                    coding = codings[0]
                    return {
                        "system": coding.get("system", "unknown"),
                        "code": coding.get("code", "unknown"),
                        "display": coding.get("display") or first_elem.get("text", "Unknown")
                    }
    
    return None