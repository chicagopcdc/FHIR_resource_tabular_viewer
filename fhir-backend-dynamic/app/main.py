# app/main.py - Updated to include new filter endpoints
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import resources, health, servers, filters  # Add filters import
from app.core.logging import setup_logging
import os
import logging

ENABLE_DOCS = os.getenv("ENABLE_DOCS", "0") in ("1", "true", "True")

app = FastAPI(
    title="Enhanced FHIR Proxy with Dynamic Filters",
    version="2.0.0",
    docs_url="/docs" if ENABLE_DOCS else None,
    redoc_url=None,
    openapi_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Enhanced logging with filter debugging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s :: %(message)s"
)

setup_logging(app)

# Include all routers
app.include_router(health.router,     prefix="/api")
app.include_router(resources.router,  prefix="/api") 
app.include_router(servers.router,    prefix="/api")
app.include_router(filters.router,    prefix="/api")  # NEW: Filter endpoints

@app.get("/")
async def home():
    return {
        "service": "Enhanced FHIR Proxy Backend", 
        "status": "running",
        "version": "2.0.0",
        "features": [
            "Dynamic Resource Discovery",
            "Intelligent Filter Generation", 
            "Custom Age Range Filtering",
            "Date Range Filtering",
            "Multi-Server Support",
            "Advanced Search Parameters"
        ]
    }

# Additional endpoints for filter capabilities
@app.get("/api/filter-capabilities")
async def get_filter_capabilities():
    """Get supported filter types and capabilities"""
    return {
        "supported_filter_types": [
            {
                "type": "age_range",
                "modes": ["preset_brackets", "custom_range"],
                "description": "Filter by patient age with presets or custom from/to values"
            },
            {
                "type": "date_range", 
                "modes": ["preset_periods", "custom_range"],
                "description": "Filter by dates with quick presets or custom date picker"
            },
            {
                "type": "multi_select",
                "modes": ["checkbox_group", "searchable_select"],
                "description": "Multiple selection with search capability"
            },
            {
                "type": "numeric_range",
                "modes": ["slider", "input_fields"],
                "description": "Numeric value ranges for lab results, vital signs"
            },
            {
                "type": "geographic",
                "modes": ["state_select", "city_select", "postal_code"],
                "description": "Location-based filtering with intelligent grouping"
            }
        ],
        "server_driven": True,
        "real_time_analysis": True,
        "custom_ranges": True
    }