# app/routers/filters.py - NEW FILE: Dynamic Filter Discovery and Metadata
from fastapi import APIRouter, HTTPException, Query
from typing import Dict, List, Any, Optional
from collections import defaultdict
import logging
from datetime import datetime, timedelta
from app.services import registry, fhir
from app.services.http import get_json

router = APIRouter(prefix="/filters", tags=["filters"])
logger = logging.getLogger(__name__)

@router.get("/{resource_type}/metadata")
async def get_filter_metadata(
    resource_type: str, 
    sample_size: int = Query(100, ge=10, le=500),
    analyze_depth: bool = Query(True, description="Deep analysis of field values")
):
    """
    Generate dynamic filter metadata based on actual server data
    Returns filter definitions, value ranges, and smart suggestions
    """
    try:
        logger.info(f"Generating filter metadata for {resource_type} (sample: {sample_size})")
        
        # Fetch sample data for analysis
        sample_params = {
            "_count": sample_size,
            "_sort": "-_lastUpdated"
        }
        
        base_url = fhir.base().rstrip('/') + '/'
        url = base_url + resource_type
        bundle = await get_json(url, None, params=sample_params)
        
        if not isinstance(bundle, dict) or bundle.get("resourceType") != "Bundle":
            raise HTTPException(status_code=502, detail="Invalid response from FHIR server")
        
        resources = fhir.entries(bundle)
        
        if not resources:
            return {
                "success": True,
                "resource_type": resource_type,
                "filters": [],
                "message": f"No {resource_type} resources found for filter analysis"
            }
        
        # Generate filter definitions
        filter_definitions = await analyze_resources_for_filters(
            resources, resource_type, analyze_depth
        )
        
        # Get server capabilities for additional search parameters
        server_filters = await get_server_search_capabilities(resource_type)
        
        # Merge and enhance filter definitions
        enhanced_filters = merge_filter_definitions(filter_definitions, server_filters)
        
        return {
            "success": True,
            "resource_type": resource_type,
            "sample_size": len(resources),
            "filters": enhanced_filters,
            "capabilities": server_filters,
            "generated_at": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error generating filter metadata for {resource_type}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

async def analyze_resources_for_filters(
    resources: List[Dict], 
    resource_type: str, 
    deep_analysis: bool = True
) -> List[Dict]:
    """Analyze resource data to generate intelligent filter definitions"""
    
    filter_definitions = []
    
    # Common patterns for different resource types
    if resource_type.lower() == 'patient':
        filter_definitions.extend(analyze_patient_filters(resources, deep_analysis))
    elif resource_type.lower() == 'observation':
        filter_definitions.extend(analyze_observation_filters(resources, deep_analysis))
    elif resource_type.lower() == 'condition':
        filter_definitions.extend(analyze_condition_filters(resources, deep_analysis))
    elif resource_type.lower() == 'medicationrequest':
        filter_definitions.extend(analyze_medication_filters(resources, deep_analysis))
    
    # Universal filters that apply to most resources
    filter_definitions.extend(analyze_universal_filters(resources, resource_type, deep_analysis))
    
    return filter_definitions

def analyze_patient_filters(resources: List[Dict], deep_analysis: bool) -> List[Dict]:
    """Generate Patient-specific intelligent filters"""
    filters = []
    
    # Age Range Filter with intelligent brackets
    birth_dates = [r.get('birthDate') for r in resources if r.get('birthDate')]
    if birth_dates:
        ages = []
        for bd in birth_dates:
            try:
                age = (datetime.now() - datetime.fromisoformat(bd.replace('Z', '+00:00'))).days // 365
                ages.append(age)
            except:
                continue
        
        if ages:
            min_age, max_age = min(ages), max(ages)
            age_brackets = generate_smart_age_brackets(min_age, max_age, ages)
            
            filters.append({
                "key": "age_range",
                "label": "Age Range",
                "type": "range_select",
                "description": "Filter patients by age groups",
                "options": age_brackets,
                "stats": {
                    "min_age": min_age,
                    "max_age": max_age,
                    "avg_age": sum(ages) // len(ages),
                    "total_patients": len(ages)
                },
                "ui_component": "age_range_selector"
            })
    
    # Gender Distribution
    genders = [r.get('gender') for r in resources if r.get('gender')]
    if genders:
        gender_counts = count_values(genders)
        filters.append({
            "key": "gender",
            "label": "Gender",
            "type": "multi_select",
            "description": "Filter by patient gender",
            "options": [
                {"value": gender, "label": gender.title(), "count": count}
                for gender, count in gender_counts.items()
            ],
            "ui_component": "checkbox_group"
        })
    
    # Geographic Filters with Smart Grouping
    cities = [r.get('address', [{}])[0].get('city') for r in resources 
             if r.get('address') and len(r['address']) > 0 and r['address'][0].get('city')]
    states = [r.get('address', [{}])[0].get('state') for r in resources 
             if r.get('address') and len(r['address']) > 0 and r['address'][0].get('state')]
    
    if states:
        state_counts = count_values(states)
        # Only show states if there are multiple and reasonable number
        if len(state_counts) > 1 and len(state_counts) <= 50:
            filters.append({
                "key": "state",
                "label": "State/Province",
                "type": "multi_select",
                "description": "Filter by patient location",
                "options": [
                    {"value": state, "label": state, "count": count}
                    for state, count in sorted(state_counts.items())
                ],
                "ui_component": "searchable_multi_select"
            })
    
    if cities:
        city_counts = count_values(cities)
        # Only show cities if manageable number
        if len(city_counts) <= 100:
            filters.append({
                "key": "city",
                "label": "City",
                "type": "multi_select",
                "description": "Filter by patient city",
                "options": [
                    {"value": city, "label": city, "count": count}
                    for city, count in sorted(city_counts.items())
                ],
                "ui_component": "searchable_multi_select"
            })
    
    # Birth Date Range
    if birth_dates:
        valid_dates = []
        for bd in birth_dates:
            try:
                valid_dates.append(datetime.fromisoformat(bd.replace('Z', '+00:00')))
            except:
                continue
        
        if valid_dates:
            min_date = min(valid_dates)
            max_date = max(valid_dates)
            
            filters.append({
                "key": "birth_date_range",
                "label": "Birth Date Range",
                "type": "date_range",
                "description": "Filter by patient birth date",
                "min_date": min_date.isoformat(),
                "max_date": max_date.isoformat(),
                "presets": generate_date_presets(),
                "ui_component": "date_range_picker"
            })
    
    return filters

def analyze_observation_filters(resources: List[Dict], deep_analysis: bool) -> List[Dict]:
    """Generate Observation-specific intelligent filters"""
    filters = []
    
    # Observation Categories (Smart Categorization)
    codes = [r.get('code', {}).get('text') or r.get('code', {}).get('display') 
            for r in resources if r.get('code')]
    
    if codes:
        categories = {}
        for code in codes:
            if code:
                category = categorize_observation_code(code)
                categories[category] = categories.get(category, 0) + 1
        
        if categories:
            filters.append({
                "key": "observation_category",
                "label": "Measurement Category",
                "type": "multi_select",
                "description": "Filter by type of measurement",
                "options": [
                    {"value": cat, "label": cat, "count": count}
                    for cat, count in sorted(categories.items())
                ],
                "ui_component": "checkbox_group"
            })
    
    # Value Range Filters for Numeric Observations
    numeric_observations = []
    for r in resources:
        if r.get('valueQuantity', {}).get('value'):
            try:
                value = float(r['valueQuantity']['value'])
                unit = r['valueQuantity'].get('unit', '')
                code = r.get('code', {}).get('text') or r.get('code', {}).get('display')
                numeric_observations.append({
                    'value': value,
                    'unit': unit,
                    'code': code
                })
            except:
                continue
    
    if numeric_observations:
        # Group by measurement type and create range filters
        measurement_ranges = defaultdict(list)
        for obs in numeric_observations:
            key = f"{obs['code']} ({obs['unit']})" if obs['unit'] else obs['code']
            measurement_ranges[key].append(obs['value'])
        
        for measurement, values in measurement_ranges.items():
            if len(values) >= 5:  # Only create range if enough data points
                min_val, max_val = min(values), max(values)
                avg_val = sum(values) / len(values)
                
                filters.append({
                    "key": f"value_range_{hash(measurement) % 10000}",
                    "label": f"{measurement} Range",
                    "type": "numeric_range",
                    "description": f"Filter by {measurement} values",
                    "min_value": min_val,
                    "max_value": max_val,
                    "avg_value": avg_val,
                    "step": calculate_smart_step(min_val, max_val),
                    "unit": values[0] if measurement.count('(') > 0 else "",
                    "ui_component": "range_slider"
                })
    
    # Date Range for Observations
    dates = []
    for r in resources:
        date_val = (r.get('effectiveDateTime') or 
                   r.get('effectiveDate') or 
                   r.get('issued'))
        if date_val:
            try:
                dates.append(datetime.fromisoformat(date_val.replace('Z', '+00:00')))
            except:
                continue
    
    if dates:
        min_date, max_date = min(dates), max(dates)
        filters.append({
            "key": "observation_date_range",
            "label": "Observation Date Range",
            "type": "date_range",
            "description": "Filter by when observation was made",
            "min_date": min_date.isoformat(),
            "max_date": max_date.isoformat(),
            "presets": generate_observation_date_presets(),
            "ui_component": "date_range_picker"
        })
    
    return filters

def analyze_condition_filters(resources: List[Dict], deep_analysis: bool) -> List[Dict]:
    """Generate Condition-specific filters"""
    filters = []
    
    # Clinical Status
    clinical_statuses = [r.get('clinicalStatus', {}).get('coding', [{}])[0].get('code')
                        for r in resources if r.get('clinicalStatus')]
    if clinical_statuses:
        status_counts = count_values([s for s in clinical_statuses if s])
        filters.append({
            "key": "clinical_status",
            "label": "Clinical Status",
            "type": "multi_select",
            "description": "Filter by condition status",
            "options": [
                {"value": status, "label": format_status_label(status), "count": count}
                for status, count in status_counts.items()
            ],
            "ui_component": "checkbox_group"
        })
    
    # Verification Status
    verification_statuses = [r.get('verificationStatus', {}).get('coding', [{}])[0].get('code')
                           for r in resources if r.get('verificationStatus')]
    if verification_statuses:
        verification_counts = count_values([s for s in verification_statuses if s])
        filters.append({
            "key": "verification_status",
            "label": "Verification Status",
            "type": "multi_select",
            "description": "Filter by verification level",
            "options": [
                {"value": status, "label": format_status_label(status), "count": count}
                for status, count in verification_counts.items()
            ],
            "ui_component": "checkbox_group"
        })
    
    return filters

def analyze_medication_filters(resources: List[Dict], deep_analysis: bool) -> List[Dict]:
    """Generate MedicationRequest-specific filters"""
    filters = []
    
    # Medication Status
    statuses = [r.get('status') for r in resources if r.get('status')]
    if statuses:
        status_counts = count_values(statuses)
        filters.append({
            "key": "medication_status",
            "label": "Medication Status",
            "type": "multi_select",
            "description": "Filter by prescription status",
            "options": [
                {"value": status, "label": format_status_label(status), "count": count}
                for status, count in status_counts.items()
            ],
            "ui_component": "checkbox_group"
        })
    
    # Intent
    intents = [r.get('intent') for r in resources if r.get('intent')]
    if intents:
        intent_counts = count_values(intents)
        filters.append({
            "key": "medication_intent",
            "label": "Prescription Intent",
            "type": "multi_select",
            "description": "Filter by prescription intent",
            "options": [
                {"value": intent, "label": format_status_label(intent), "count": count}
                for intent, count in intent_counts.items()
            ],
            "ui_component": "checkbox_group"
        })
    
    return filters

def analyze_universal_filters(resources: List[Dict], resource_type: str, deep_analysis: bool) -> List[Dict]:
    """Generate filters that apply to most FHIR resources"""
    filters = []
    
    # Status filter (most resources have status)
    statuses = [r.get('status') for r in resources if r.get('status')]
    if statuses:
        status_counts = count_values(statuses)
        filters.append({
            "key": "status",
            "label": "Status",
            "type": "multi_select",
            "description": f"Filter by {resource_type.lower()} status",
            "options": [
                {"value": status, "label": format_status_label(status), "count": count}
                for status, count in status_counts.items()
            ],
            "ui_component": "checkbox_group"
        })
    
    # Last Updated Range
    last_updated_dates = []
    for r in resources:
        if r.get('meta', {}).get('lastUpdated'):
            try:
                date = datetime.fromisoformat(r['meta']['lastUpdated'].replace('Z', '+00:00'))
                last_updated_dates.append(date)
            except:
                continue
    
    if last_updated_dates:
        min_date, max_date = min(last_updated_dates), max(last_updated_dates)
        filters.append({
            "key": "last_updated_range",
            "label": "Last Updated",
            "type": "date_range",
            "description": "Filter by when record was last modified",
            "min_date": min_date.isoformat(),
            "max_date": max_date.isoformat(),
            "presets": generate_update_date_presets(),
            "ui_component": "date_range_picker"
        })
    
    return filters

async def get_server_search_capabilities(resource_type: str) -> Dict:
    """Get search parameters supported by FHIR server for this resource type"""
    try:
        capabilities = await fhir.get_capabilities()
        
        for rest in capabilities.get("rest", []):
            for resource in rest.get("resource", []):
                if resource.get("type") == resource_type:
                    search_params = []
                    for param in resource.get("searchParam", []):
                        search_params.append({
                            "name": param.get("name"),
                            "type": param.get("type"),
                            "definition": param.get("definition"),
                            "documentation": param.get("documentation")
                        })
                    
                    return {
                        "search_parameters": search_params,
                        "interactions": [i.get("code") for i in resource.get("interaction", [])],
                        "versioning": resource.get("versioning"),
                        "conditional_create": resource.get("conditionalCreate"),
                        "conditional_update": resource.get("conditionalUpdate")
                    }
        
        return {"search_parameters": []}
        
    except Exception as e:
        logger.error(f"Error getting server capabilities: {str(e)}")
        return {"search_parameters": []}

def merge_filter_definitions(analyzed_filters: List[Dict], server_capabilities: Dict) -> List[Dict]:
    """Merge analyzed filters with server capabilities"""
    # For now, prioritize analyzed filters
    # In the future, could enhance with server-specific parameters
    return analyzed_filters

# Helper Functions

def count_values(values: List) -> Dict[str, int]:
    """Count occurrences of values"""
    counts = defaultdict(int)
    for value in values:
        if value:
            counts[value] += 1
    return dict(counts)

def generate_smart_age_brackets(min_age: int, max_age: int, ages: List[int]) -> List[Dict]:
    """Generate intelligent age brackets based on data distribution"""
    if max_age <= 18:
        brackets = ["0-5", "6-12", "13-18"]
    elif max_age <= 65:
        brackets = ["0-17", "18-30", "31-45", "46-65"]
    else:
        brackets = ["0-17", "18-30", "31-45", "46-65", "66+"]
    
    # Count patients in each bracket
    bracket_counts = {}
    for bracket in brackets:
        count = 0
        if bracket.endswith('+'):
            min_bracket = int(bracket[:-1])
            count = len([age for age in ages if age >= min_bracket])
        else:
            min_bracket, max_bracket = map(int, bracket.split('-'))
            count = len([age for age in ages if min_bracket <= age <= max_bracket])
        
        if count > 0:
            bracket_counts[bracket] = count
    
    return [
        {"value": bracket, "label": f"{bracket} years", "count": count}
        for bracket, count in bracket_counts.items()
    ]

def categorize_observation_code(code_text: str) -> str:
    """Intelligently categorize observation codes"""
    if not code_text:
        return "Other"
    
    code_lower = code_text.lower()
    
    # Vital Signs
    vital_keywords = ['blood pressure', 'heart rate', 'respiratory rate', 'temperature', 
                     'oxygen saturation', 'pulse', 'weight', 'height', 'bmi']
    if any(keyword in code_lower for keyword in vital_keywords):
        return "Vital Signs"
    
    # Laboratory Results
    lab_keywords = ['hemoglobin', 'glucose', 'cholesterol', 'creatinine', 'sodium', 
                   'potassium', 'leukocytes', 'platelets', 'hematocrit']
    if any(keyword in code_lower for keyword in lab_keywords):
        return "Laboratory Results"
    
    # Surveys/Assessments
    survey_keywords = ['gad-7', 'phq-9', 'score', 'assessment', 'questionnaire', 'audit']
    if any(keyword in code_lower for keyword in survey_keywords):
        return "Surveys & Assessments"
    
    # Social History
    social_keywords = ['smoking', 'tobacco', 'alcohol', 'drug use', 'occupation']
    if any(keyword in code_lower for keyword in social_keywords):
        return "Social History"
    
    return "Physical Exam"

def calculate_smart_step(min_val: float, max_val: float) -> float:
    """Calculate appropriate step size for numeric ranges"""
    range_size = max_val - min_val
    if range_size <= 10:
        return 0.1
    elif range_size <= 100:
        return 1.0
    elif range_size <= 1000:
        return 10.0
    else:
        return 100.0

def format_status_label(status: str) -> str:
    """Format status codes into human-readable labels"""
    if not status:
        return "Unknown"
    
    # Convert camelCase or snake_case to Title Case
    import re
    formatted = re.sub(r'([a-z])([A-Z])', r'\1 \2', status)
    formatted = formatted.replace('_', ' ').replace('-', ' ')
    return formatted.title()

def generate_date_presets() -> List[Dict]:
    """Generate common date range presets"""
    now = datetime.now()
    return [
        {
            "label": "Born in last 5 years",
            "start_date": (now - timedelta(days=5*365)).isoformat(),
            "end_date": now.isoformat()
        },
        {
            "label": "Born 2000-2010",
            "start_date": "2000-01-01T00:00:00",
            "end_date": "2010-12-31T23:59:59"
        },
        {
            "label": "Born 1980-2000",
            "start_date": "1980-01-01T00:00:00",
            "end_date": "2000-12-31T23:59:59"
        }
    ]

def generate_observation_date_presets() -> List[Dict]:
    """Generate observation-specific date presets"""
    now = datetime.now()
    return [
        {
            "label": "Last 30 days",
            "start_date": (now - timedelta(days=30)).isoformat(),
            "end_date": now.isoformat()
        },
        {
            "label": "Last 6 months",
            "start_date": (now - timedelta(days=180)).isoformat(),
            "end_date": now.isoformat()
        },
        {
            "label": "Last year",
            "start_date": (now - timedelta(days=365)).isoformat(),
            "end_date": now.isoformat()
        },
        {
            "label": "2024",
            "start_date": "2024-01-01T00:00:00",
            "end_date": "2024-12-31T23:59:59"
        }
    ]

def generate_update_date_presets() -> List[Dict]:
    """Generate last-updated date presets"""
    now = datetime.now()
    return [
        {
            "label": "Updated today",
            "start_date": now.replace(hour=0, minute=0, second=0).isoformat(),
            "end_date": now.isoformat()
        },
        {
            "label": "Updated this week",
            "start_date": (now - timedelta(days=7)).isoformat(),
            "end_date": now.isoformat()
        },
        {
            "label": "Updated this month",
            "start_date": (now - timedelta(days=30)).isoformat(),
            "end_date": now.isoformat()
        }
    ]