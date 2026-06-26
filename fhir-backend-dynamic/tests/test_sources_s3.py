"""Tests for the S3-backed data source.

The object fetch is injected, so these exercise the real parse/store/endpoint
path without boto3, AWS credentials, or network access.
"""

import io
import json

import pytest
from fastapi.testclient import TestClient

from app.services.sources.s3_file import (
    S3FileSource,
    S3Settings,
    S3Error,
    parse_s3_uri,
)
from app.services.sources.store import FhirParseError
from app.services.sources import registry as source_registry


PATIENT = {"resourceType": "Patient", "id": "p1", "name": [{"family": "Doe"}]}
BUNDLE = {
    "resourceType": "Bundle",
    "type": "collection",
    "entry": [{"resource": PATIENT},
              {"resource": {"resourceType": "Observation", "id": "o1", "status": "final"}}],
}


def _b(obj) -> bytes:
    return json.dumps(obj).encode("utf-8")


# --------------------------------------------------------------------------
# parse_s3_uri
# --------------------------------------------------------------------------

def test_parse_s3_uri_ok():
    assert parse_s3_uri("s3://my-bucket/path/to/data.json") == ("my-bucket", "path/to/data.json")


@pytest.mark.parametrize("uri", ["", "https://x/y", "s3://", "s3://bucket-only", "s3:///key-only"])
def test_parse_s3_uri_rejects_bad(uri):
    with pytest.raises(ValueError):
        parse_s3_uri(uri)


# --------------------------------------------------------------------------
# S3FileSource with an injected fetcher
# --------------------------------------------------------------------------

def test_from_s3_uses_fetcher_and_parses():
    captured = {}

    def fake_fetch(bucket, key, settings):
        captured["bucket"] = bucket
        captured["key"] = key
        captured["settings"] = settings
        return _b(BUNDLE)

    src = S3FileSource.from_s3("s3://b/k.json", fetcher=fake_fetch)
    assert captured["bucket"] == "b"
    assert captured["key"] == "k.json"
    assert src.source_type == "s3"
    assert src.summary() == {"Patient": 1, "Observation": 1}
    assert src.read("Patient", "p1")["name"][0]["family"] == "Doe"


def test_from_s3_passes_settings_through():
    seen = {}

    def fake_fetch(bucket, key, settings):
        seen["settings"] = settings
        return _b(PATIENT)

    settings = S3Settings(region="us-east-1", endpoint_url="http://localhost:9000")
    S3FileSource.from_s3("s3://b/k", settings=settings, fetcher=fake_fetch)
    assert seen["settings"].region == "us-east-1"
    assert seen["settings"].endpoint_url == "http://localhost:9000"


def test_from_s3_bad_uri_raises_value_error():
    with pytest.raises(ValueError):
        S3FileSource.from_s3("not-s3", fetcher=lambda *a: b"")


def test_from_s3_non_fhir_raises_parse_error():
    with pytest.raises(FhirParseError):
        S3FileSource.from_s3("s3://b/k", fetcher=lambda *a: _b({"nope": 1}))


def test_from_s3_fetch_failure_propagates():
    def boom(*_):
        raise S3Error("access denied")

    with pytest.raises(S3Error):
        S3FileSource.from_s3("s3://b/k", fetcher=boom)


# --------------------------------------------------------------------------
# HTTP endpoint (fetcher monkeypatched at the module the router imports)
# --------------------------------------------------------------------------

@pytest.fixture
def client():
    from app.main import app
    source_registry.clear()
    with TestClient(app) as c:
        yield c
    source_registry.clear()


def test_s3_endpoint_happy_path(client, monkeypatch):
    import app.services.sources.s3_file as s3mod
    monkeypatch.setattr(s3mod, "_boto3_fetch", lambda bucket, key, settings: _b(BUNDLE))

    resp = client.post("/api/sources/s3", json={"uri": "s3://demo/data.json"})
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["source_type"] == "s3"
    assert data["summary"] == {"Patient": 1, "Observation": 1}

    # and it is queryable like any other source
    sid = data["source_id"]
    bundle = client.get(f"/api/sources/{sid}/resources/Patient").json()["data"]
    assert bundle["total"] == 1


def test_s3_endpoint_bad_uri_returns_400(client):
    resp = client.post("/api/sources/s3", json={"uri": "https://not-s3/x"})
    assert resp.status_code == 400


def test_s3_endpoint_fetch_error_returns_502(client, monkeypatch):
    import app.services.sources.s3_file as s3mod

    def boom(bucket, key, settings):
        raise S3Error("NoSuchKey")

    monkeypatch.setattr(s3mod, "_boto3_fetch", boom)
    resp = client.post("/api/sources/s3", json={"uri": "s3://demo/missing.json"})
    assert resp.status_code == 502


def test_s3_endpoint_non_fhir_returns_422(client, monkeypatch):
    import app.services.sources.s3_file as s3mod
    monkeypatch.setattr(s3mod, "_boto3_fetch", lambda *a: _b({"not": "fhir"}))
    resp = client.post("/api/sources/s3", json={"uri": "s3://demo/bad.json"})
    assert resp.status_code == 422
