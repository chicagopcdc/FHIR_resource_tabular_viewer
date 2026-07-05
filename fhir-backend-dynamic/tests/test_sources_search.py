"""Tests for text search and column sort on the in-memory store / endpoint."""

import io
import json

import pytest
from fastapi.testclient import TestClient

from app.services.sources.store import InMemoryFhirStore
from app.services.sources import registry as source_registry


def _obs(oid, display, value):
    return {
        "resourceType": "Observation",
        "id": oid,
        "status": "final",
        "code": {"coding": [{"display": display}], "text": display},
        "valueQuantity": {"value": value, "unit": "mg"},
    }


DATA = [
    _obs("o1", "Gentamicin", 30),
    _obs("o2", "Oxacillin", 10),
    _obs("o3", "Gentamicin", 5),
    _obs("o4", "Clindamycin", 20),
]


# -------------------- store-level --------------------

def test_search_text_filter():
    store = InMemoryFhirStore(list(DATA))
    b = store.search("Observation", q="gentamicin")  # case-insensitive
    assert b["total"] == 2
    assert {e["resource"]["id"] for e in b["entry"]} == {"o1", "o3"}


def test_search_no_match():
    store = InMemoryFhirStore(list(DATA))
    assert store.search("Observation", q="zzz")["total"] == 0


def test_search_filter_then_paginate():
    store = InMemoryFhirStore(list(DATA))
    b = store.search("Observation", q="final", count=2, offset=0)  # status in all 4
    assert b["total"] == 4
    assert len(b["entry"]) == 2
    assert any(l["relation"] == "next" for l in b["link"])


def test_sort_by_text_asc_desc():
    store = InMemoryFhirStore(list(DATA))
    asc = store.search("Observation", sort="code.coding[0].display", order="asc")
    names = [e["resource"]["code"]["coding"][0]["display"] for e in asc["entry"]]
    assert names == sorted(names)

    desc = store.search("Observation", sort="code.coding[0].display", order="desc")
    names_desc = [e["resource"]["code"]["coding"][0]["display"] for e in desc["entry"]]
    assert names_desc == sorted(names_desc, reverse=True)


def test_sort_numeric():
    store = InMemoryFhirStore(list(DATA))
    b = store.search("Observation", sort="valueQuantity.value", order="asc")
    values = [e["resource"]["valueQuantity"]["value"] for e in b["entry"]]
    assert values == [5, 10, 20, 30]


def test_sort_missing_value_sorts_last():
    data = list(DATA) + [{"resourceType": "Observation", "id": "o5", "status": "final"}]
    store = InMemoryFhirStore(data)
    b = store.search("Observation", sort="valueQuantity.value", order="asc")
    assert b["entry"][-1]["resource"]["id"] == "o5"


def test_search_and_sort_combined():
    store = InMemoryFhirStore(list(DATA))
    b = store.search("Observation", q="gentamicin", sort="valueQuantity.value", order="asc")
    assert [e["resource"]["id"] for e in b["entry"]] == ["o3", "o1"]  # 5 then 30


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


def test_endpoint_search_and_sort(client):
    sid = _upload(client, DATA).json()["data"]["source_id"]

    r = client.get(f"/api/sources/{sid}/resources/Observation", params={"q": "gentamicin"})
    assert r.status_code == 200
    assert r.json()["data"]["total"] == 2

    r = client.get(
        f"/api/sources/{sid}/resources/Observation",
        params={"sort": "valueQuantity.value", "order": "desc"},
    )
    vals = [e["resource"]["valueQuantity"]["value"] for e in r.json()["data"]["entry"]]
    assert vals == [30, 20, 10, 5]


def test_endpoint_rejects_bad_order(client):
    sid = _upload(client, DATA).json()["data"]["source_id"]
    r = client.get(f"/api/sources/{sid}/resources/Observation", params={"order": "sideways"})
    assert r.status_code == 422
