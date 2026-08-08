"""Tests for the patient cohort pivot."""

import io
import json

import pytest
from fastapi.testclient import TestClient

from app.services.sources import cohort as cohort_service
from app.services.sources import registry as source_registry
from app.services.sources.local_file import LocalFileSource
from app.services.sources.store import InMemoryFhirStore


# -------------------- extract_patient_id --------------------

def test_extract_from_subject_and_patient_fields():
    assert cohort_service.extract_patient_id(
        {"subject": {"reference": "Patient/p1"}}) == "p1"
    assert cohort_service.extract_patient_id(
        {"patient": {"reference": "Patient/p2"}}) == "p2"


def test_extract_ignores_non_patient_targets():
    """A subject pointing at a Group is not a patient link."""
    assert cohort_service.extract_patient_id({"subject": {"reference": "Group/g1"}}) is None
    assert cohort_service.extract_patient_id({"subject": {"reference": "Device/d1"}}) is None


def test_extract_handles_missing_and_malformed():
    assert cohort_service.extract_patient_id({}) is None
    assert cohort_service.extract_patient_id({"subject": {}}) is None
    assert cohort_service.extract_patient_id({"subject": {"reference": "#contained"}}) is None
    assert cohort_service.extract_patient_id("not a dict") is None


# -------------------- build_cohort --------------------

PATIENTS = [{"resourceType": "Patient", "id": "p1"}, {"resourceType": "Patient", "id": "p2"}]
OBS = [
    {"resourceType": "Observation", "id": "o1", "subject": {"reference": "Patient/p1"}},
    {"resourceType": "Observation", "id": "o2", "subject": {"reference": "Patient/p1"}},
    {"resourceType": "Observation", "id": "o3", "subject": {"reference": "Patient/p2"}},
    # References a patient that is not in the dataset.
    {"resourceType": "Observation", "id": "o4", "subject": {"reference": "Patient/ghost"}},
]
CONDS = [{"resourceType": "Condition", "id": "c1", "subject": {"reference": "Patient/p1"}}]


def _cohort(exists=lambda pid: False, limit=500):
    return cohort_service.build_cohort(
        [("Patient", PATIENTS), ("Observation", OBS), ("Condition", CONDS)],
        patient_exists=exists,
        limit=limit,
    )


def test_cohort_counts_per_patient_and_type():
    out = _cohort()
    rows = {r["patient_id"]: r for r in out["patients"]}
    assert rows["p1"]["counts"] == {"Observation": 2, "Condition": 1}
    assert rows["p1"]["total"] == 3
    assert rows["p2"]["counts"] == {"Observation": 1}


def test_cohort_sorts_richest_patient_first():
    out = _cohort()
    totals = [r["total"] for r in out["patients"]]
    assert totals == sorted(totals, reverse=True)
    assert out["patients"][0]["patient_id"] == "p1"


def test_cohort_marks_referenced_only_patients():
    out = _cohort()
    rows = {r["patient_id"]: r for r in out["patients"]}
    assert rows["p1"]["present"] is True
    assert rows["ghost"]["present"] is False
    assert out["patients_present"] == 2
    assert out["patients_referenced_only"] == 1


def test_cohort_includes_patients_with_no_clinical_data():
    """A Patient resource with nothing referencing it still appears."""
    out = cohort_service.build_cohort(
        [("Patient", [{"resourceType": "Patient", "id": "lonely"}])],
        patient_exists=lambda pid: False,
    )
    assert out["total_patients"] == 1
    assert out["patients"][0]["total"] == 0


def test_cohort_reports_unlinked_resources():
    """Resources with no patient link are counted, not silently dropped."""
    out = cohort_service.build_cohort(
        [("Medication", [{"resourceType": "Medication", "id": "m1"}])],
        patient_exists=lambda pid: False,
    )
    assert out["unlinked"] == {"Medication": 1}
    assert out["total_patients"] == 0


def test_cohort_respects_limit_and_flags_truncation():
    many = [
        {"resourceType": "Observation", "id": f"o{i}", "subject": {"reference": f"Patient/p{i}"}}
        for i in range(10)
    ]
    out = cohort_service.build_cohort(
        [("Observation", many)], patient_exists=lambda pid: False, limit=3
    )
    assert out["total_patients"] == 10
    assert len(out["patients"]) == 3
    assert out["truncated"] is True


def test_cohort_uses_exists_callback_for_presence():
    """Presence can also come from the store, not just loaded Patient rows."""
    out = cohort_service.build_cohort(
        [("Observation", [OBS[3]])], patient_exists=lambda pid: pid == "ghost"
    )
    assert out["patients"][0]["present"] is True


# -------------------- loader integration --------------------

def test_loader_cohort():
    loader = LocalFileSource(InMemoryFhirStore(PATIENTS + OBS + CONDS))
    out = loader.cohort()
    assert out["total_patients"] == 3
    assert set(out["resource_types"]) == {"Observation", "Condition"}
    assert out["patients"][0]["patient_id"] == "p1"


# -------------------- endpoint --------------------

@pytest.fixture
def client():
    from app.main import app
    source_registry.clear()
    with TestClient(app) as c:
        yield c
    source_registry.clear()


def test_cohort_endpoint(client):
    ndjson = "\n".join(json.dumps(r) for r in PATIENTS + OBS + CONDS).encode("utf-8")
    sid = client.post(
        "/api/sources/upload",
        files={"file": ("d.ndjson", io.BytesIO(ndjson), "application/x-ndjson")},
    ).json()["data"]["source_id"]

    r = client.get(f"/api/sources/{sid}/cohort")
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["total_patients"] == 3
    assert data["patients_referenced_only"] == 1


def test_cohort_endpoint_unknown_source_404(client):
    assert client.get("/api/sources/nope/cohort").status_code == 404
