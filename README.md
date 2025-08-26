# FHIR Resource Tabular Viewer

A dynamic web application for exploring **FHIR (Fast Healthcare Interoperability Resources)** data.  

This project provides:  
- **FastAPI backend** (`fhir-backend-dynamic/`) — proxies a HAPI FHIR server, handles pagination, filtering, and normalizes responses.  
- **React frontend** (`src/`) — displays patient and resource data in a tabular format with dynamic tabs and filters.  

---

## ✨ Features
- Dynamic resource fetching 
- Pagination-first design (prevents memory crashes)
- Short ID vs UUID support
  - Short IDs → demographics only
  - UUIDs → complete synthetic records with linked clinical data
- Dynamic filtering ( more filters coming soon)
- Error resilience (graceful handling of empty data & API errors)

---

## 🧰 Prerequisites
- Git  
- Python 3.10+  
- Node.js 18+ (with npm)  
- A running FHIR server (HAPI FHIR recommended)  

---

##  Setup Instructions

### 1. Clone the Repository

git clone https://github.com/chicagopcdc/FHIR_resource_tabular_viewer.git
cd FHIR_resource_tabular_viewer
git checkout fhir-patient-viewer
##2. Backend Setup (FastAPI)
cd fhir-backend-dynamic
python -m venv venv
.\venv\Scripts\Activate.ps1    # Windows PowerShell
source venv/bin/activate     # Linux/Mac
pip install -r requirements.txt
Copy .env.example to .env and edit as needed:
cp .env.example .env
uvicorn main:app --reload --host 0.0.0.0 --port 8000
3. Frontend Setup (React)
cd ../src
npm install
Copy .env.example to .env.local:
cp .env.example .env.local
Run frontend:
npm start or (npm run dev)
