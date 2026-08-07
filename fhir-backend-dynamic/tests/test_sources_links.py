"""Tests for reference integrity analysis."""

import io
import json

import pytest
from fastapi.testclient import TestClient

from app.services.sources import links as links_service
from app.services.sources import registry as source_registry
from app.services.sources.local_file import LocalFileSource
from app.services.sources.store import InMemoryFhirStore
from app.services.sources.streaming_file import StreamingFileSource


# -------------------- parse_reference --------------------

@pytest.mark.parametrize("ref,expected", [
    ("Patient/123", ("Patient", "123")),
    ("Observation/abc-1.2", ("Observation", "abc-1.2")),
    ("http://example.org/fhir/Patient/p1", ("Patient", "p1")),
    ("Patient/123/_history/2", ("Patient", "123")),
])
def test_parse_reference_valid(ref, expected):
    assert links_service.parse_reference(ref) == expected


@pytest.mark.parametrize("ref", ["", "   ", "#contained", "urn:uuid:1234", "nonsense", None, 42])
def test_parse_reference_rejects(ref):
    assert links_service.parse_reference(ref) is None


# -------------------- find_references --------------------

def test_find_references_nested_and_arrays():
    resource = {
        "resourceType": "Observation",
        "subject": {"reference": "Patient/p1"},
        "encounter": {"reference": "Encounter/e1"},
        "performer": [{"reference": "Practitioner/pr1"}, {"reference": "Practitioner/pr2"}],
        "code": {"text": "no refs here"},
    }
    found = links_service.find_references(resource)
    paths = {p for p, _ in found}
    assert paths == {"subject", "encounter", "performer"}
    # Array entries collapse onto one path rather than fragmenting.
    assert sum(1 for p, _ in found if p == "performer") == 2


def test_find_references_empty():
    assert links_service.find_references({"resourceType": "Patient", "id": "p1"}) == []


# -------------------- analyze_links --------------------

OBS = [
    {"resourceType": "Observation", "id": "o1", "subject": {"reference": "Patient/p1"}},
    {"resourceType": "Observation", "id": "o2", "subject": {"reference": "Patient/p1"}},
    {"resourceType": "Observation", "id": "o3", "subject": {"reference": "Patient/missing"}},
]


def test_analyze_links_reports_resolution():
    present = {("Patient", "p1")}
    out = links_service.analyze_links(OBS, lambda rt, rid: (rt, rid) in present)
    assert len(out) == 1
    link = out[0]
    assert link["path"] == "subject"
    assert link["target_type"] == "Patient"
    assert link["references"] == 3
    assert link["distinct_targets"] == 2
    assert link["resolved_targets"] == 1
    assert link["dangling_targets"] == 1
    assert link["dangling_examples"] == ["Patient/missing"]


def test_analyze_links_checks_each_target_once():
    """A million references to one patient must cost one lookup."""
    calls = []

    def exists(rt, rid):
        calls.append((rt, rid))
        return True

    many = [dict(OBS[0]) for _ in range(500)]
    links_service.analyze_links(many, exists)
    assert len(calls) == 1


def test_analyze_links_counts_unparseable():
    resources = [{"resourceType": "Observation", "subject": {"reference": "urn:uuid:xyz"}}]
    out = links_service.analyze_links(resources, lambda rt, rid: True)
    assert out[-1]["path"] == "(unparseable)"
    assert out[-1]["references"] == 1


def test_analyze_links_no_references():
    assert links_service.analyze_links([{"resourceType": "Patient", "id": "p"}], lambda *_: True) == []


# -------------------- loader integration --------------------

PATIENTS = [{"resourceType": "Patient", "id": "p1"}]


def test_loader_links_resolve_against_loaded_data():
    loader = LocalFileSource(InMemoryFhirStore(OBS + PATIENTS))
    out = loader.links("Observation")
    assert out["total"] == 3
    assert out["sampled"] is False
    link = out["links"][0]
    assert link["resolved_targets"] == 1
    assert link["dangling_targets"] == 1


def test_loader_links_all_dangling_without_targets():
    """Observations alone: every patient link points outside the dataset."""
    loader = LocalFileSource(InMemoryFhirStore(list(OBS)))
    link = loader.links("Observation")["links"][0]
    assert link["resolved_targets"] == 0
    assert link["resolution"] == 0.0


def test_streaming_links_match_in_memory():
    lines = [json.dumps(r).encode("utf-8") for r in OBS + PATIENTS]
    streamed = StreamingFileSource.from_lines(lines, filename="d.ndjson")
    try:
        sql = streamed.links("Observation")["links"][0]
        mem = LocalFileSource(InMemoryFhirStore(OBS + PATIENTS)).links("Observation")["links"][0]
        assert sql["references"] == mem["references"]
        assert sql["resolved_targets"] == mem["resolved_targets"]
        assert sql["dangling_targets"] == mem["dangling_targets"]
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


def test_links_endpoint(client):
    sid = _upload(client, OBS + PATIENTS).json()["data"]["source_id"]
    r = client.get(f"/api/sources/{sid}/resources/Observation/links")
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["links"][0]["target_type"] == "Patient"
    assert data["links"][0]["dangling_targets"] == 1


def test_links_endpoint_unknown_source_404(client):
    assert client.get("/api/sources/nope/resources/Observation/links").status_code == 404
