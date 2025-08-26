# Dynamic FHIR Proxy Backend (FastAPI)

A **no-hardcoding** backend that proxies any FHIR server (R4/R5). It discovers resource types, exposes dynamic endpoints, paginates safely, and returns a schema sampler for building dynamic tables on the frontend.

## Run (Windows PowerShell)

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Open http://127.0.0.1:8000/docs

## Register a FHIR Server

```powershell
curl -X POST http://localhost:8000/api/servers ^
  -H "Content-Type: application/json" ^
  -d "{\"baseUrl\": \"https://hapi.fhir.org/baseR4\", \"auth\":{\"type\":\"none\"}}"
```

Copy the `serverId` from the response.

## Capabilities

```powershell
curl http://localhost:8000/api/servers/{serverId}/capabilities
```

## List Resources (supports ?exclude=)

```powershell
curl "http://localhost:8000/api/servers/{serverId}/resources?exclude=Patient,Observation"
```

## Fetch Resources (with pagination & search)

```powershell
curl "http://localhost:8000/api/servers/{serverId}/resources/Patient?count=25"
```

## Get One Resource

```powershell
curl "http://localhost:8000/api/servers/{serverId}/resources/Patient/123"
```

## Dynamic Schema Sampler

```powershell
curl "http://localhost:8000/api/servers/{serverId}/resources/Patient/schema?sample=10"
```

## Resolve a Reference

```powershell
curl "http://localhost:8000/api/servers/{serverId}/references/resolve?ref=Patient/123"
```

### Notes
- No caching; every call hits the FHIR server.
- Allowed search params derive from the server's CapabilityStatement.
- Flattening depth and array fan-out are bounded to protect performance.
- Simple rate-limiting is included to avoid overwhelming the upstream server.
