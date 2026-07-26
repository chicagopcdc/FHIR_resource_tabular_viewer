"""Tests for CSV / NDJSON export of loaded resources."""

import io
import json

import pytest
from fastapi.testclient import TestClient

from app.services.sources import export as export_service
from app.services.sources import registry as source_registry


def _obs(oid, display, value):
    return {
        "resourceType": "Observation",
        "id": oid,
        "status": "final",
        "code": {"coding": [{"display": display}]},
        "valueQuantity": {"value": value, "unit": "mg"},
    }


DATA = [_obs("o1", "Gentamicin", 30), _obs("o2", "Oxacillin", 10)]


# -------------------- module-level --------------------

def test_rows_to_csv_header_and_values():
    cols = ["id", "code.coding[0].display", "valueQuantity.value"]
    text = "".join(export_service.rows_to_csv(DATA, cols))
    lines = text.strip().splitlines()
    assert lines[0] == "id,code.coding[0].display,valueQuantity.value"
    assert lines[1] == "o1,Gentamicin,30"
    assert lines[2] == "o2,Oxacillin,10"


def test_rows_to_csv_missing_value_is_blank():
    cols = ["id", "nope.missing"]
    text = "".join(export_service.rows_to_csv([DATA[0]], cols))
    assert text.strip().splitlines()[1] == "o1,"


def test_rows_to_csv_nested_object_is_json():
    cols = ["code"]
    text = "".join(export_service.rows_to_csv([DATA[0]], cols))
    # The whole CodeableConcept is serialized as JSON inside the cell.
    assert "coding" in text.splitlines()[1]


def test_rows_to_ndjson_one_line_each():
    lines = list(export_service.rows_to_ndjson(DATA))
    assert len(lines) == 2
    assert json.loads(lines[0])["id"] == "o1"


# -------------------- endpoint-level --------------------

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


def test_export_csv(client):
    sid = _upload(client, DATA).json()["data"]["source_id"]
    r = client.get(f"/api/sources/{sid}/resources/Observation/export", params={"format": "csv"})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    assert "attachment" in r.headers["content-disposition"]
    assert "Observation.csv" in r.headers["content-disposition"]
    body = r.text.strip().splitlines()
    assert body[0].startswith("id,")
    assert len(body) == 3  # header + 2 rows


def test_export_ndjson(client):
    sid = _upload(client, DATA).json()["data"]["source_id"]
    r = client.get(f"/api/sources/{sid}/resources/Observation/export", params={"format": "ndjson"})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/x-ndjson")
    lines = [l for l in r.text.splitlines() if l.strip()]
    assert len(lines) == 2
    assert json.loads(lines[0])["resourceType"] == "Observation"


def test_export_honours_filter(client):
    sid = _upload(client, DATA).json()["data"]["source_id"]
    r = client.get(
        f"/api/sources/{sid}/resources/Observation/export",
        params={"format": "ndjson", "q": "gentamicin"},
    )
    lines = [l for l in r.text.splitlines() if l.strip()]
    assert len(lines) == 1
    assert json.loads(lines[0])["id"] == "o1"


def test_export_bad_format_rejected(client):
    sid = _upload(client, DATA).json()["data"]["source_id"]
    r = client.get(f"/api/sources/{sid}/resources/Observation/export", params={"format": "xml"})
    assert r.status_code == 422


def test_export_unknown_source_404(client):
    assert client.get("/api/sources/nope/resources/Observation/export").status_code == 404
