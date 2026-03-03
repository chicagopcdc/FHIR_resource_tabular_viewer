#!/bin/sh
cd fhir-backend-dynamic
if [ ! -f .venv/bin/activate ]; then
    echo "No virtual environment found"
    exit 1
fi
. .venv/bin/activate
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000