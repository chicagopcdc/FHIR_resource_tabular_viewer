#!/bin/bash
# Start the FHIR backend in development mode
# This script activates the Python virtual environment and starts uvicorn

set -e

# Navigate to the backend directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$PROJECT_ROOT/fhir-backend-dynamic"

cd "$BACKEND_DIR"

# Check if virtual environment exists
if [ ! -d ".venv" ]; then
    echo "❌ Virtual environment not found at $BACKEND_DIR/.venv"
    echo "Please create it first:"
    echo "  cd fhir-backend-dynamic"
    echo "  python3 -m venv .venv"
    echo "  source .venv/bin/activate"
    echo "  pip install -r requirements.txt"
    exit 1
fi

# Activate virtual environment and start uvicorn
echo "🚀 Starting FHIR backend on http://localhost:8000"
source .venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
