from typing import Dict, Optional
from app.models.server import ServerRegistration, AuthConfig
import os

# Simple in-memory registry for now
_SERVERS: Dict[str, ServerRegistration] = {}

def register_server(server_id: str, server_config: ServerRegistration) -> None:
    """Register a FHIR server configuration"""
    _SERVERS[server_id] = server_config

def get_server(server_id: str) -> ServerRegistration:
    """Get server configuration by ID"""
    if server_id not in _SERVERS:
        raise KeyError(f"Server '{server_id}' not found")
    return _SERVERS[server_id]

def list_servers() -> Dict[str, ServerRegistration]:
    """List all registered servers"""
    return _SERVERS.copy()

def remove_server(server_id: str) -> bool:
    """Remove a server registration"""
    if server_id in _SERVERS:
        del _SERVERS[server_id]
        return True
    return False

# Initialize with default HAPI server to match your current setup
def init_default_server():
    """Initialize with the default HAPI FHIR server"""
    base_url = os.getenv("FHIR_BASE_URL", "https://hapi.fhir.org/baseR4/")
    
    default_server = ServerRegistration(
        baseUrl=base_url,
        auth=AuthConfig(type="none")
    )
    
    register_server("default", default_server)
    register_server("current", default_server)  # Alias for frontend compatibility

# Call initialization
init_default_server()
