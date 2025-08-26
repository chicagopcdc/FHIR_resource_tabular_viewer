

```
1. Clone the repository
2. Backend setup
3. Frontend setup
```

---

````markdown
#  FHIR Resource Tabular Viewer

A dynamic web application for exploring **FHIR (Fast Healthcare Interoperability Resources)** data.

This project includes:  
- **FastAPI backend** (`fhir-backend-dynamic/`) — proxies a HAPI FHIR server, handles pagination, filtering, and normalizes responses.  
- **React frontend** (`src/`) — displays patient and resource data in a tabular format with dynamic tabs and filters.

---

## ✨ Features
- Dynamic fetching of FHIR resources (Patient, Observation, Condition, etc.)
- Pagination-first design (prevents memory crashes)
- Short ID vs UUID handling:
  - Short IDs → demographics only
  - UUIDs → full clinical data
- Dynamic filters (active, last updated, name; more coming soon)
- Robust error handling and graceful empty states

---

## Prerequisites
- Git  
- Python 3.10+  
- Node.js 18+ (with npm)  
- A running FHIR server (HAPI FHIR recommended)  

---

## Setup Instructions

### 1. Clone the Repository
```
git clone https://github.com/chicagopcdc/FHIR_resource_tabular_viewer.git
````

### 2. Change to Project Directory

```
cd FHIR_resource_tabular_viewer
```

### 3. Checkout the Latest Project Branch

```
git checkout fhir-patient-viewer
```

---

##  Backend Setup (FastAPI)

### 4. Change to Backend Folder

```
cd fhir-backend-dynamic
```

### 5. Create a Virtual Environment

```
python -m venv venv
```

### 6. Activate Virtual Environment (Windows PowerShell)

```
.\venv\Scripts\Activate.ps1
```

> For Linux/Mac:

```
source venv/bin/activate
```

### 7. Install Python Dependencies

```
pip install -r requirements.txt
```

### 8. Create `.env` File

```
cp .env.example .env
```

> Edit `.env` if needed to match your FHIR server URL.

### 9. Run the Backend Server

```
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Backend will run at: **[http://localhost:8000/api/resources/{resourceType}](http://localhost:8000/api/resources/{resourceType})**

---

##  Frontend Setup (React)

### 10. Open a New Terminal Window

### 11. Change to Frontend Folder

```
cd src
```

### 12. Install Node.js Dependencies

```
npm install
```

### 13. Create `.env.local` File

```
cp .env.example .env.local
```

> Edit `.env.local` if needed to match your backend URL (default: [http://localhost:8000](http://localhost:8000))

### 14. Run the Frontend App

```
npm run dev
```

Frontend will run at: **[http://localhost:5173](http://localhost:5173)**

---

## 🧪 Testing

1. Open the frontend in your browser.
2. Go to the Patients tab.
3. Confirm:

   * Short IDs → only demographics
   * UUIDs → full Conditions, Observations, Medications
4. Open Dynamic tab to load related clinical data.

---

## 🛠️ Development Notes

### Currently Implemented Filters

* `_count`
* `_getpagesoffset`
* `active=true`
* `_sort=-_lastUpdated`
* `name`

### Filters Planned Soon

* `gender`
* `birthdate` ranges
* `identifier`
* `_lastUpdated` ranges
* `_has` queries
`

---

##  .gitignore

```
# Python
venv/
__pycache__/
*.pyc
*.pyo
*.log

# Node/React
node_modules/
dist/
build/
*.log

# System
.DS_Store
Thumbs.db
```

---


```

