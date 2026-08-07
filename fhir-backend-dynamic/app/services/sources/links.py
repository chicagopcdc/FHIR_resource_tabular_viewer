"""Reference integrity: do the links in this dataset actually resolve?

FHIR resources form a graph. An Observation points at a Patient, an Encounter
points at both. A table flattens that away, so a broken export looks fine until
an analysis silently loses rows to references that point at data the file does
not contain.

This walks resources, collects every ``Reference`` element with the path it was
found at, and checks whether each target exists in the loaded dataset. The
result says, per link, how much of it resolves and gives concrete examples of
what is missing.
"""

from __future__ import annotations

import re
from collections import defaultdict
from typing import Any, Callable, Dict, Iterable, List, Optional, Set, Tuple

# "Patient/123", "Observation/abc-1", optionally with a version suffix, and
# absolute URLs whose tail still carries Type/id.
_REF_RE = re.compile(r"(?:^|/)([A-Z][A-Za-z]+)/([A-Za-z0-9\-.]{1,64})(?:/_history/.+)?$")

MAX_DANGLING_EXAMPLES = 5


def parse_reference(ref: str) -> Optional[Tuple[str, str]]:
    """Split a FHIR reference string into ``(resource_type, id)``.

    Handles relative references, absolute URLs, and version-specific ones.
    Returns None for contained (``#local``) or otherwise unusable references.
    """
    if not isinstance(ref, str):
        return None
    ref = ref.strip()
    if not ref or ref.startswith("#"):
        return None  # contained resource, resolved inside its parent
    if ref.startswith("urn:"):
        return None  # bundle-local uuid, not addressable by type/id
    match = _REF_RE.search(ref)
    if not match:
        return None
    return match.group(1), match.group(2)


def find_references(node: Any, prefix: str = "", out: Optional[List[Tuple[str, str]]] = None,
                    depth: int = 0) -> List[Tuple[str, str]]:
    """Collect ``(path, reference_string)`` for every Reference in a resource.

    Array indices are collapsed so ``performer[0]`` and ``performer[1]`` report
    as one ``performer`` link rather than fragmenting the summary.
    """
    if out is None:
        out = []
    if depth > 8:
        return out

    if isinstance(node, dict):
        ref = node.get("reference")
        if isinstance(ref, str) and prefix:
            out.append((prefix, ref))
        for key, value in node.items():
            if key == "reference":
                continue
            child = f"{prefix}.{key}" if prefix else key
            find_references(value, child, out, depth + 1)
    elif isinstance(node, list):
        for item in node:
            find_references(item, prefix, out, depth + 1)

    return out


def analyze_links(
    resources: Iterable[Dict[str, Any]],
    exists: Callable[[str, str], bool],
    *,
    max_dangling_examples: int = MAX_DANGLING_EXAMPLES,
) -> List[Dict[str, Any]]:
    """Summarize every link, with how much of it resolves inside the dataset.

    ``exists(resource_type, resource_id)`` reports whether a target is present.
    Each distinct target is checked once, so a million references to a handful
    of patients cost only a handful of lookups.
    """
    # (path, target_type) -> {"count": n, "targets": {id, ...}}
    groups: Dict[Tuple[str, str], Dict[str, Any]] = defaultdict(
        lambda: {"count": 0, "targets": set()}
    )
    unparsed = 0

    for resource in resources:
        for path, ref in find_references(resource):
            parsed = parse_reference(ref)
            if parsed is None:
                unparsed += 1
                continue
            target_type, target_id = parsed
            group = groups[(path, target_type)]
            group["count"] += 1
            group["targets"].add(target_id)

    # Cache lookups so the same target is never checked twice across groups.
    seen: Dict[Tuple[str, str], bool] = {}

    def resolves(rtype: str, rid: str) -> bool:
        key = (rtype, rid)
        if key not in seen:
            seen[key] = bool(exists(rtype, rid))
        return seen[key]

    results: List[Dict[str, Any]] = []
    for (path, target_type), group in groups.items():
        targets: Set[str] = group["targets"]
        resolved = {t for t in targets if resolves(target_type, t)}
        dangling = sorted(targets - resolved)
        results.append({
            "path": path,
            "target_type": target_type,
            "references": group["count"],
            "distinct_targets": len(targets),
            "resolved_targets": len(resolved),
            "dangling_targets": len(dangling),
            "resolution": (len(resolved) / len(targets)) if targets else 0.0,
            "dangling_examples": [f"{target_type}/{t}" for t in dangling[:max_dangling_examples]],
        })

    # Most-used links first, then the least healthy.
    results.sort(key=lambda r: (-r["references"], r["resolution"], r["path"]))
    if unparsed:
        results.append({
            "path": "(unparseable)",
            "target_type": "",
            "references": unparsed,
            "distinct_targets": 0,
            "resolved_targets": 0,
            "dangling_targets": 0,
            "resolution": 0.0,
            "dangling_examples": [],
        })
    return results
