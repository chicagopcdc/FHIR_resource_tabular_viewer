# FHIR Resource Tabular Viewer (Modern UI & Performance)

A React + FastAPI application for browsing and searching FHIR (Fast Healthcare Interoperability Resources) data. This branch focuses on a complete overhaul of the frontend architecture for better performance, responsiveness, and a modern aesthetic.

---

## ✨ Modern UI & Performance Features
- **High-Performance Tables**: Migration to **TanStack Table (v8)** allows for smooth scrolling and pagination of large datasets (1000+ records) without lag.
- **Client-Side Caching**: **TanStack Query (v5)** manages all asynchronous data fetching, providing instant "go-back" navigation and reduced server load.
- **UI Refresh**: Integrated **shadcn/ui** components (Radix UI + Tailwind CSS v4) for a premium, consistent dashboard feel.
- **Refined Data Filtering**: Improved filter logic with synchronized sidebar and header controls for a better User Experience (UX).

---

## 🚀 Quick Start with Docker

You can run the modernized stack using a single command:

**1. Build & Start (Production Mode):**
```bash
docker compose up --build
```
*Frontend: http://localhost:3000 | Backend: http://localhost:8000*

**2. Development Mode (Hot-Reload):**
```bash
docker compose -f docker-compose.dev.yml up --build
```

---

## 🛠️ Updated Tech Stack
| Layer | Technology |
|---|---|
| Frontend Framework | React 19 + Vite |
| **Data Fetching** | **TanStack Query (v5)** |
| **Table Engine** | **TanStack Table (v8)** |
| **Styling** | **Tailwind CSS v4 + shadcn/ui** |
| Icons | Lucide React |
| Backend | FastAPI + Uvicorn |

---

## ⚙️ Architecture

```
Browser
  │
  ├─► :3000  (Frontend — React + Vite)
  │           │
  │           └─► Proxies /api/resources → :8000
  │
  └─► :8000  (Backend — FastAPI + Uvicorn)
              │
              └─► https://hapi.fhir.org/baseR4/ (Live Server)
```

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
All configuration is driven by `config.yaml` in the project root. The UI dynamically adapts to the filters and resources defined in the configuration file.
