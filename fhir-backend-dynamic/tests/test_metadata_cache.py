"""Tests for the bounded metadata caches."""

from datetime import datetime, timedelta

from app.routers import metadata


def test_get_returns_cached_value():
    cache = {}
    metadata._cache_set(cache, "http://server/metadata", {"fhir_version": "4.0.1"})
    assert metadata._cache_get(cache, "http://server/metadata") == {"fhir_version": "4.0.1"}


def test_get_returns_none_for_unknown_key():
    assert metadata._cache_get({}, "missing") is None


def test_expired_entry_is_dropped():
    """An entry past its expiry is a miss and does not stay in the cache."""
    cache = {"stale": (datetime.now() - timedelta(seconds=1), {"old": True})}

    assert metadata._cache_get(cache, "stale") is None
    assert "stale" not in cache


def test_set_evicts_once_over_the_cap(monkeypatch):
    monkeypatch.setattr(metadata, "MAX_METADATA_CACHE_ENTRIES", 3)
    cache = {}

    for i in range(10):
        metadata._cache_set(cache, f"key_{i}", i)

    assert len(cache) == 3


def test_set_evicts_the_entry_closest_to_expiry(monkeypatch):
    monkeypatch.setattr(metadata, "MAX_METADATA_CACHE_ENTRIES", 2)
    now = datetime.now()
    cache = {
        "soonest": (now + timedelta(minutes=1), "a"),
        "later": (now + timedelta(hours=5), "b"),
    }

    metadata._cache_set(cache, "new", "c")

    assert "soonest" not in cache
    assert set(cache) == {"later", "new"}


def test_set_refreshes_an_existing_key(monkeypatch):
    monkeypatch.setattr(metadata, "MAX_METADATA_CACHE_ENTRIES", 2)
    cache = {}

    metadata._cache_set(cache, "key", "first")
    metadata._cache_set(cache, "key", "second")

    assert len(cache) == 1
    assert metadata._cache_get(cache, "key") == "second"
