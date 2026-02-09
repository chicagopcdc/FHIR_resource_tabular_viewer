"""
Search parameter processing utilities for FHIR resources
"""
import logging
import re
from typing import Dict, Optional
from datetime import datetime

logger = logging.getLogger(__name__)


def is_uuid_format(patient_id: str) -> bool:
    """Check if ID follows UUID format pattern (case-insensitive)"""
    if not patient_id:
        return False
    uuid_pattern = r'^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$'
    return bool(re.match(uuid_pattern, patient_id))


def process_search_parameters(query_params: Dict[str, str], resource_type: str) -> Dict[str, str]:
    """Process search parameters from frontend (search box, etc.) - FIXED: Better filter handling"""
    processed: Dict[str, str] = {}
    revinclude_resources = []
    
    logger.info(f"Processing search parameters: {query_params}")
    
    for key, value in query_params.items():
        if key in ("_count", "_getpagesoffset", "_getpages", "top_n", "fetch_all"):
            continue

        if key in ("search", "q", "query"):
            if value and value.strip():
                search_term = value.strip()
                if resource_type.lower() == "patient":
                    if is_uuid_format(search_term):
                        processed["_id"] = search_term
                    elif search_term.isdigit() or (len(search_term) > 6 and " " not in search_term):
                        # If it's all digits (like "1200") or a long string without spaces, treat as ID
                        processed["_id"] = search_term
                    elif "@" in search_term:
                        processed["telecom"] = search_term
                    else:
                        processed["name"] = search_term
                else:
                    processed["_text"] = search_term
        elif key == "condition_code" and resource_type.lower() == "patient":
            # Handle condition code filtering for patients using _has parameter
            if value and value.strip():
                condition_code = value.strip()
                processed["_has"] = f"Condition:patient:code={condition_code}"
        elif key == "age_min" and resource_type.lower() == "patient":
            # Handle minimum age filtering - convert to FHIR birthdate parameter
            if value and value.strip() and value.isdigit():
                current_year = datetime.now().year
                birth_year = current_year - int(value)
                processed["birthdate"] = f"le{birth_year}-12-31"
                logger.info(f"Age filter: min age {value} -> birthdate le{birth_year}-12-31")
        elif key == "age_max" and resource_type.lower() == "patient":
            # Handle maximum age filtering - convert to FHIR birthdate parameter
            if value and value.strip() and value.isdigit():
                current_year = datetime.now().year
                birth_year = current_year - int(value)
                processed["birthdate"] = f"ge{birth_year}-01-01"
                logger.info(f"Age filter: max age {value} -> birthdate ge{birth_year}-01-01")
        elif key == "gender" and resource_type.lower() == "patient":
            # Handle gender filtering - direct FHIR parameter
            if value:
                if isinstance(value, list):
                    # Handle array of genders from frontend
                    valid_genders = [g.strip().lower() for g in value if g.strip().lower() in ["male", "female", "other", "unknown"]]
                    if valid_genders:
                        processed["gender"] = ",".join(valid_genders)  # FHIR supports comma-separated values
                        logger.info(f"Gender filter (multiple): {valid_genders}")
                elif isinstance(value, str) and value.strip().lower() in ["male", "female", "other", "unknown"]:
                    processed["gender"] = value.strip().lower()
                    logger.info(f"Gender filter: {value}")
        elif key == "age_range" and resource_type.lower() == "patient":
            # Handle age range filters from frontend
            if value and isinstance(value, dict):
                age_from = value.get('from')
                age_to = value.get('to')
                if age_from and age_from.isdigit():
                    current_year = datetime.now().year
                    birth_year = current_year - int(age_from)
                    processed["birthdate"] = f"le{birth_year}-12-31"
                if age_to and age_to.isdigit():
                    current_year = datetime.now().year
                    birth_year = current_year - int(age_to)
                    existing_birthdate = processed.get("birthdate", "")
                    if existing_birthdate:
                        # Combine with existing constraint
                        processed["birthdate"] = f"ge{birth_year}-01-01,{existing_birthdate}"
                    else:
                        processed["birthdate"] = f"ge{birth_year}-01-01"
                logger.info(f"Age range filter: {age_from}-{age_to} -> {processed.get('birthdate', '')}")
        elif key == "data_availability" and resource_type.lower() == "patient":
            # Handle resource-based filtering for patients
            if value and value.strip():
                # Parse comma-separated resource types like "has_Observation,has_Condition"
                resource_filters = [r.strip() for r in value.split(",") if r.strip()]
                for resource_filter in resource_filters:
                    if resource_filter.startswith("has_"):
                        resource_type_name = resource_filter[4:]  # Remove "has_" prefix
                        # Map to appropriate revinclude parameter
                        if resource_type_name == "Observation":
                            revinclude_resources.append("Observation:subject")
                        elif resource_type_name == "Condition":
                            revinclude_resources.append("Condition:subject")
                        elif resource_type_name == "Procedure":
                            revinclude_resources.append("Procedure:subject")
                        elif resource_type_name == "MedicationRequest":
                            revinclude_resources.append("MedicationRequest:subject")
                        elif resource_type_name == "Encounter":
                            revinclude_resources.append("Encounter:subject")
                        elif resource_type_name == "DiagnosticReport":
                            revinclude_resources.append("DiagnosticReport:subject")
                        elif resource_type_name == "DocumentReference":
                            revinclude_resources.append("DocumentReference:subject")
                        elif resource_type_name == "AllergyIntolerance":
                            revinclude_resources.append("AllergyIntolerance:patient")
                        elif resource_type_name == "Immunization":
                            revinclude_resources.append("Immunization:patient")
        else:
            processed[key] = value
    
    # Add revinclude parameters if any resource filters were specified
    if revinclude_resources:
        processed["_revinclude"] = ",".join(revinclude_resources)
        
    return processed


def get_valid_sort_for_resource(resource_type: str, existing_params: dict) -> Optional[str]:
    """Get valid server-side sort, avoiding override if already present"""
    if any(k.startswith('_sort') for k in existing_params.keys()):
        return existing_params.get('_sort')

    rt = resource_type.lower()
    if rt == "patient":
        return "_id"           # sort by ID for sequential ordering
    if rt == "observation":
        return "-date"
    if rt == "condition":
        return "-onset-date"
    if rt == "medicationrequest":
        return "-authoredon"
    return None