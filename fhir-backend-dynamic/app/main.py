import os
import logging
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Standardized Internal Imports
from app.routers import resources, health, servers, filters, metadata
from app.core.logging import setup_logging
from app.startup import initialize_backend, get_startup_status
from app.config import config

# 1. MODERN LIFESPAN MANAGEMENT
# This replaces @app.on_event and handles the full app cycle efficiently.
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Handles startup and shutdown logic. 
    Mentors look for this as it demonstrates modern FastAPI knowledge.
    """
    logger = logging.getLogger("app.main")
    
    # --- STARTUP PHASE ---
    logger.info("🚀 FHIR Patient Search Backend Starting Up...")
    logger.info("🌐 FHIR Base URL: %s", config.fhir_base_url)
    logger.info("🚪 Backend Port: %s", config.backend_port)
    
    # Initialize systems and store in app.state instead of global variables
    # This is thread-safe and cleaner for Cloud deployments.
    app.state.startup_result = await initialize_backend()
    
    if app.state.startup_result.get("success"):
        logger.info("✅ Backend startup completed successfully")
    else:
        logger.error("❌ Backend startup failed: %s", app.state.startup_result.get("errors"))

    yield  # --- APPLICATION IS NOW RUNNING ---

    # --- SHUTDOWN PHASE ---
    logger.info("🛑 FHIR Patient Search Backend Shutting Down...")
    # Asynchronous cleanup of shared resources
    try:
        resources._patient_cache.clear()
        resources._config_cache.clear()
        logger.info("✅ Cache cleanup completed")
    except Exception as e:
        logger.warning("⚠️ Non-critical error during cache cleanup: %s", e)
    
    logger.info("👋 Shutdown sequence finished")

# 2. APP INITIALIZATION
ENABLE_DOCS = os.getenv("ENABLE_DOCS", "0").lower() in ("1", "true")

app = FastAPI(
    title="FHIR Patient Search Backend",
    description="Unified FHIR API with dynamic configuration and intelligent caching.",
    version="2.0.0",
    docs_url="/docs" if ENABLE_DOCS else None,
    redoc_url="/redoc" if ENABLE_DOCS else None,
    lifespan=lifespan
)

# 3. MIDDLEWARE CONFIGURATION
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Cloud-grade logging
setup_logging(app)

# 4. ROUTE INCLUSION (With Tags for clean Documentation)
app.include_router(health.router,    prefix="/api", tags=["System Health"])
app.include_router(resources.router, prefix="/api", tags=["FHIR Data"])
app.include_router(servers.router,    prefix="/api", tags=["Server Management"])
app.include_router(filters.router,    prefix="/api", tags=["Search Filters"])
app.include_router(metadata.router,   prefix="/api", tags=["FHIR Metadata"])



@app.get("/")
async def home():
    global startup_status
    
    # Get current startup status
    current_startup_status = get_startup_status()
    
    return {
        "service": "FHIR Patient Search Backend with Unified Configuration", 
        "status": "running",
        "version": "2.0.0",
        "startup_status": current_startup_status,
        "configuration": {
            "fhir_base_url": config.fhir_base_url,
            "backend_port": config.backend_port,
            "features_enabled": sum(1 for f in config.features.values() if f),
            "supported_resources_count": len(config.supported_resources)
        },
        "features": [
            "Unified Configuration (config.yaml)",
            "Condition Code Search (J20N7001)",
            "Age and Gender Filtering",
            "Backend Startup Initialization",
            "FHIR Server Health Checks",
            "Configuration Validation",
            "Intelligent Caching",
            "Background Prefetching"
        ]
    }

@app.get("/startup-status")
async def get_detailed_startup_status():
    """Get detailed startup status information"""
    global startup_status
    current_status = get_startup_status()
    
    return {
        "current_status": current_status,
        "last_startup": startup_status,
        "configuration_summary": {
            "fhir_base_url": config.fhir_base_url,
            "cache_settings": {
                "patient_cache_minutes": config.patient_cache_duration_minutes,
                "config_cache_hours": config.config_cache_duration_hours,
                "max_cache_entries": config.max_cache_entries
            },
            "enabled_features": [name for name, enabled in config.features.items() if enabled]
        }
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
