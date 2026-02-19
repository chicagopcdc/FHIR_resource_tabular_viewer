from fastapi import APIRouter
from datetime import datetime, timedelta
from app.services import fhir
from app.services.http import get_json
from app.config import config
from app.services.cache_manager import get_patient_cache_manager
import logging

router = APIRouter(prefix="/debug", tags=["debug"])
logger = logging.getLogger(__name__)

# Configuration cache
_config_cache = {
    "fhir_version": None,
    "server_info": None,
    "supported_resources": None,
    "cached_at": None
}
CONFIG_CACHE_DURATION = timedelta(hours=config.config_cache_duration_hours)

# ----------------------------------------------------------------------
# Helper Functions
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

# ----------------------------------------------------------------------
# Configuration and Status Endpoints
# ----------------------------------------------------------------------

@router.get("/config/status")
async def get_backend_status():
    """Get current backend status and configuration"""
    try:
        # Use cached configuration
        server_info = await _get_cached_config()
        
        fhir_status = "connected" if server_info else "error"
        fhir_details = server_info or {"error": "Failed to connect to FHIR server"}
        
        # Cache status
        cache_mgr = get_patient_cache_manager()
        cache_status = cache_mgr.get_stats()        
        
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
        cache_mgr = get_patient_cache_manager()
        cleared_count = await cache_mgr.clear()
        
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
        cache_mgr = get_patient_cache_manager()
        runtime_info = {
            "cache_stats": cache_mgr.get_stats(),
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
# Debug Endpoints
# ----------------------------------------------------------------------

@router.get("/server-test")
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

@router.get("/direct-test")
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
