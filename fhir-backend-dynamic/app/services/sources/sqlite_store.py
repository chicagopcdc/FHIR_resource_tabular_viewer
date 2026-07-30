"""Disk-backed FHIR resource store for very large files.

The in-memory store (:mod:`app.services.sources.store`) holds every resource
plus a serialized text index in RAM, which does not survive a multi-GB export.
This store instead streams resources into a SQLite database on disk as they are
parsed, so peak memory stays flat no matter how large the input is, and answers
search / sort / pagination as indexed SQL rather than Python loops.

Two indexing strategies keep exploration interactive on files this size:

* **Search** uses an FTS5 full-text index built during ingest, turning a
  multi-second table scan into a sub-second lookup. Terms match whole words or
  word prefixes (rather than arbitrary substrings); if FTS5 is unavailable in
  the host SQLite build, it degrades to a ``LIKE`` scan automatically.
* **Sort** builds an expression index over ``json_extract`` for a column the
  first time that column is sorted, then reuses it. Sorting is paginated in two
  segments (non-null values, then nulls) so missing values stay last while the
  index still satisfies the ordering.
"""

from __future__ import annotations

import json
import logging
import os
import re
import sqlite3
import tempfile
from typing import Any, Dict, Iterable, Iterator, List, Optional, Tuple

from app.services import fhir
from app.services.sources.store import FhirParseError

logger = logging.getLogger(__name__)

# Rows per executemany batch during ingestion.
BATCH_SIZE = 2000

_INDEX_RE = re.compile(r"\[(\d+)\]")


def dotted_to_jsonpath(path: str) -> str:
    """Convert ``code.coding[0].display`` into SQLite's ``$.code.coding[0].display``.

    Returns ``"$"`` for an empty path. Segments are passed through as-is;
    json_extract simply yields NULL for anything that does not resolve.
    """
    path = (path or "").strip()
    if not path:
        return "$"
    return "$." + path


def _escape_like(needle: str) -> str:
    """Escape LIKE wildcards so a literal substring search stays literal."""
    return needle.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


_FTS_TOKEN_RE = re.compile(r"[A-Za-z0-9]+")


def build_fts_query(text: str) -> Optional[str]:
    """Turn user input into a safe FTS5 MATCH expression, or None if unusable.

    Each alphanumeric token becomes a quoted prefix term, so "genta cin" matches
    documents containing a word starting with "genta" and one starting with
    "cin". Returning None means the query has no searchable tokens.
    """
    tokens = _FTS_TOKEN_RE.findall(text or "")
    if not tokens:
        return None
    return " AND ".join(f'"{t}"*' for t in tokens)


def _iter_resources_from_lines(lines: Iterable[bytes]) -> Iterator[Dict[str, Any]]:
    """Yield FHIR resources from an iterable of raw NDJSON lines.

    Bundles are unwrapped, arrays are flattened, and blank lines are skipped, so
    both bulk-export NDJSON and line-per-Bundle files stream correctly.
    """
    for lineno, raw in enumerate(lines, start=1):
        if not raw:
            continue
        text = raw.decode("utf-8-sig", errors="strict").strip() if isinstance(raw, bytes) else raw.strip()
        if not text:
            continue
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError as exc:
            raise FhirParseError(
                f"Streaming ingest expects newline-delimited JSON. "
                f"Line {lineno} is not valid JSON: {exc}"
            ) from exc

        if isinstance(parsed, dict) and parsed.get("resourceType") == "Bundle":
            for r in fhir.entries(parsed):
                if isinstance(r, dict) and isinstance(r.get("resourceType"), str):
                    yield r
        elif isinstance(parsed, dict) and isinstance(parsed.get("resourceType"), str):
            yield parsed
        elif isinstance(parsed, list):
            for r in parsed:
                if isinstance(r, dict) and isinstance(r.get("resourceType"), str):
                    yield r
        else:
            raise FhirParseError(f"Line {lineno} is valid JSON but is not a FHIR resource.")


