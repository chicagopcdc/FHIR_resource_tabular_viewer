"""Tests for dataset profiling (completeness, distinct counts, top values)."""

import io
import json

import pytest
from fastapi.testclient import TestClient

from app.services.sources import profile as profile_service
from app.services.sources import registry as source_registry
from app.services.sources.local_file import LocalFileSource
from app.services.sources.store import InMemoryFhirStore
from app.services.sources.streaming_file import StreamingFileSource


def _obs(oid, display, status="final", value=None):
    r = {
        "resourceType": "Observation",
        "id": oid,
        "status": status,
        "code": {"coding": [{"display": display}]},
    }
    if value is not None:
        r["valueQuantity"] = {"value": value, "unit": "mg"}
    return r


# Gentamicin x3, Oxacillin x1; only two have a value.
DATA = [
    _obs("o1", "Gentamicin", value=30),
    _obs("o2", "Gentamicin", value=10),
    _obs("o3", "Gentamicin"),
    _obs("o4", "Oxacillin", status="preliminary"),
]


# -------------------- normalize_value --------------------

def test_normalize_treats_empty_as_absent():
    assert profile_service.normalize_value(None) is None
    assert profile_service.normalize_value("") is None
    assert profile_service.normalize_value("  ") is None
    assert profile_service.normalize_value([]) is None
    assert profile_service.normalize_value({}) is None


def test_normalize_renders_scalars_and_structures():
    assert profile_service.normalize_value("final") == "final"
    assert profile_service.normalize_value(5) == "5"
    assert profile_service.normalize_value(True) == "true"
    assert profile_service.normalize_value({"a": 1}) == '{"a": 1}'


def test_normalize_truncates_long_values():
    out = profile_service.normalize_value("x" * 500)
    assert len(out) == profile_service.MAX_VALUE_CHARS
    assert out.endswith("...")


# -------------------- pure profiling --------------------

def test_profile_column_completeness_and_top_values():
    p = profile_service.profile_column(DATA, "code.coding[0].display")
    assert p["total"] == 4
    assert p["populated"] == 4
    assert p["completeness"] == 1.0
    assert p["distinct"] == 2
    assert p["top_values"][0] == {"value": "Gentamicin", "count": 3}


def test_profile_column_partial_completeness():
    p = profile_service.profile_column(DATA, "valueQuantity.value")
    assert p["populated"] == 2
    assert p["completeness"] == 0.5


def test_profile_column_absent_path():
    p = profile_service.profile_column(DATA, "nope.missing")
    assert p["populated"] == 0
    assert p["completeness"] == 0.0
    assert p["top_values"] == []


def test_profile_resources_sorts_most_complete_first():
    profiles = profile_service.profile_resources(DATA)
    completeness = [p["completeness"] for p in profiles]
    assert completeness == sorted(completeness, reverse=True)


def test_profile_resources_empty():
    assert profile_service.profile_resources([]) == []


# -------------------- loader integration --------------------

def test_in_memory_loader_profiles_everything():
    loader = LocalFileSource(InMemoryFhirStore(list(DATA)))
    out = loader.profile("Observation")
    assert out["total"] == 4
    assert out["profiled"] == 4
    paths = {c["path"]: c for c in out["columns"]}
    assert paths["status"]["distinct"] == 2


def test_streaming_and_memory_agree():
    """The SQL path must report the same numbers as the Python path."""
    lines = [json.dumps(r).encode("utf-8") for r in DATA]
    streamed = StreamingFileSource.from_lines(lines, filename="d.ndjson")
    try:
        sql = {c["path"]: c for c in streamed.profile("Observation")["columns"]}
        mem = {
            c["path"]: c
            for c in LocalFileSource(InMemoryFhirStore(list(DATA))).profile("Observation")["columns"]
        }
        for path in ["status", "code.coding[0].display", "valueQuantity.value"]:
            assert sql[path]["populated"] == mem[path]["populated"], path
            assert sql[path]["distinct"] == mem[path]["distinct"], path
            assert sql[path]["top_values"][:1] == mem[path]["top_values"][:1], path
    finally:
        streamed.close()


def test_streaming_sample_is_spread_and_capped():
    """A capped sample must span the whole file, not just its beginning."""
    many = [_obs(f"o{i}", "Early" if i < 50 else "Late") for i in range(100)]
    lines = [json.dumps(r).encode("utf-8") for r in many]
    streamed = StreamingFileSource.from_lines(lines, filename="d.ndjson")
    try:
        out = streamed.profile("Observation", sample=10)
        assert out["total"] == 100
        assert out["profiled"] <= 10
        assert out["sampled"] is True
        # Both halves of the file must be represented in the sample.
        display = next(c for c in out["columns"] if c["path"] == "code.coding[0].display")
        assert {v["value"] for v in display["top_values"]} == {"Early", "Late"}
    finally:
        streamed.close()


def test_streaming_small_type_is_exact():
    lines = [json.dumps(r).encode("utf-8") for r in DATA]
    streamed = StreamingFileSource.from_lines(lines, filename="d.ndjson")
    try:
        out = streamed.profile("Observation", sample=1000)
        assert out["profiled"] == 4
        assert out["sampled"] is False
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


def test_profile_endpoint(client):
    sid = _upload(client, DATA).json()["data"]["source_id"]
    r = client.get(f"/api/sources/{sid}/resources/Observation/profile")
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["total"] == 4
    assert any(c["path"] == "status" for c in data["columns"])


def test_profile_endpoint_respects_top_n(client):
    sid = _upload(client, DATA).json()["data"]["source_id"]
    data = client.get(
        f"/api/sources/{sid}/resources/Observation/profile", params={"top_n": 1}
    ).json()["data"]
    assert all(len(c["top_values"]) <= 1 for c in data["columns"])


def test_profile_endpoint_unknown_source_404(client):
    assert client.get("/api/sources/nope/resources/Observation/profile").status_code == 404
