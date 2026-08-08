"""Tests for terminology coverage analysis."""

import io
import json

import pytest
from fastapi.testclient import TestClient

from app.services.sources import registry as source_registry
from app.services.sources import terminology as term
from app.services.sources.local_file import LocalFileSource
from app.services.sources.store import InMemoryFhirStore
from app.services.sources.streaming_file import StreamingFileSource


# -------------------- classify_system --------------------

@pytest.mark.parametrize("uri,name", [
    ("http://loinc.org", "LOINC"),
    ("http://snomed.info/sct", "SNOMED CT"),
    ("http://hl7.org/fhir/sid/icd-10-cm", "ICD-10"),
    ("http://unitsofmeasure.org", "UCUM"),
    ("http://terminology.hl7.org/CodeSystem/observation-category", "HL7 terminology"),
])
def test_classify_known_systems(uri, name):
    display, recognized = term.classify_system(uri)
    assert (display, recognized) == (name, True)


def test_classify_local_system_is_not_recognized():
    display, recognized = term.classify_system("http://mimic.mit.edu/fhir/mimic/CodeSystem/x")
    assert recognized is False
    assert display == "http://mimic.mit.edu/fhir/mimic/CodeSystem/x"


@pytest.mark.parametrize("uri", [None, "", "   "])
def test_classify_missing_system(uri):
    assert term.classify_system(uri) == ("(no system)", False)


# -------------------- find_codings --------------------

def test_find_codings_records_path_and_values():
    resource = {
        "resourceType": "Observation",
        "code": {"coding": [{"system": "http://loinc.org", "code": "8867-4", "display": "Heart rate"}]},
        "category": [{"coding": [{"system": "http://terminology.hl7.org/CodeSystem/x", "code": "vital-signs"}]}],
    }
    hits = term.find_codings(resource)
    paths = {h["path"] for h in hits}
    assert paths == {"code", "category"}
    assert any(h["code"] == "8867-4" for h in hits)


def test_find_codings_flags_text_only_concepts():
    hits = term.find_codings({"resourceType": "Condition", "code": {"text": "chest pain"}})
    assert len(hits) == 1
    assert hits[0]["text_only"] is True


def test_find_codings_ignores_uncoded_resources():
    assert term.find_codings({"resourceType": "Patient", "id": "p1", "gender": "male"}) == []


# -------------------- analyze_terminology --------------------

MIXED = [
    {"resourceType": "Observation",
     "code": {"coding": [{"system": "http://loinc.org", "code": "8867-4", "display": "Heart rate"}]}},
    {"resourceType": "Observation",
     "code": {"coding": [{"system": "http://loinc.org", "code": "2339-0", "display": "Glucose"}]}},
    {"resourceType": "Observation",
     "code": {"coding": [{"system": "http://local.example/codes", "code": "LOC-1"}]}},
    {"resourceType": "Observation", "code": {"text": "free text only"}},
    {"resourceType": "Observation", "code": {"coding": [{"code": "NOSYS"}]}},
]


def test_analyze_splits_standard_from_local():
    out = term.analyze_terminology(MIXED)
    assert out["total_codings"] == 4  # text-only is not a coding
    assert out["standard_codings"] == 2  # the two LOINC ones
    assert out["local_codings"] == 2  # local system + missing system
    assert out["standard_share"] == 0.5


def test_analyze_counts_text_only_and_missing_system():
    out = term.analyze_terminology(MIXED)
    assert out["text_only_concepts"] == 1
    assert out["codings_without_system"] == 1


def test_analyze_lists_standards_first():
    systems = term.analyze_terminology(MIXED)["systems"]
    assert systems[0]["system"] == "LOINC"
    assert systems[0]["recognized"] is True
    assert systems[0]["distinct_codes"] == 2
    assert all(not s["recognized"] for s in systems[1:])


def test_analyze_reports_examples_and_paths():
    loinc = term.analyze_terminology(MIXED)["systems"][0]
    assert loinc["paths"] == ["code"]
    assert any("Heart rate" in e for e in loinc["examples"])


def test_analyze_empty():
    out = term.analyze_terminology([])
    assert out["total_codings"] == 0
    assert out["standard_share"] == 0.0
    assert out["systems"] == []


# -------------------- loader integration --------------------

def test_loader_terminology():
    loader = LocalFileSource(InMemoryFhirStore(list(MIXED)))
    out = loader.terminology("Observation")
    assert out["resourceType"] == "Observation"
    assert out["total"] == 5
    assert out["sampled"] is False
    assert out["standard_codings"] == 2


def test_streaming_and_memory_agree():
    lines = [json.dumps(r).encode("utf-8") for r in MIXED]
    streamed = StreamingFileSource.from_lines(lines, filename="d.ndjson")
    try:
        sql = streamed.terminology("Observation")
        mem = LocalFileSource(InMemoryFhirStore(list(MIXED))).terminology("Observation")
        for key in ["total_codings", "standard_codings", "local_codings", "text_only_concepts"]:
            assert sql[key] == mem[key], key
    finally:
        streamed.close()


# -------------------- endpoint --------------------

@pytest.fixture
def client():
    from app.main import app
    source_registry.clear()
    with TestClient(app) as c:
        yield c
    source_registry.clear()


def _upload(client, resources):
    ndjson = "\n".join(json.dumps(r) for r in resources).encode("utf-8")
    return client.post(
        "/api/sources/upload",
        files={"file": ("d.ndjson", io.BytesIO(ndjson), "application/x-ndjson")},
    )


def test_terminology_endpoint(client):
    sid = _upload(client, MIXED).json()["data"]["source_id"]
    r = client.get(f"/api/sources/{sid}/resources/Observation/terminology")
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["standard_codings"] == 2
    assert data["systems"][0]["system"] == "LOINC"


def test_terminology_endpoint_unknown_source_404(client):
    assert client.get("/api/sources/x/resources/Observation/terminology").status_code == 404
