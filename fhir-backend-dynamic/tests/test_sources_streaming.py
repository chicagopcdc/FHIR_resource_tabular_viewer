"""Tests for the disk-backed streaming store used for very large files."""

import io
import json
import os

import pytest
from fastapi.testclient import TestClient

from app.services.sources import registry as source_registry
from app.services.sources.sqlite_store import SqliteFhirStore, dotted_to_jsonpath
from app.services.sources.store import FhirParseError
from app.services.sources.streaming_file import StreamingFileSource


def _obs(oid, display, value):
    return {
        "resourceType": "Observation",
        "id": oid,
        "status": "final",
        "code": {"coding": [{"display": display}]},
        "valueQuantity": {"value": value, "unit": "mg"},
    }


DATA = [
    _obs("o1", "Gentamicin", 30),
    _obs("o2", "Oxacillin", 10),
    _obs("o3", "Vancomycin", 20),
    {"resourceType": "Patient", "id": "p1", "name": [{"family": "Doe"}]},
]


def _lines(resources):
    return [(json.dumps(r) + "\n").encode("utf-8") for r in resources]


@pytest.fixture
def store():
    s = SqliteFhirStore()
    yield s
    s.close()


# -------------------- path translation --------------------

def test_dotted_to_jsonpath():
    assert dotted_to_jsonpath("code.coding[0].display") == "$.code.coding[0].display"
    assert dotted_to_jsonpath("status") == "$.status"
    assert dotted_to_jsonpath("") == "$"


# -------------------- ingestion --------------------

def test_ingest_counts_and_types(store):
    n = store.ingest_lines(_lines(DATA))
    assert n == 4
    assert store.resource_types() == ["Observation", "Patient"]
    assert store.summary() == {"Observation": 3, "Patient": 1}
    assert store.total() == 4


def test_ingest_unwraps_bundles(store):
    bundle = {
        "resourceType": "Bundle",
        "type": "collection",
        "entry": [{"resource": DATA[0]}, {"resource": DATA[3]}],
    }
    store.ingest_lines(_lines([bundle]))
    assert store.summary() == {"Observation": 1, "Patient": 1}


def test_ingest_skips_blank_lines(store):
    raw = _lines(DATA[:2])
    raw.insert(1, b"\n")
    raw.append(b"   \n")
    assert store.ingest_lines(raw) == 2


def test_ingest_rejects_bad_json(store):
    with pytest.raises(FhirParseError):
        store.ingest_lines([b'{"resourceType":"Patient"}\n', b"{not json}\n"])


def test_ingest_rejects_empty(store):
    with pytest.raises(FhirParseError):
        store.ingest_lines([b"\n", b"  \n"])


def test_ingest_enforces_max_resources(store):
    with pytest.raises(FhirParseError):
        store.ingest_lines(_lines(DATA), max_resources=2)


# -------------------- query --------------------

def test_search_pagination_and_links(store):
    store.ingest_lines(_lines(DATA))
    b = store.search("Observation", count=2, offset=0)
    assert b["total"] == 3
    assert len(b["entry"]) == 2
    assert any(l["relation"] == "next" for l in b["link"])
    assert not any(l["relation"] == "prev" for l in b["link"])

    b2 = store.search("Observation", count=2, offset=2)
    assert len(b2["entry"]) == 1
    assert any(l["relation"] == "prev" for l in b2["link"])


def test_search_text_filter_is_case_insensitive(store):
    store.ingest_lines(_lines(DATA))
    b = store.search("Observation", q="gentamicin")
    assert b["total"] == 1
    assert b["entry"][0]["resource"]["id"] == "o1"


def test_search_filter_no_match(store):
    store.ingest_lines(_lines(DATA))
    assert store.search("Observation", q="zzzz")["total"] == 0


def test_search_wildcards_are_literal(store):
    store.ingest_lines(_lines(DATA))
    # Punctuation-only input has no searchable tokens, so it must match nothing
    # rather than acting as a wildcard.
    assert store.search("Observation", q="%")["total"] == 0
    assert store.search("Observation", q='" OR 1=1 --')["total"] == 0


def test_search_matches_word_prefix(store):
    store.ingest_lines(_lines(DATA))
    assert store.search("Observation", q="genta")["total"] == 1
    assert store.search("Observation", q="GENTA")["total"] == 1


def test_build_fts_query():
    from app.services.sources.sqlite_store import build_fts_query
    assert build_fts_query("genta") == '"genta"*'
    assert build_fts_query("genta cin") == '"genta"* AND "cin"*'
    assert build_fts_query("  %%  ") is None
    assert build_fts_query("") is None


