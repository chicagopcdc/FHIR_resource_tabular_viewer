# FHIR Resource Tabular Viewer (Multi-Source Edition)

A React + FastAPI application for browsing and searching FHIR (Fast Healthcare Interoperability Resources) data in a tabular format. This branch introduces **Multi-Source Ingestion**, allowing you to dynamically switch between a live FHIR server and local/remote files.

---

## 🚀 Key Branch Features: Multi-Source Ingestion
This branch introduces the architectural extension to ingest FHIR resources from multiple sources:
- **Local File Upload**: Drag-and-drop JSON/NDJSON FHIR bundles (e.g., Synthea-generated data) to view them in-memory.
- **S3 Bucket Connector**: Stream FHIR resources direct from AWS S3 buckets using `boto3`.
- **Dynamic Source UI**: A yellow UI indicator appears when viewing non-live data, allowing you to quickly switch back to the live FHIR server.
- **In-Memory Store**: Data is parsed into a high-performance singleton `FileStore` that emulates FHIR search and pagination APIs.

---

## 📦 Quick Start with Docker

You can run the entire stack (Frontend + Backend) using a single command:

**1. Build & Start (Production Mode):**
```bash
docker compose up --build
```
*Frontend: http://localhost:3000 | Backend: http://localhost:8000*

**2. Development Mode (with Hot-Reload):**
```bash
docker compose -f docker-compose.dev.yml up --build
```

---

## 🛠️ API Reference (New Multi-Source Endpoints)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/sources/file` | Upload a local FHIR bundle (JSON/NDJSON) |
| `GET`  | `/api/sources/active` | Get details of the currently active data source |
| `DELETE` | `/api/sources/file` | Clear uploaded data and revert to live FHIR server |
| `POST` | `/api/sources/bucket/s3` | Connect and ingest from an S3 bucket |
| `GET`  | `/api/resources/{type}` | Serves data from the active source (Live or File) |

---

## ⚙️ Architecture

```
Browser
  │
  ├─► :3000  (Frontend — React + Vite)
  │           │
  │           └─► Proxies /api/sources → :8000
  │
  └─► :8000  (Backend — FastAPI + In-Memory FileStore)
              │
              ├─► AWS S3 (via Connector)
              ├─► Local File Uploads
              └─► https://hapi.fhir.org/baseR4/ (Live Server)
```

---

## 🛠️ Tech Stack
- **Frontend**: React 19, Vite, Tailwind CSS v4, Lucide Icons.
- **Backend**: FastAPI, Uvicorn, `httpx` (async).
- **Cloud/File**: `boto3` (S3), `tenacity` (retries), singleton `FileStore`.
- **Containerization**: Docker + Docker Compose.

---

## 🔧 Local Development (without Docker)

### Backend
```bash
cd fhir-backend-dynamic
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
# From project root
npm install --legacy-peer-deps
npm run dev
```

---

## 📄 Configuration
All configuration is driven by `config.yaml` in the project root. You can override the live server URL using the `FHIR_BASE_URL` environment variable.
