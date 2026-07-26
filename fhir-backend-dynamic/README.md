# Dynamic FHIR Proxy Backend (FastAPI)

A **no-hardcoding** backend that proxies any FHIR server (R4/R5). It discovers resource types, exposes dynamic endpoints, paginates safely, and returns a schema sampler for building dynamic tables on the frontend. It can also load FHIR resources from uploaded local files and Amazon S3 objects.

## Requirements

Use **Python 3.12**. The pinned `pydantic` version has no prebuilt wheel for Python 3.14 and fails to compile there, so a newer interpreter will break `pip install` with a Rust build error. Python 3.10 to 3.12 work.

## Run (Windows PowerShell)

```powershell
py -3.12 -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Run (macOS / Linux)

```bash
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload --port 8000
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

## Data Sources (local file and S3)

Besides proxying a live server, the backend can load FHIR resources from an uploaded file or an S3 object and serve them through the same tabular endpoints. Supported formats: a single resource, a Bundle, a JSON array of resources, or NDJSON (one resource per line, the FHIR bulk-export format).

Upload a local file:

```bash
curl -F "file=@patients.ndjson" http://localhost:8000/api/sources/upload
```

Load an object from S3 (credentials optional, falls back to the default AWS chain):

```bash
curl -X POST http://localhost:8000/api/sources/s3 \
  -H "Content-Type: application/json" \
  -d '{"uri": "s3://my-bucket/patients.ndjson"}'
```

Both return a `source_id`. Then explore it:

```bash
# List resource types and counts
curl http://localhost:8000/api/sources/{sourceId}

# Search a type (q filters, sort by a dotted column path)
curl "http://localhost:8000/api/sources/{sourceId}/resources/Observation?q=glucose&sort=code.coding[0].display&order=asc&count=25"

# Inferred table columns for a type
curl "http://localhost:8000/api/sources/{sourceId}/resources/Observation/schema?sample=20"

# One resource by id
curl "http://localhost:8000/api/sources/{sourceId}/resources/Observation/{id}"
```

In the frontend, this is the "File and S3 Viewer" at `/local`. Very large files (over 20 MB) are previewed from the first portion so multi-GB exports load quickly.

### Notes
- No caching; every call hits the FHIR server.
- Allowed search params derive from the server's CapabilityStatement.
- Flattening depth and array fan-out are bounded to protect performance.
- Simple rate-limiting is included to avoid overwhelming the upstream server.
