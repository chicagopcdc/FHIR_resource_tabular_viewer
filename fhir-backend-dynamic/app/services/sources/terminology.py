"""Terminology coverage: is this data coded in standards anyone else can read?

FHIR's value is standardized terminology. A dataset coded in LOINC and SNOMED
can be pooled across institutions; the same data in local codes cannot, and the
difference is invisible in a table of values. This walks the codings in a
resource type and reports which code systems are in use, how many are
recognized standards, and where coding is missing entirely.

Three problems are called out specifically, because each one blocks reuse:
  * codes from local or proprietary systems,
  * codes with no ``system`` at all, so they cannot be resolved, and
  * concepts carrying only free text, with no code.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any, Dict, Iterable, List, Optional, Tuple

# Recognized systems, matched by prefix so versioned and regional variants
# (for example ICD-10-CM) still resolve to their family.
KNOWN_SYSTEMS: List[Tuple[str, str]] = [
    ("http://loinc.org", "LOINC"),
    ("http://snomed.info/sct", "SNOMED CT"),
    ("http://www.nlm.nih.gov/research/umls/rxnorm", "RxNorm"),
    ("http://hl7.org/fhir/sid/icd-10", "ICD-10"),
    ("http://hl7.org/fhir/sid/icd-9", "ICD-9"),
    ("http://hl7.org/fhir/sid/ndc", "NDC"),
    ("http://hl7.org/fhir/sid/cvx", "CVX"),
    ("http://unitsofmeasure.org", "UCUM"),
    ("http://www.ama-assn.org/go/cpt", "CPT"),
    ("http://terminology.hl7.org", "HL7 terminology"),
    ("http://hl7.org/fhir", "FHIR core"),
    ("urn:iso:std:iso:3166", "ISO 3166"),
]

MAX_EXAMPLES = 3


def classify_system(system: Optional[str]) -> Tuple[str, bool]:
    """Return ``(display_name, is_recognized)`` for a code system URI."""
    if not system or not str(system).strip():
        return ("(no system)", False)
    system = str(system).strip()
    for prefix, name in KNOWN_SYSTEMS:
        if system.startswith(prefix):
            return (name, True)
    return (system, False)


def find_codings(node: Any, prefix: str = "", out: Optional[List[Dict[str, Any]]] = None,
                 depth: int = 0) -> List[Dict[str, Any]]:
    """Collect every coded concept, with the path it was found at.

    Yields one entry per ``Coding`` inside a ``CodeableConcept``, plus a
    ``text_only`` marker for concepts that carry text but no coding at all.
    """
    if out is None:
        out = []
    if depth > 8 or node is None:
        return out

    if isinstance(node, list):
        for item in node:
            find_codings(item, prefix, out, depth + 1)
        return out

    if not isinstance(node, dict):
        return out

    codings = node.get("coding")
    if isinstance(codings, list) and codings:
        for coding in codings:
            if isinstance(coding, dict):
                out.append({
                    "path": prefix,
                    "system": coding.get("system"),
                    "code": coding.get("code"),
                    "display": coding.get("display") or node.get("text"),
                    "text_only": False,
                })
    elif isinstance(node.get("text"), str) and node.get("text").strip() and prefix:
        # A CodeableConcept with text but nothing coded: human readable, but
        # not machine comparable across systems.
        out.append({
            "path": prefix, "system": None, "code": None,
            "display": node["text"], "text_only": True,
        })

    for key, value in node.items():
        if key in ("coding", "text"):
            continue
        child = f"{prefix}.{key}" if prefix else key
        find_codings(value, child, out, depth + 1)

    return out


def analyze_terminology(resources: Iterable[Dict[str, Any]]) -> Dict[str, Any]:
    """Summarize code system usage across resources."""
    systems: Dict[str, Dict[str, Any]] = defaultdict(
        lambda: {"codes": set(), "count": 0, "paths": set(), "examples": []}
    )
    total_codings = 0
    text_only = 0
    missing_system = 0

    for resource in resources:
        for hit in find_codings(resource):
            if hit["text_only"]:
                text_only += 1
                continue
            total_codings += 1
            name, recognized = classify_system(hit["system"])
            entry = systems[name]
            entry["count"] += 1
            entry["recognized"] = recognized
            entry["uri"] = hit["system"]
            entry["paths"].add(hit["path"])
            if hit["code"]:
                entry["codes"].add(str(hit["code"]))
            if not hit["system"]:
                missing_system += 1
            if len(entry["examples"]) < MAX_EXAMPLES and hit["code"]:
                label = f"{hit['code']}"
                if hit["display"]:
                    label += f" ({hit['display']})"
                if label not in entry["examples"]:
                    entry["examples"].append(label)

    rows = [
        {
            "system": name,
            "uri": entry.get("uri"),
            "recognized": bool(entry.get("recognized")),
            "codings": entry["count"],
            "distinct_codes": len(entry["codes"]),
            "paths": sorted(entry["paths"]),
            "examples": entry["examples"],
            "share": (entry["count"] / total_codings) if total_codings else 0.0,
        }
        for name, entry in systems.items()
    ]
    # Standards first, then by how much of the data they carry.
    rows.sort(key=lambda r: (not r["recognized"], -r["codings"], r["system"]))

    standard = sum(r["codings"] for r in rows if r["recognized"])
    return {
        "total_codings": total_codings,
        "standard_codings": standard,
        "local_codings": total_codings - standard,
        "standard_share": (standard / total_codings) if total_codings else 0.0,
        "text_only_concepts": text_only,
        "codings_without_system": missing_system,
        "systems": rows,
    }
