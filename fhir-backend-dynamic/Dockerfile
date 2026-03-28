FROM python:3.12-slim

WORKDIR /app

# Build context is the project root (so we can access config.yaml)
# Copy backend requirements and install
COPY fhir-backend-dynamic/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend application code
COPY fhir-backend-dynamic/app ./app

# Copy config.yaml from project root into the image
# config.py resolves: /app/app/config.py -> 3 levels up -> /config.yaml
COPY config.yaml /config.yaml

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