class SqliteFhirStore:
    """A FHIR resource store backed by a SQLite file on disk."""

    def __init__(self, db_path: Optional[str] = None):
        if db_path is None:
            fd, db_path = tempfile.mkstemp(prefix="fhir-source-", suffix=".sqlite")
            os.close(fd)
            self._owns_file = True
        else:
            self._owns_file = False
        self.db_path = db_path

        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        # This database is a disposable cache, so favour ingest speed over
        # crash durability.
        self._conn.execute("PRAGMA journal_mode = OFF")
        self._conn.execute("PRAGMA synchronous = OFF")
        self._conn.execute("PRAGMA temp_store = MEMORY")
        self._conn.execute(
            "CREATE TABLE IF NOT EXISTS resources ("
            " rtype TEXT NOT NULL,"
            " rid   TEXT NOT NULL,"
            " seq   INTEGER NOT NULL,"
            " body  TEXT NOT NULL)"
        )
        self._summary: Optional[Dict[str, int]] = None
        self._fts_ready = False
        self._sort_indexes: set = set()

    # ------------------------------------------------------------------
    # Ingestion
    # ------------------------------------------------------------------

    def ingest_lines(self, lines: Iterable[bytes], *, max_resources: Optional[int] = None) -> int:
        """Stream NDJSON ``lines`` into the database. Returns the row count."""
        counters: Dict[str, int] = {}
        batch: List[Tuple[str, str, int, str]] = []
        inserted = 0

        for resource in _iter_resources_from_lines(lines):
            rtype = resource["resourceType"]
            seq = counters.get(rtype, 0)
            counters[rtype] = seq + 1

            rid = resource.get("id")
            if not isinstance(rid, str) or not rid:
                rid = f"_idx-{seq}"

            batch.append((rtype, rid, seq, json.dumps(resource, default=str)))
            if len(batch) >= BATCH_SIZE:
                self._flush(batch)
                inserted += len(batch)
                batch = []

            if max_resources is not None and inserted + len(batch) > max_resources:
                raise FhirParseError(
                    f"File contains more than {max_resources} resources."
                )

        if batch:
            self._flush(batch)
            inserted += len(batch)

        if inserted == 0:
            raise FhirParseError("No FHIR resources found in the uploaded file.")

        self._conn.execute("CREATE INDEX IF NOT EXISTS idx_rtype_seq ON resources(rtype, seq)")
        self._conn.execute("CREATE INDEX IF NOT EXISTS idx_rtype_rid ON resources(rtype, rid)")
        self._conn.commit()
        self._summary = None
        self._build_fts()
        logger.info("Streamed %d resources into %s", inserted, self.db_path)
        return inserted

    def _build_fts(self) -> None:
        """Build the full-text index. Degrades to LIKE scans if unavailable."""
        try:
            self._conn.execute(
                "CREATE VIRTUAL TABLE IF NOT EXISTS fts "
                "USING fts5(body, content='resources', content_rowid='rowid')"
            )
            self._conn.execute("INSERT INTO fts(fts) VALUES('rebuild')")
            self._conn.commit()
            self._fts_ready = True
        except sqlite3.Error as exc:
            logger.warning("FTS5 unavailable, falling back to LIKE search: %s", exc)
            self._fts_ready = False

    def _ensure_sort_index(self, jsonpath: str) -> None:
        """Create an expression index for a sort column the first time it is used."""
        if jsonpath in self._sort_indexes:
            return
        name = "idx_sort_" + re.sub(r"[^A-Za-z0-9]", "_", jsonpath)[:60]
        try:
            self._conn.execute(
                f'CREATE INDEX IF NOT EXISTS "{name}" '
                f"ON resources(rtype, json_extract(body, '{jsonpath}'))"
            )
            self._conn.commit()
        except sqlite3.Error as exc:  # pragma: no cover - defensive
            logger.warning("Could not index sort path %s: %s", jsonpath, exc)
        self._sort_indexes.add(jsonpath)

    def _flush(self, batch: List[Tuple[str, str, int, str]]) -> None:
        self._conn.executemany(
            "INSERT INTO resources (rtype, rid, seq, body) VALUES (?, ?, ?, ?)", batch
        )

    # ------------------------------------------------------------------
    # Reads
    # ------------------------------------------------------------------

    def summary(self) -> Dict[str, int]:
        if self._summary is None:
            rows = self._conn.execute(
                "SELECT rtype, COUNT(*) FROM resources GROUP BY rtype"
            ).fetchall()
            self._summary = {r[0]: r[1] for r in rows}
        return dict(self._summary)

    def resource_types(self) -> List[str]:
        return sorted(self.summary().keys())

    def count(self, resource_type: str) -> int:
        return self.summary().get(resource_type, 0)

    def total(self) -> int:
        return sum(self.summary().values())

    def _where(self, resource_type: str, q: Optional[str]) -> Tuple[str, list]:
        """Build the WHERE clause, preferring the FTS index when one exists.

        Returns a clause that always yields no rows when the query text has no
        searchable tokens, so punctuation-only input cannot match everything.
        """
        clause = "WHERE rtype = ?"
        params: list = [resource_type]
        if q and q.strip():
            if self._fts_ready:
                match = build_fts_query(q)
                if match is None:
                    return clause + " AND 0", params
                clause += " AND rowid IN (SELECT rowid FROM fts WHERE fts MATCH ?)"
                params.append(match)
            else:
                clause += " AND body LIKE ? ESCAPE '\\'"
                params.append(f"%{_escape_like(q.strip())}%")
        return clause, params

    def search(
        self,
        resource_type: str,
        *,
        count: int = 50,
        offset: int = 0,
        q: Optional[str] = None,
        sort: Optional[str] = None,
        order: str = "asc",
    ) -> Dict[str, Any]:
        """Return a FHIR searchset Bundle, filtered and sorted in SQL."""
        where, params = self._where(resource_type, q)

        matched = self._conn.execute(
            f"SELECT COUNT(*) FROM resources {where}", params
        ).fetchone()[0]

        offset = max(0, offset)
        count = max(0, count)

        entries: List[Dict[str, Any]] = []
        if count:
            if sort:
                bodies = self._sorted_page(where, params, sort, order, count, offset)
            else:
                bodies = [
                    r[0]
                    for r in self._conn.execute(
                        f"SELECT body FROM resources {where} ORDER BY seq ASC LIMIT ? OFFSET ?",
                        params + [count, offset],
                    ).fetchall()
                ]
            entries = [{"resource": json.loads(b)} for b in bodies]

        bundle: Dict[str, Any] = {
            "resourceType": "Bundle",
            "type": "searchset",
            "total": matched,
            "entry": entries,
            "link": [],
        }
        if offset + count < matched:
            bundle["link"].append({"relation": "next", "offset": offset + count, "count": count})
        if offset > 0:
            bundle["link"].append({"relation": "prev", "offset": max(0, offset - count), "count": count})
        return bundle

    def _sorted_page(
        self, where: str, params: list, sort: str, order: str, count: int, offset: int
    ) -> List[str]:
        """Page through rows ordered by a JSON path, keeping missing values last.

        Rows with a value are ordered by the indexed expression; rows where the
        path is absent follow, ordered by ingest sequence. Splitting the two
        keeps "nulls last" without an ORDER BY term that would defeat the index.
        """
        jp = dotted_to_jsonpath(sort)
        self._ensure_sort_index(jp)
        direction = "DESC" if order == "desc" else "ASC"
        expr = f"json_extract(body, '{jp}')"

        n_valued = self._conn.execute(
            f"SELECT COUNT(*) FROM resources {where} AND {expr} IS NOT NULL", params
        ).fetchone()[0]

        bodies: List[str] = []
        if offset < n_valued:
            take = min(count, n_valued - offset)
            rows = self._conn.execute(
                f"SELECT body FROM resources {where} AND {expr} IS NOT NULL "
                f"ORDER BY {expr} {direction}, seq ASC LIMIT ? OFFSET ?",
                params + [take, offset],
            ).fetchall()
            bodies.extend(r[0] for r in rows)

        # Fill the rest of the page from rows missing this path.
        if len(bodies) < count:
            null_offset = max(0, offset - n_valued)
            rows = self._conn.execute(
                f"SELECT body FROM resources {where} AND {expr} IS NULL "
                f"ORDER BY seq ASC LIMIT ? OFFSET ?",
                params + [count - len(bodies), null_offset],
            ).fetchall()
            bodies.extend(r[0] for r in rows)
        return bodies

    def read(self, resource_type: str, resource_id: str) -> Optional[Dict[str, Any]]:
        """Return one resource by id (first match by ingest order), or None."""
        row = self._conn.execute(
            "SELECT body FROM resources WHERE rtype = ? AND rid = ? ORDER BY seq ASC LIMIT 1",
            (resource_type, resource_id),
        ).fetchone()
        return json.loads(row[0]) if row else None

    def close(self) -> None:
        """Close the connection and delete the backing file if we created it."""
        try:
            self._conn.close()
        except Exception:  # pragma: no cover - defensive
            pass
        if self._owns_file and self.db_path and os.path.exists(self.db_path):
            try:
                os.remove(self.db_path)
            except OSError:  # pragma: no cover - defensive
                logger.warning("Could not remove temp database %s", self.db_path)
