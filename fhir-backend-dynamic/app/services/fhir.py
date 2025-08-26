# app/services/fhir.py - Enhanced FHIR Service with URL Fixing and Deferred Pagination
import os
from typing import Dict, List, Any, Optional
from urllib.parse import urlparse, parse_qs
from app.services.http import get_json
import logging

logger = logging.getLogger(__name__)

BASE_URL = os.getenv("FHIR_BASE_URL", "https://hapi.fhir.org/baseR4/")
if not BASE_URL.endswith("/"):
    BASE_URL += "/"

def base() -> str:
    """Get FHIR base URL with proper trailing slash"""
    return BASE_URL

async def get_capabilities() -> Dict:
    """Get FHIR server capabilities - FIXED URL construction"""
    # CRITICAL FIX: Use proper string concatenation instead of urljoin
    url = BASE_URL + "metadata"
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
        return []
    
    resources = []
    
    # Log bundle structure for debugging
    if bundle.get("resourceType") == "Bundle":
        total = bundle.get("total")
        entry_count = len(bundle.get("entry", []))
        logger.debug(f"Bundle: type={bundle.get('type')}, total={total}, entry_count={entry_count}")
    
    for entry in (bundle.get("entry") or []):
        if not isinstance(entry, dict):
            continue
        if isinstance(entry.get("resource"), dict):  # normal case
            resources.append(entry["resource"])
        elif entry.get("resourceType"):              # some servers inline the resource
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
    CRITICAL FIX: Fetch bundle and handle HAPI's deferred paging automatically
    This fixes the empty bundle issue when HAPI defers the first page
    """
    logger.info(f"Fetching bundle from: {url} with params: {params}")
    
    # Get initial bundle
    bundle = await get_json(url, None, params=params)
    
    # Check if this is a Bundle with deferred paging
    if isinstance(bundle, dict) and bundle.get("resourceType") == "Bundle":
        entries_list = bundle.get("entry", [])
        
        # If we have an empty bundle but there's a next link, this is deferred paging
        if not entries_list:
            next_url = next_link(bundle)
            if next_url:
                logger.info(f"HAPI deferred paging detected. Following next link: {next_url}")
                
                # CRITICAL: Follow the next link to get actual data
                actual_bundle = await get_json(next_url, None, params=None)
                
                # Preserve the original bundle's metadata but use the actual data
                if isinstance(actual_bundle, dict) and actual_bundle.get("entry"):
                    logger.info(f"Retrieved {len(actual_bundle.get('entry', []))} entries from deferred link")
                    
                    # Update the bundle with actual entries while preserving pagination links
                    bundle["entry"] = actual_bundle.get("entry", [])
                    
                    # Update pagination links from the actual bundle
                    if actual_bundle.get("link"):
                        bundle["link"] = actual_bundle.get("link")
                    
                    # Update total if available
                    if actual_bundle.get("total") is not None:
                        bundle["total"] = actual_bundle.get("total")
                else:
                    logger.warning("Deferred link returned empty or invalid bundle")
            else:
                logger.info("Empty bundle with no next link - truly empty result set")
        else:
            logger.info(f"Bundle contains {len(entries_list)} entries directly")
    
    return bundle