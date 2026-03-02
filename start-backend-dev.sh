#!/bin/sh
# Move to backend directory
cd fhir-backend-dynamic || exit 1
# Activate virtual environment
. .venv/bin/activate
# Run FastAPI
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
