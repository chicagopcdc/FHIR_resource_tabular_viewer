from fastapi import APIRouter, HTTPException, Query
from urllib.parse import urljoin
from app.services import registry, fhir
from app.services.http import get_json
from app.services.errors import map_operation_outcome

router = APIRouter(prefix="/servers", tags=["references"])

@router.get("/{server_id}/references/resolve")
async def resolve_reference(server_id: str, ref: str = Query(..., description="FHIR reference like ResourceType/id")):
    try:
        server = registry.get_server(server_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="serverId not found")
    if "/" not in ref:
        raise HTTPException(status_code=400, detail="ref must be ResourceType/id")
    url = urljoin(fhir.base(server), ref)
    resource = await get_json(url, server)
    if isinstance(resource, dict) and resource.get("__error__"):
        detail = map_operation_outcome(resource.get("__payload__"))
        raise HTTPException(status_code=resource.get("__status__", 502), detail=detail.get("message"))
    return {"success": True, "data": resource}
