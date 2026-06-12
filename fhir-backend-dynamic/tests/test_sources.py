"""Tests for the local-file data source: parsing, store, and HTTP endpoints."""

import io
import json

import pytest
from fastapi.testclient import TestClient

from app.services.sources.store import (
    InMemoryFhirStore,
    FhirParseError,
    parse_payload,
)
from app.services.sources.local_file import LocalFileSource
from app.services.sources import registry as source_registry


# --------------------------------------------------------------------------
# Fixtures / helpers
# --------------------------------------------------------------------------

def _b(obj) -> bytes:
    return json.dumps(obj).encode("utf-8")


PATIENT = {"resourceType": "Patient", "id": "p1", "name": [{"family": "Doe", "given": ["Jane"]}]}
OBS = {"resourceType": "Observation", "id": "o1", "status": "final",
       "code": {"coding": [{"system": "http://loinc.org", "code": "1234-5", "display": "Glucose"}]}}

BUNDLE = {
    "resourceType": "Bundle",
    "type": "collection",
    "entry": [{"resource": PATIENT}, {"resource": OBS}],
}


# --------------------------------------------------------------------------
# parse_payload
# --------------------------------------------------------------------------

def test_parse_single_resource():
    resources = parse_payload(_b(PATIENT))
    assert len(resources) == 1
    assert resources[0]["resourceType"] == "Patient"


def test_parse_bundle_unwraps_entries():
    resources = parse_payload(_b(BUNDLE))
    assert [r["resourceType"] for r in resources] == ["Patient", "Observation"]


def test_parse_json_array():
    resources = parse_payload(_b([PATIENT, OBS]))
    assert len(resources) == 2


def test_parse_ndjson():
    ndjson = (json.dumps(PATIENT) + "\n" + json.dumps(OBS) + "\n").encode("utf-8")
    resources = parse_payload(ndjson)
    assert [r["resourceType"] for r in resources] == ["Patient", "Observation"]


def test_parse_tolerates_utf8_bom():
    data = b"\xef\xbb\xbf" + _b(PATIENT)
    assert len(parse_payload(data)) == 1


def test_parse_empty_raises():
    with pytest.raises(FhirParseError):
        parse_payload(b"")


def test_parse_non_fhir_json_raises():
    with pytest.raises(FhirParseError):
        parse_payload(_b({"hello": "world"}))


def test_parse_invalid_json_line_raises():
    bad = (json.dumps(PATIENT) + "\n{not json}\n").encode("utf-8")
    with pytest.raises(FhirParseError):
        parse_payload(bad)


def test_parse_rejects_non_utf8():
    with pytest.raises(FhirParseError):
        parse_payload(b"\xff\xfe\x00bad")


# --------------------------------------------------------------------------
# InMemoryFhirStore
# --------------------------------------------------------------------------

def test_store_indexing_and_counts():
    store = InMemoryFhirStore([PATIENT, OBS, dict(OBS, id="o2")])
    assert store.resource_types() == ["Observation", "Patient"]
    assert store.count("Observation") == 2
    assert store.total() == 3
    assert store.summary() == {"Patient": 1, "Observation": 2}


def test_store_read_by_id():
    store = InMemoryFhirStore([PATIENT, OBS])
    assert store.read("Patient", "p1")["id"] == "p1"
    assert store.read("Patient", "nope") is None


def test_store_synthetic_ids_for_missing():
    no_id = {"resourceType": "Patient", "name": [{"family": "X"}]}
    store = InMemoryFhirStore([no_id])
    # Addressable even though the resource had no id.
    bundle = store.search("Patient")
    assert bundle["total"] == 1
    assert store.read("Patient", "_idx-0") is not None


def test_store_duplicate_ids_disambiguated():
    store = InMemoryFhirStore([PATIENT, dict(PATIENT)])  # same id "p1" twice
    assert store.count("Patient") == 2
    assert store.read("Patient", "p1") is not None
    assert store.read("Patient", "p1-1") is not None


def test_store_pagination_links():
    patients = [{"resourceType": "Patient", "id": f"p{i}"} for i in range(5)]
    store = InMemoryFhirStore(patients)

    first = store.search("Patient", count=2, offset=0)
    assert first["total"] == 5
    assert len(first["entry"]) == 2
    assert any(l["relation"] == "next" for l in first["link"])
    assert not any(l["relation"] == "prev" for l in first["link"])

    middle = store.search("Patient", count=2, offset=2)
    assert any(l["relation"] == "next" for l in middle["link"])
    assert any(l["relation"] == "prev" for l in middle["link"])

    last = store.search("Patient", count=2, offset=4)
    assert len(last["entry"]) == 1
    assert not any(l["relation"] == "next" for l in last["link"])


def test_loader_schema_infers_columns():
    loader = LocalFileSource(InMemoryFhirStore([OBS]))
    schema = loader.schema("Observation", sample=10)
    assert schema["resourceType"] == "Observation"
    assert schema["total"] == 1
    assert "id" in schema["columns"]
    # Nested coded value flattened into a dotted path.
    assert any("code.coding" in c for c in schema["columns"])


# --------------------------------------------------------------------------
# HTTP endpoints
# --------------------------------------------------------------------------

@pytest.fixture
def client():
    # Import here so app startup hooks run under the test client lifecycle.
    from app.main import app
    source_registry.clear()
    with TestClient(app) as c:
        yield c
    source_registry.clear()


def _upload(client, payload_bytes, filename="data.json"):
    return client.post(
        "/api/sources/upload",
        files={"file": (filename, io.BytesIO(payload_bytes), "application/json")},
    )


def test_upload_and_full_flow(client):
    resp = _upload(client, _b(BUNDLE))
    assert resp.status_code == 200, resp.text
    body = resp.json()["data"]
    sid = body["source_id"]
    assert body["summary"] == {"Patient": 1, "Observation": 1}

    # listed
    listing = client.get("/api/sources").json()["data"]
    assert any(s["source_id"] == sid for s in listing)

    # search
    bundle = client.get(f"/api/sources/{sid}/resources/Patient").json()["data"]
    assert bundle["resourceType"] == "Bundle"
    assert bundle["total"] == 1

    # schema
    schema = client.get(f"/api/sources/{sid}/resources/Observation/schema").json()["data"]
    assert "id" in schema["columns"]

    # read one
    one = client.get(f"/api/sources/{sid}/resources/Patient/p1").json()["data"]
    assert one["id"] == "p1"

    # delete
    assert client.delete(f"/api/sources/{sid}").status_code == 200
    assert client.get(f"/api/sources/{sid}").status_code == 404


def test_upload_invalid_returns_422(client):
    resp = _upload(client, _b({"not": "fhir"}))
    assert resp.status_code == 422


def test_unknown_source_returns_404(client):
    assert client.get("/api/sources/deadbeef/resources/Patient").status_code == 404


def test_read_missing_resource_returns_404(client):
    sid = _upload(client, _b(PATIENT)).json()["data"]["source_id"]
    assert client.get(f"/api/sources/{sid}/resources/Patient/zzz").status_code == 404