def test_sort_numeric_and_text(store):
    store.ingest_lines(_lines(DATA))
    asc = store.search("Observation", sort="valueQuantity.value", order="asc")
    assert [e["resource"]["valueQuantity"]["value"] for e in asc["entry"]] == [10, 20, 30]

    desc = store.search("Observation", sort="code.coding[0].display", order="desc")
    names = [e["resource"]["code"]["coding"][0]["display"] for e in desc["entry"]]
    assert names == sorted(names, reverse=True)


def test_sort_missing_values_last(store):
    data = DATA[:3] + [{"resourceType": "Observation", "id": "o4", "status": "final"}]
    store.ingest_lines(_lines(data))
    b = store.search("Observation", sort="valueQuantity.value", order="asc")
    assert b["entry"][-1]["resource"]["id"] == "o4"


def test_search_and_sort_combined(store):
    store.ingest_lines(_lines(DATA))
    # Search matches word prefixes, so "van" finds Vancomycin only.
    b = store.search("Observation", q="van", sort="valueQuantity.value", order="desc")
    assert [e["resource"]["id"] for e in b["entry"]] == ["o3"]

    # A term shared by several rows still sorts correctly.
    b2 = store.search("Observation", q="final", sort="valueQuantity.value", order="desc")
    assert [e["resource"]["id"] for e in b2["entry"]] == ["o1", "o3", "o2"]


def test_read_by_id_and_missing(store):
    store.ingest_lines(_lines(DATA))
    assert store.read("Observation", "o2")["id"] == "o2"
    assert store.read("Observation", "nope") is None


def test_read_synthetic_id_for_missing_id(store):
    store.ingest_lines(_lines([{"resourceType": "Patient", "name": [{"family": "X"}]}]))
    assert store.read("Patient", "_idx-0") is not None


def test_close_removes_temp_database():
    s = SqliteFhirStore()
    path = s.db_path
    s.ingest_lines(_lines(DATA))
    assert os.path.exists(path)
    s.close()
    assert not os.path.exists(path)


def test_loader_schema_uses_shared_inference():
    src = StreamingFileSource.from_lines(_lines(DATA))
    try:
        schema = src.schema("Observation", sample=10)
        assert schema["total"] == 3
        assert "id" in schema["columns"]
        assert any("code.coding" in c for c in schema["columns"])
    finally:
        src.close()


# -------------------- endpoint --------------------

@pytest.fixture
def client():
    from app.main import app
    source_registry.clear()
    with TestClient(app) as c:
        yield c
    source_registry.clear()


def _upload_stream(client, resources, name="big.ndjson"):
    payload = b"".join(_lines(resources))
    return client.post(
        "/api/sources/upload/stream",
        files={"file": (name, io.BytesIO(payload), "application/x-ndjson")},
    )


def test_stream_endpoint_full_flow(client):
    r = _upload_stream(client, DATA)
    assert r.status_code == 200, r.text
    meta = r.json()["data"]
    assert meta["source_type"] == "streaming_file"
    assert meta["summary"] == {"Observation": 3, "Patient": 1}

    sid = meta["source_id"]
    # searchable
    b = client.get(f"/api/sources/{sid}/resources/Observation", params={"q": "oxacillin"}).json()["data"]
    assert b["total"] == 1
    # sortable
    b2 = client.get(
        f"/api/sources/{sid}/resources/Observation",
        params={"sort": "valueQuantity.value", "order": "desc"},
    ).json()["data"]
    assert b2["entry"][0]["resource"]["valueQuantity"]["value"] == 30
    # exportable
    exp = client.get(f"/api/sources/{sid}/resources/Observation/export", params={"format": "ndjson"})
    assert len([l for l in exp.text.splitlines() if l.strip()]) == 3
    # readable one by one
    assert client.get(f"/api/sources/{sid}/resources/Observation/o1").status_code == 200


def test_stream_endpoint_deletes_temp_file_on_unload(client):
    sid = _upload_stream(client, DATA).json()["data"]["source_id"]
    loader = source_registry.get_source(sid)
    path = loader._store.db_path
    assert os.path.exists(path)
    assert client.delete(f"/api/sources/{sid}").status_code == 200
    assert not os.path.exists(path)


def test_stream_endpoint_rejects_bad_ndjson(client):
    payload = b'{"resourceType":"Patient"}\n{oops}\n'
    r = client.post(
        "/api/sources/upload/stream",
        files={"file": ("bad.ndjson", io.BytesIO(payload), "application/x-ndjson")},
    )
    assert r.status_code == 422
