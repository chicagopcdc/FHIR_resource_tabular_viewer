#!/usr/bin/env sh
set -e
cd fhir-backend-dynamic || exit 1
if [ ! -f .venv/bin/activate ]; then
    echo "Error: Virtual environment not found at .venv/bin/activate"
    echo "Please create it with: python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt"
    exit 1
fi
. .venv/bin/activate || exit 1
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000