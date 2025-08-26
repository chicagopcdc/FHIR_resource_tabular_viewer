from fastapi import APIRouter, HTTPException
from typing import Dict
from app.models.server import ServerRegistration
from app.services import registry, fhir
import logging

# FIXED: Correct prefix to avoid double /api/api/servers
router = APIRouter(prefix="/servers", tags=["servers"])
logger = logging.getLogger(__name__)

@router.post("")
async def register_server(server_config: ServerRegistration):
    try:
        server_id = f"server_{len(registry.list_servers()) + 1}"
        registry.register_server(server_id, server_config)
        return {
            "success": True,
            "server_id": server_id,
            "message": f"Server registered with ID: {server_id}"
        }
    except Exception as e:
        logger.error(f"Error registering server: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{server_id}/capabilities")
async def get_server_capabilities(server_id: str):
    try:
        server_config = registry.get_server(server_id)
        cap = await fhir.get_capabilities()
        
        # Dynamic capabilities extraction
        fhir_version = cap.get("fhirVersion", "Unknown")
        resource_types = fhir.list_resource_types(cap)
        
        # Extract search parameters dynamically
        search_params = {}
        for rest in cap.get("rest", []):
            for resource_info in rest.get("resource", []):
                resource_type = resource_info.get("type")
                if resource_type:
                    params = []
                    for param in resource_info.get("searchParam", []):
                        params.append({
                            "name": param.get("name"),
                            "type": param.get("type"),
                            "definition": param.get("definition")
                        })
                    search_params[resource_type] = params
        
        supports = {
            "_text": check_global_search_support(cap, "_text"),
            "_content": check_global_search_support(cap, "_content"), 
            "_has": check_global_search_support(cap, "_has"),
            "_include": check_global_search_support(cap, "_include"),
            "_revinclude": check_global_search_support(cap, "_revinclude")
        }
        
        return {
            "success": True,
            "server_id": server_id,
            "server_url": str(server_config.baseUrl),
            "fhirVersion": fhir_version,
            "resources": resource_types,
            "searchParams": search_params,
            "supports": supports
        }
        
    except KeyError:
        raise HTTPException(status_code=404, detail="Server not found")
    except Exception as e:
        logger.error(f"Error getting server capabilities: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("")
async def list_servers():
    try:
        servers = registry.list_servers()
        server_list = []
        
        for server_id, config in servers.items():
            server_list.append({
                "id": server_id,
                "name": server_id.replace("_", " ").title(),
                "baseUrl": str(config.baseUrl),
                "auth_type": config.auth.type
            })
        
        return {
            "success": True,
            "data": server_list
        }
    except Exception as e:
        logger.error(f"Error listing servers: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

def check_global_search_support(cap: Dict, param_name: str) -> bool:
    """Check if a global search parameter is supported"""
    try:
        for rest in cap.get("rest", []):
            # Check global search params
            for param in rest.get("searchParam", []):
                if param.get("name") == param_name:
                    return True
            
            # Check resource-level search params
            for resource_info in rest.get("resource", []):
                for param in resource_info.get("searchParam", []):
                    if param.get("name") == param_name:
                        return True
        return False
    except:
        return False