"""Pivot a dataset from resources to patients.

Every other view here is resource-oriented: a table of Observations, a table of
Conditions. Researchers think in patients. A cohort is not "18,000 observations",
it is "134 patients, and here is how much data each one has".

This regroups resources of every type under the patient they refer to, so one
row is one patient with a count per resource type. Patients that are only
referenced, and never present as a Patient resource, are still listed and marked
absent, because a cohort built on them would silently lack demographics.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any, Callable, Dict, Iterable, List, Optional, Tuple

from app.services.sources.links import parse_reference

# Fields that carry the patient a resource is about. FHIR uses ``subject`` on
# most clinical resources and ``patient`` on a few (AllergyIntolerance,
# Immunization, and others).
PATIENT_FIELDS = ("subject", "patient")


def extract_patient_id(resource: Dict[str, Any]) -> Optional[str]:
    """Return the id of the Patient this resource is about, if any.

    Only references that actually point at a Patient count; a ``subject`` that
    points at a Group or Device is not a patient link.
    """
    if not isinstance(resource, dict):
        return None
    for field in PATIENT_FIELDS:
        value = resource.get(field)
        if isinstance(value, dict) and isinstance(value.get("reference"), str):
            parsed = parse_reference(value["reference"])
            if parsed and parsed[0] == "Patient":
                return parsed[1]
    return None


def build_cohort(
    resources_by_type: Iterable[Tuple[str, Iterable[Dict[str, Any]]]],
    *,
    patient_exists: Callable[[str], bool],
    limit: int = 500,
) -> Dict[str, Any]:
    """Group resources by patient and count them per resource type.

    ``resources_by_type`` yields ``(resource_type, resources)``. Patient
    resources themselves establish presence; every other type contributes counts
    against the patient it references.
    """
    counts: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))
    present: set = set()
    type_names: List[str] = []
    unlinked: Dict[str, int] = defaultdict(int)

    for resource_type, resources in resources_by_type:
        if resource_type not in type_names:
            type_names.append(resource_type)
        for resource in resources:
            if resource_type == "Patient":
                pid = resource.get("id")
                if isinstance(pid, str) and pid:
                    present.add(pid)
                    counts[pid]  # ensure the patient appears even with no data
                continue
            pid = extract_patient_id(resource)
            if pid is None:
                # Resources not tied to a patient (for example a Medication
                # definition) are reported separately rather than dropped.
                unlinked[resource_type] += 1
                continue
            counts[pid][resource_type] += 1

    rows = []
    for pid, per_type in counts.items():
        total = sum(per_type.values())
        rows.append({
            "patient_id": pid,
            "reference": f"Patient/{pid}",
            "present": pid in present or patient_exists(pid),
            "total": total,
            "counts": dict(per_type),
        })

    # Richest patients first: those are the ones a cohort can actually use.
    rows.sort(key=lambda r: (-r["total"], r["patient_id"]))

    linked_types = [t for t in type_names if t != "Patient"]
    return {
        "total_patients": len(rows),
        "patients_present": sum(1 for r in rows if r["present"]),
        "patients_referenced_only": sum(1 for r in rows if not r["present"]),
        "resource_types": linked_types,
        "unlinked": dict(unlinked),
        "patients": rows[:limit],
        "truncated": len(rows) > limit,
    }
