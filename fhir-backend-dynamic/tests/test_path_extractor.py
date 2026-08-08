"""
Tests for the consolidated path extractor.
Run with: pytest tests/test_path_extractor.py -v
"""
import pytest
from app.services.path_extractor import extract_single_value_by_path, extract_values_by_path


# ── Simple field ──────────────────────────────────────────────
def test_simple_field():
    """Grabbing a top-level field like 'status' should just work."""
    resource = {"status": "active"}
    assert extract_single_value_by_path(resource, "status") == "active"


# ── Nested path ───────────────────────────────────────────────
def test_nested_path():
    """Grabbing a value buried inside nested objects."""
    resource = {"code": {"coding": [{"display": "Blood Pressure"}]}}
    result = extract_single_value_by_path(resource, "code.coding[0].display")
    assert result == "Blood Pressure"


# ── Wildcard ──────────────────────────────────────────────────
def test_wildcard_returns_all_items():
    """[*] should collect values from every item in the array."""
    resource = {
        "code": {
            "coding": [
                {"display": "BP"},
                {"display": "Blood Pressure"}
            ]
        }
    }
    result = extract_single_value_by_path(resource, "code.coding[*].display")
    assert result == ["BP", "Blood Pressure"]


# ── Missing path ──────────────────────────────────────────────
def test_missing_path_returns_none():
    """If the path doesn't exist, return None — don't crash."""
    resource = {"status": "active"}
    assert extract_single_value_by_path(resource, "nonexistent.field") is None


# ── Empty array ───────────────────────────────────────────────
def test_empty_array_returns_none():
    """If the array is empty, there's nothing to return."""
    resource = {"code": {"coding": []}}
    assert extract_single_value_by_path(resource, "code.coding[0].display") is None


# ── Wildcard on empty array ───────────────────────────────────
def test_wildcard_empty_array_returns_none():
    """Wildcard on empty array should also return None."""
    resource = {"code": {"coding": []}}
    assert extract_single_value_by_path(resource, "code.coding[*].display") is None


# ── extract_values_by_path (list version) ────────────────────
def test_extract_values_across_multiple_resources():
    """The list version should collect values from all resources."""
    resources = [
        {"status": "active"},
        {"status": "inactive"},
        {"status": "active"},
    ]
    result = extract_values_by_path(resources, "status")
    assert result == ["active", "inactive", "active"]