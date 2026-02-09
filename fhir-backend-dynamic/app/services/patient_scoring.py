"""
Patient scoring and filtering utilities.

This module contains functions for:
- Calculating patient data richness scores
- Sorting patients by data availability
- Filtering patients based on resource availability
"""

from typing import List, Dict
import logging
from app.services import fhir

logger = logging.getLogger(__name__)


async def calculate_patient_data_score(patient_id: str) -> int:
    """Calculate data richness score for a patient by checking just the top resource types quickly"""
    score = 0
    base_url = fhir.base().rstrip('/') + '/'
    
    # Only check the most important resource types for speed
    resource_checks = [
        ('Observation', 5),  # High value - clinical measurements
        ('Condition', 4),    # High value - diagnoses
    ]
    
    for resource_type, points in resource_checks:
        try:
            # Quick check - just get count, don't fetch all data
            url = f"{base_url}{resource_type}"
            params = {"subject": f"Patient/{patient_id}", "_count": "0", "_summary": "count"}
            result = await fhir.fetch_bundle_with_deferred_handling(url, params)
            
            if isinstance(result, dict) and result.get("total", 0) > 0:
                resource_count = result.get("total", 0)
                # Simple scoring - having any resources gives points
                score += points
                if resource_count > 5:
                    score += 1  # Small bonus for having many resources
                
        except Exception as e:
            # Don't let individual resource checks break the whole scoring
            logger.debug(f"Error checking {resource_type} for patient {patient_id}: {e}")
            continue
    
    return score


async def sort_patients_by_data_richness(patients: List[Dict]) -> List[Dict]:
    """Sort patients by data richness score (highest first)"""
    if not patients:
        return patients
    
    # Limit number of patients to score to avoid timeouts (score max 20 patients)
    max_to_score = min(len(patients), 20)
    patients_to_score = patients[:max_to_score]
    remaining_patients = patients[max_to_score:] if len(patients) > max_to_score else []
    
    logger.info(f"Calculating data scores for {len(patients_to_score)} patients (limiting to first {max_to_score})...")
    
    # Calculate scores for limited set of patients
    patient_scores = []
    for patient in patients_to_score:
        patient_id = patient.get('id')
        if patient_id:
            try:
                score = await calculate_patient_data_score(patient_id)
                patient_scores.append((patient, score))
                logger.debug(f"Patient {patient_id}: data score {score}")
            except Exception as e:
                logger.warning(f"Error scoring patient {patient_id}: {e}")
                patient_scores.append((patient, 0))  # Default to 0 if scoring fails
        else:
            patient_scores.append((patient, 0))
    
    # Sort scored patients by score (highest first), then by ID for consistent ordering
    patient_scores.sort(key=lambda x: (-x[1], x[0].get('id', '')))
    
    sorted_patients = [patient for patient, score in patient_scores]
    
    # Add remaining unscored patients at the end
    if remaining_patients:
        sorted_patients.extend(remaining_patients)
    
    # Log the top few for debugging
    top_scores = [(p.get('id'), s) for p, s in patient_scores[:5]]
    logger.info(f"Top data-rich patients: {top_scores}")
    
    return sorted_patients


def filter_patients_by_resources(patients: List[Dict], all_resources: List[Dict], query_params: Dict[str, str]) -> List[Dict]:
    """Filter patients to only include those that have the specified resources"""
    data_availability = query_params.get("data_availability", "")
    if not data_availability.strip():
        return patients
    
    # Parse the required resource types
    required_resources = []
    resource_filters = [r.strip() for r in data_availability.split(",") if r.strip()]
    for resource_filter in resource_filters:
        if resource_filter.startswith("has_"):
            required_resources.append(resource_filter[4:])  # Remove "has_" prefix
    
    if not required_resources:
        return patients
    
    # Create a mapping of patient ID to their resources
    patient_resources = {}
    for patient in patients:
        patient_id = patient.get("id")
        if patient_id:
            patient_resources[patient_id] = set()
    
    # Go through all resources and map them to patients
    for resource in all_resources:
        if resource.get("resourceType") == "Patient":
            continue
            
        resource_type = resource.get("resourceType")
        if not resource_type:
            continue
            
        # Extract patient reference
        patient_id = None
        for field in ["subject", "patient"]:
            ref = resource.get(field, {})
            if isinstance(ref, dict) and ref.get("reference"):
                ref_str = ref["reference"]
                if ref_str.startswith("Patient/"):
                    patient_id = ref_str.replace("Patient/", "")
                    break
                elif "/" not in ref_str:  # Assume bare ID
                    patient_id = ref_str
                    break
        
        # Add resource type to patient's set
        if patient_id and patient_id in patient_resources:
            patient_resources[patient_id].add(resource_type)
    
    # Filter patients to only those with ALL required resources
    filtered_patients = []
    for patient in patients:
        patient_id = patient.get("id")
        if patient_id and patient_id in patient_resources:
            patient_resource_types = patient_resources[patient_id]
            # Check if patient has ALL required resource types
            if all(req_resource in patient_resource_types for req_resource in required_resources):
                filtered_patients.append(patient)
    
    logger.info(f"Filtered {len(patients)} patients to {len(filtered_patients)} with required resources: {required_resources}")
    return filtered_patients
