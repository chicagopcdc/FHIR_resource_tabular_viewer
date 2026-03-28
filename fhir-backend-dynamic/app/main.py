# app/main.py - Updated to include startup system and configuration
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import resources, health, servers, filters, metadata, sources
# , aggregate  # TEMPORARILY DISABLED
from app.core.logging import setup_logging
from app.startup import initialize_backend, get_startup_status
from app.config import config
import os
import logging
import asyncio

ENABLE_DOCS = os.getenv("ENABLE_DOCS", "0") in ("1", "true", "True")

app = FastAPI(
    title="FHIR Patient Search Backend with Unified Configuration",
    version="2.0.0",
    docs_url="/docs" if ENABLE_DOCS else None,
    redoc_url=None,
    openapi_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global startup status
startup_status = None

# Enhanced logging with filter debugging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s :: %(message)s"
)

setup_logging(app)

# Startup and shutdown event handlers
@app.on_event("startup")
async def startup_event():
    """Backend startup initialization"""
    global startup_status
    logger = logging.getLogger(__name__)
    
    logger.info("🚀 FHIR Patient Search Backend Starting Up...")
    logger.info(f"📋 Configuration loaded from: config.yaml")
    logger.info(f"🌐 FHIR Base URL: {config.fhir_base_url}")
    logger.info(f"🚪 Backend Port: {config.backend_port}")
    logger.info(f"🎯 Features Enabled: {sum(1 for f in config.features.values() if f)}")
    
    # Initialize backend systems
    startup_status = await initialize_backend()
    
    if startup_status["success"]:
        logger.info("✅ Backend startup completed successfully")
        if startup_status["warnings"]:
            logger.warning(f"⚠️ Startup completed with {len(startup_status['warnings'])} warnings:")
            for warning in startup_status["warnings"]:
                logger.warning(f"   - {warning}")
    else:
        logger.error("❌ Backend startup failed")
        for error in startup_status["errors"]:
            logger.error(f"   - {error}")

@app.on_event("shutdown") 
async def shutdown_event():
    """Backend shutdown cleanup"""
    logger = logging.getLogger(__name__)
    logger.info("🛑 FHIR Patient Search Backend Shutting Down...")
    
    # Clear caches and cleanup
    from app.routers.resources import _patient_cache, _config_cache
    _patient_cache.clear()
    _config_cache.clear()
    
    logger.info("✅ Backend shutdown completed")

# Include all routers
app.include_router(health.router,     prefix="/api")
app.include_router(resources.router,  prefix="/api") 
app.include_router(servers.router,    prefix="/api")
app.include_router(filters.router,    prefix="/api")  # Filter endpoints
app.include_router(metadata.router,   prefix="/api")  # FHIR Metadata endpoints
app.include_router(sources.router,    prefix="/api")  # Local file source endpoints

# Conditionally include aggregate router behind feature flag
# TEMPORARILY DISABLED - causing issues
# if config.aggregate_enabled:
#     try:
#         app.include_router(aggregate.router, prefix="/api")  # NEW: Aggregate dataset endpoints
#         logging.info("🔗 Aggregate endpoints enabled successfully")
#     except Exception as e:
#         logging.error(f"❌ Failed to include aggregate router: {e}")
#         import traceback
#         traceback.print_exc()

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