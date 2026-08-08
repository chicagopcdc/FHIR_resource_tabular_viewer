// src/LocalFileViewer.js
// Standalone page: upload a FHIR file and explore it as a table, served by the
// backend /api/sources endpoints. Kept independent of the patient-centric flow
// so it can't destabilize it. Reuses flattenResource/displayValue from api.js
// so the table matches the rest of the app.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Upload, FileJson, Trash2, X, ArrowLeft, Cloud, Download, BarChart3, Link2 as LinkIcon, Tags, Users } from "lucide-react";
import { flattenResource, displayValue } from "./api";
import { readableRow, readableColumns, sortPathFor } from "./fhirDisplay";
import * as sourcesApi from "./services/sourcesApi";

const PAGE_SIZE = 25;
const MAX_COLUMNS = 12; // keep the table readable; full detail is in drill-down
// Files above this size go to the streaming endpoint, which ingests them into a
// disk-backed store instead of memory. That makes a multi-GB NDJSON export
// fully browsable rather than truncated to a preview.
const STREAM_THRESHOLD_BYTES = 20 * 1024 * 1024; // 20 MB

const fmtSize = (bytes) => {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / 1024 / 1024 / 1024).toFixed(1) + " GB";
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + " MB";
  return (bytes / 1024).toFixed(0) + " KB";
};

function LocalFileViewer() {
  const fileInputRef = useRef(null);
  const [source, setSource] = useState(null); // { source_id, summary, resource_types }
  const [activeType, setActiveType] = useState(null);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null); // raw resource for drill-down
  const [preview, setPreview] = useState(null); // set when a large file was streamed to disk
  const [streaming, setStreaming] = useState(null); // { totalBytes } while a large ingest runs
  const [query, setQuery] = useState(""); // applied text filter
  const [sortField, setSortField] = useState(null);
  const [sortOrder, setSortOrder] = useState("asc");
  const [viewMode, setViewMode] = useState("readable"); // "readable" | "raw"
  const [visibleColumns, setVisibleColumns] = useState(null); // null = use defaults
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);
  const [profileData, setProfileData] = useState(null); // dataset profile for activeType
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [linksData, setLinksData] = useState(null); // reference integrity for activeType
  const [linksOpen, setLinksOpen] = useState(false);
  const [linksLoading, setLinksLoading] = useState(false);
  const [termData, setTermData] = useState(null); // code system coverage
  const [termOpen, setTermOpen] = useState(false);
  const [termLoading, setTermLoading] = useState(false);
  const [cohortData, setCohortData] = useState(null); // patient-level pivot
  const [cohortOpen, setCohortOpen] = useState(false);
  const [cohortLoading, setCohortLoading] = useState(false);

  // S3 load form state
  const [s3Open, setS3Open] = useState(false);
  const [s3Uri, setS3Uri] = useState("");
  const [s3Advanced, setS3Advanced] = useState(false);
  const [s3Region, setS3Region] = useState("");
  const [s3Endpoint, setS3Endpoint] = useState("");
  const [s3AccessKey, setS3AccessKey] = useState("");
  const [s3Secret, setS3Secret] = useState("");

  // Core loader: fetch one page for a resource type, carrying the current text
  // filter and sort. All of search / sort / paginate / tab-switch go through it.
  const runQuery = useCallback(
    async (sourceId, resourceType, opts = {}) => {
      const { offset: nextOffset = 0, q = "", sort = null, order = "asc" } = opts;
      setLoading(true);
      setError(null);
      try {
        const bundle = await sourcesApi.searchResources(sourceId, resourceType, {
          count: PAGE_SIZE,
          offset: nextOffset,
          q,
          sort: sort || "",
          order,
        });
        const resources = (bundle.entry || [])
          .map((e) => e.resource)
          .filter(Boolean);
        setRows(resources);
        setTotal(bundle.total || resources.length);
        setOffset(nextOffset);
        setActiveType(resourceType);
        setQuery(q);
        setSortField(sort);
        setSortOrder(order);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Re-run the current type at offset 0 with given overrides (search / sort).
  const applyView = useCallback(
    (overrides) => {
      if (!source || !activeType) return;
      runQuery(source.source_id, activeType, {
        offset: 0,
        q: query,
        sort: sortField,
        order: sortOrder,
        ...overrides,
      });
    },
    [source, activeType, query, sortField, sortOrder, runQuery]
  );

  // Toggle sort on a column: same column flips asc/desc, new column starts asc.
  const handleSort = useCallback(
    (col) => {
      const order = sortField === col && sortOrder === "asc" ? "desc" : "asc";
      applyView({ sort: col, order });
    },
    [sortField, sortOrder, applyView]
  );

  // Shared post-load: adopt source metadata and open its first resource type.
  // `loader` returns the source metadata (from upload or S3).
  const adoptSource = useCallback(
    async (loader) => {
      setLoading(true);
      setError(null);
      setSelected(null);
      try {
        const meta = await loader();
        setSource(meta);
        const firstType = meta.resource_types?.[0];
        if (firstType) {
          await runQuery(meta.source_id, firstType, {});
        } else {
          setRows([]);
          setTotal(0);
          setActiveType(null);
        }
      } catch (e) {
        setError(e.message);
        setSource(null);
      } finally {
        setLoading(false);
      }
    },
    [runQuery]
  );

  const handleUpload = useCallback(
    (file) => {
      if (!file) return;
      setPreview(null);
      setStreaming(null);

      // Small files: parse in memory, which is fastest for the common case.
      if (file.size <= STREAM_THRESHOLD_BYTES) {
        adoptSource(() => sourcesApi.uploadSource(file));
        return;
      }

      // Large files: send the whole file to the streaming endpoint, which
      // ingests it to disk so every resource stays browsable.
      setStreaming({ totalBytes: file.size });
      adoptSource(async () => {
        try {
          const meta = await sourcesApi.uploadSourceStreaming(file);
          setPreview({ streamed: true, totalBytes: file.size, total: meta.total });
          return meta;
        } finally {
          setStreaming(null);
        }
      });
    },
    [adoptSource]
  );

  // Profile the active type: what is populated and which values dominate.
  // Fetched on demand and cleared when the resource type changes.
  const toggleProfile = useCallback(async () => {
    if (profileOpen) {
      setProfileOpen(false);
      return;
    }
    setProfileOpen(true);
    if (profileData || !source || !activeType) return;
    setProfileLoading(true);
    try {
      setProfileData(await sourcesApi.profileResources(source.source_id, activeType));
    } catch (e) {
      setError(e.message);
      setProfileOpen(false);
    } finally {
      setProfileLoading(false);
    }
  }, [profileOpen, profileData, source, activeType]);

  // Where does this type point, and do those links resolve in this dataset?
  const toggleLinks = useCallback(async () => {
    if (linksOpen) {
      setLinksOpen(false);
      return;
    }
    setLinksOpen(true);
    if (linksData || !source || !activeType) return;
    setLinksLoading(true);
    try {
      setLinksData(await sourcesApi.analyzeLinks(source.source_id, activeType));
    } catch (e) {
      setError(e.message);
      setLinksOpen(false);
    } finally {
      setLinksLoading(false);
    }
  }, [linksOpen, linksData, source, activeType]);

  // Which code systems does this type use, and are they standards?
  const toggleTerminology = useCallback(async () => {
    if (termOpen) {
      setTermOpen(false);
      return;
    }
    setTermOpen(true);
    if (termData || !source || !activeType) return;
    setTermLoading(true);
    try {
      setTermData(await sourcesApi.analyzeTerminology(source.source_id, activeType));
    } catch (e) {
      setError(e.message);
      setTermOpen(false);
    } finally {
      setTermLoading(false);
    }
  }, [termOpen, termData, source, activeType]);

  // Pivot the dataset to patients. Source level, so it survives type switches.
  const toggleCohort = useCallback(async () => {
    if (cohortOpen) {
      setCohortOpen(false);
      return;
    }
    setCohortOpen(true);
    if (cohortData || !source) return;
    setCohortLoading(true);
    try {
      setCohortData(await sourcesApi.patientCohort(source.source_id));
    } catch (e) {
      setError(e.message);
      setCohortOpen(false);
    } finally {
      setCohortLoading(false);
    }
  }, [cohortOpen, cohortData, source]);

  // Jump from a reference in the drill-down to the resource it points at.
  const followReference = useCallback(
    async (ref) => {
      if (!source) return;
      const [targetType, targetId] = String(ref).split("/").slice(-2);
      if (!targetType || !targetId) return;
      try {
        const target = await sourcesApi.readResource(source.source_id, targetType, targetId);
        setSelected(target);
      } catch {
        setError(`${ref} is not present in this dataset.`);
      }
    },
    [source]
  );

  // A profile and link map describe one resource type, so drop them on change.
  useEffect(() => {
    setProfileData(null);
    setProfileOpen(false);
    setLinksData(null);
    setLinksOpen(false);
    setTermData(null);
    setTermOpen(false);
  }, [activeType]);

  // Download all matching resources (current filter + sort) as CSV or NDJSON.
  const handleExport = useCallback(
    (format) => {
      if (!source || !activeType) return;
      const url = sourcesApi.exportUrl(source.source_id, activeType, {
        format,
        q: query,
        sort: sortField,
        order: sortOrder,
      });
      const a = document.createElement("a");
      a.href = url;
      a.download = `${activeType}.${format === "ndjson" ? "ndjson" : "csv"}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    },
    [source, activeType, query, sortField, sortOrder]
  );

  const handleS3Load = useCallback(() => {
    if (!s3Uri.trim()) {
      setError("Enter an s3://bucket/key URI.");
      return;
    }
    const body = { uri: s3Uri.trim() };
    if (s3Advanced) {
      if (s3Region.trim()) body.region = s3Region.trim();
      if (s3Endpoint.trim()) body.endpoint_url = s3Endpoint.trim();
      if (s3AccessKey.trim()) body.access_key_id = s3AccessKey.trim();
      if (s3Secret.trim()) body.secret_access_key = s3Secret.trim();
    }
    adoptSource(() => sourcesApi.loadS3Source(body));
  }, [adoptSource, s3Uri, s3Advanced, s3Region, s3Endpoint, s3AccessKey, s3Secret]);

  const handleUnload = useCallback(async () => {
    if (source) {
      try {
        await sourcesApi.deleteSource(source.source_id);
      } catch {
        /* ignore, unloading is best-effort */
      }
    }
    setSource(null);
    setActiveType(null);
    setRows([]);
    setTotal(0);
    setOffset(0);
    setSelected(null);
    setError(null);
    setPreview(null);
    setStreaming(null);
    setQuery("");
    setSortField(null);
    setSortOrder("asc");
    // The cohort describes the whole source, so it only resets on unload.
    setCohortData(null);
    setCohortOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [source]);

  // Every candidate column for the current rows and mode (full, uncapped).
  // Readable mode: curated FHIR labels. Raw mode: all dotted paths.
  const allColumns = useMemo(() => {
    if (viewMode === "readable") return readableColumns(rows, 1000);
    const freq = {};
    rows.forEach((r) => {
      Object.keys(flattenResource(r)).forEach((k) => {
        freq[k] = (freq[k] || 0) + 1;
      });
    });
    const keys = Object.keys(freq);
    const essential = ["id", "resourceType", "status", "code.text", "code.coding[0].display"];
    return [
      ...essential.filter((k) => keys.includes(k)),
      ...keys
        .filter((k) => !essential.includes(k))
        .sort((a, b) => freq[b] - freq[a]),
    ];
  }, [rows, viewMode]);

  // Default subset shown before the user customizes visibility.
  const defaultColumns = useMemo(
    () => allColumns.slice(0, viewMode === "readable" ? 14 : MAX_COLUMNS),
    [allColumns, viewMode]
  );

  // Reset any custom visibility when the type or view mode changes.
  useEffect(() => {
    setVisibleColumns(null);
  }, [activeType, viewMode]);

  const columns = visibleColumns ?? defaultColumns;

  const toggleColumn = useCallback(
    (col) => {
      const base = new Set(visibleColumns ?? defaultColumns);
      if (base.has(col)) base.delete(col);
      else base.add(col);
      // Keep the selection ordered like allColumns.
      setVisibleColumns(allColumns.filter((c) => base.has(c)));
    },
    [visibleColumns, defaultColumns, allColumns]
  );

  const resetColumns = useCallback(() => setVisibleColumns(null), []);

  // References inside the open resource, so the drill-down can walk the graph.
  const selectedRefs = useMemo(() => {
    const found = [];
    const walk = (node, path, depth) => {
      if (!node || typeof node !== "object" || depth > 8) return;
      if (Array.isArray(node)) {
        node.forEach((item) => walk(item, path, depth + 1));
        return;
      }
      if (typeof node.reference === "string" && path) {
        const ref = node.reference.trim();
        // Contained and bundle-local references are not addressable by id.
        if (ref && !ref.startsWith("#") && !ref.startsWith("urn:")) {
          found.push({ path, ref });
        }
      }
      Object.entries(node).forEach(([key, value]) => {
        if (key === "reference") return;
        walk(value, path ? `${path}.${key}` : key, depth + 1);
      });
    };
    walk(selected, "", 0);
    // De-duplicate repeated targets so the strip stays short.
    const seen = new Set();
    return found.filter(({ path, ref }) => {
      const key = `${path}:${ref}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [selected]);

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div style={{ padding: "1.5rem", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
        <Link to="/" style={{ display: "flex", alignItems: "center", gap: 4, color: "#007bff", textDecoration: "none" }}>
          <ArrowLeft size={16} /> Back
        </Link>
        <h1 style={{ fontSize: "1.4rem", fontWeight: 600, margin: 0, color: "#333" }}>
          File & S3 Viewer
        </h1>
      </div>
      <p style={{ color: "#666", marginTop: 0 }}>
        Load a FHIR resource, Bundle, JSON array, or NDJSON from a local file or an S3 object, and explore it as a table.
      </p>

      {/* Upload control */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleUpload(e.dataTransfer.files?.[0]);
        }}
        style={{
          border: "2px dashed #ccc",
          borderRadius: 8,
          padding: "1.5rem",
          textAlign: "center",
          background: "#fafafa",
          marginBottom: "1.5rem",
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.ndjson,application/json,application/fhir+json"
          style={{ display: "none" }}
          onChange={(e) => handleUpload(e.target.files?.[0])}
        />
        <Upload size={28} color="#888" />
        <div style={{ margin: "0.5rem 0", color: "#555" }}>
          Drag & drop a file here, or
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          style={{
            background: "#007bff", color: "white", border: "none",
            padding: "0.5rem 1.25rem", borderRadius: 4, cursor: "pointer", fontWeight: 500,
          }}
        >
          Choose file
        </button>
      </div>

      {/* S3 load */}
      <div style={{ border: "1px solid #e0e0e0", borderRadius: 8, marginBottom: "1.5rem" }}>
        <button
          onClick={() => setS3Open((v) => !v)}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 8, background: "none",
            border: "none", padding: "0.9rem 1rem", cursor: "pointer", fontWeight: 500, color: "#333",
          }}
        >
          <Cloud size={18} color="#007bff" />
          Load from Amazon S3
          <span style={{ marginLeft: "auto", color: "#888" }}>{s3Open ? "▲" : "▼"}</span>
        </button>
        {s3Open && (
          <div style={{ padding: "0 1rem 1rem", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                value={s3Uri}
                onChange={(e) => setS3Uri(e.target.value)}
                placeholder="s3://my-bucket/path/to/data.json"
                onKeyDown={(e) => e.key === "Enter" && handleS3Load()}
                style={{ flex: 1, padding: "0.5rem", border: "1px solid #ccc", borderRadius: 4, fontSize: "0.9rem" }}
              />
              <button
                onClick={handleS3Load}
                style={{ background: "#007bff", color: "white", border: "none", padding: "0.5rem 1.25rem", borderRadius: 4, cursor: "pointer", fontWeight: 500 }}
              >
                Load
              </button>
            </div>
            <button
              onClick={() => setS3Advanced((v) => !v)}
              style={{ alignSelf: "flex-start", background: "none", border: "none", color: "#007bff", cursor: "pointer", fontSize: "0.8rem", padding: 0 }}
            >
              {s3Advanced ? "Hide" : "Show"} connection options
            </button>
            {s3Advanced && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  ["Region (optional)", s3Region, setS3Region, "text"],
                  ["Endpoint URL (optional, e.g. MinIO)", s3Endpoint, setS3Endpoint, "text"],
                  ["Access key ID (optional)", s3AccessKey, setS3AccessKey, "text"],
                  ["Secret access key (optional)", s3Secret, setS3Secret, "password"],
                ].map(([ph, val, setter, type]) => (
                  <input
                    key={ph}
                    type={type}
                    value={val}
                    onChange={(e) => setter(e.target.value)}
                    placeholder={ph}
                    style={{ padding: "0.5rem", border: "1px solid #ccc", borderRadius: 4, fontSize: "0.85rem" }}
                  />
                ))}
              </div>
            )}
            <div style={{ fontSize: "0.75rem", color: "#888" }}>
              Credentials are optional. The server falls back to its default AWS credential chain.
            </div>
          </div>
        )}
      </div>

      {error && (
        <div style={{ background: "#f8d7da", color: "#842029", padding: "0.75rem 1rem", borderRadius: 4, marginBottom: "1rem" }}>
          {error}
        </div>
      )}

      {/* Loaded source summary + resource-type tabs */}
      {source && (
        <div style={{ marginBottom: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#333" }}>
              <FileJson size={18} color="#007bff" />
              <strong>{source.name}</strong>
              <span style={{ color: "#888" }}>· {source.total} resources · {source.resource_types?.length} types</span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={toggleCohort}
                title="Regroup the whole dataset by patient"
                style={{
                  display: "flex", alignItems: "center", gap: 4, borderRadius: 4, cursor: "pointer", fontSize: "0.85rem",
                  padding: "0.4rem 0.8rem",
                  border: cohortOpen ? "1px solid #007bff" : "1px solid #dee2e6",
                  background: cohortOpen ? "#007bff" : "#f8f9fa",
                  color: cohortOpen ? "white" : "#555",
                }}
              >
                <Users size={14} /> Patients
              </button>
              <button
                onClick={handleUnload}
                style={{ display: "flex", alignItems: "center", gap: 4, background: "#f8f9fa", border: "1px solid #dee2e6", color: "#dc3545", padding: "0.4rem 0.8rem", borderRadius: 4, cursor: "pointer" }}
              >
                <Trash2 size={14} /> Unload
              </button>
            </div>
          </div>
          {preview && (
            <div style={{ background: "#d1e7dd", color: "#0a3622", border: "1px solid #a3cfbb", padding: "0.6rem 0.9rem", borderRadius: 4, marginBottom: "0.75rem", fontSize: "0.85rem" }}>
              Streamed all {source.total.toLocaleString()} resources from {fmtSize(preview.totalBytes)} to a
              disk-backed index. Search and sort run across the whole file.
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {source.resource_types?.map((rt) => (
              <button
                key={rt}
                onClick={() => runQuery(source.source_id, rt, {})}
                style={{
                  padding: "0.35rem 0.75rem", borderRadius: 16, cursor: "pointer", fontSize: "0.85rem",
                  border: rt === activeType ? "1px solid #007bff" : "1px solid #dee2e6",
                  background: rt === activeType ? "#007bff" : "white",
                  color: rt === activeType ? "white" : "#333",
                }}
              >
                {rt} <span style={{ opacity: 0.7 }}>({source.summary?.[rt] ?? 0})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search + result count (runs across all resources of the active type) */}
      {source && activeType && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "0.75rem" }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyView({})}
            placeholder={`Search ${activeType}...`}
            style={{ flex: "0 1 320px", padding: "0.45rem 0.6rem", border: "1px solid #ccc", borderRadius: 4, fontSize: "0.85rem" }}
          />
          <button
            onClick={() => applyView({})}
            style={{ background: "#007bff", color: "white", border: "none", padding: "0.45rem 1rem", borderRadius: 4, cursor: "pointer", fontSize: "0.85rem" }}
          >
            Search
          </button>
          {query && (
            <button
              onClick={() => { setQuery(""); applyView({ q: "" }); }}
              style={{ background: "#f8f9fa", border: "1px solid #dee2e6", color: "#555", padding: "0.45rem 0.9rem", borderRadius: 4, cursor: "pointer", fontSize: "0.85rem" }}
            >
              Clear
            </button>
          )}
          <div style={{ display: "flex", border: "1px solid #dee2e6", borderRadius: 4, overflow: "hidden" }} title="Readable formats FHIR datatypes; Raw shows dotted paths">
            {["readable", "raw"].map((m) => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                style={{
                  border: "none", padding: "0.45rem 0.8rem", cursor: "pointer", fontSize: "0.8rem",
                  background: viewMode === m ? "#007bff" : "white",
                  color: viewMode === m ? "white" : "#555",
                }}
              >
                {m === "readable" ? "Readable" : "Raw paths"}
              </button>
            ))}
          </div>
          {allColumns.length > 0 && (
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setColumnsMenuOpen((v) => !v)}
                style={{ background: "white", border: "1px solid #dee2e6", color: "#555", padding: "0.45rem 0.8rem", borderRadius: 4, cursor: "pointer", fontSize: "0.8rem" }}
              >
                Columns ({columns.length}/{allColumns.length}) {columnsMenuOpen ? "▲" : "▼"}
              </button>
              {columnsMenuOpen && (
                <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 50, background: "white", border: "1px solid #dee2e6", borderRadius: 6, boxShadow: "0 4px 12px rgba(0,0,0,0.12)", padding: "0.5rem", width: 300, maxHeight: 340, overflowY: "auto" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.25rem 0.25rem 0.5rem", borderBottom: "1px solid #eee", marginBottom: 4 }}>
                    <strong style={{ fontSize: "0.8rem", color: "#333" }}>Show columns</strong>
                    <button onClick={resetColumns} style={{ background: "none", border: "none", color: "#007bff", cursor: "pointer", fontSize: "0.75rem" }}>
                      Reset
                    </button>
                  </div>
                  {allColumns.map((c) => (
                    <label key={c} style={{ display: "flex", alignItems: "center", gap: 6, padding: "0.25rem", fontSize: "0.8rem", color: "#333", cursor: "pointer" }}>
                      <input type="checkbox" checked={columns.includes(c)} onChange={() => toggleColumn(c)} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
          <button
            onClick={toggleProfile}
            title="Show what is populated in this resource type"
            style={{
              display: "flex", alignItems: "center", gap: 4, borderRadius: 4, cursor: "pointer", fontSize: "0.8rem",
              padding: "0.45rem 0.8rem",
              border: profileOpen ? "1px solid #007bff" : "1px solid #dee2e6",
              background: profileOpen ? "#007bff" : "white",
              color: profileOpen ? "white" : "#555",
            }}
          >
            <BarChart3 size={14} /> Profile
          </button>
          <button
            onClick={toggleLinks}
            title="Check whether this type's references resolve inside the dataset"
            style={{
              display: "flex", alignItems: "center", gap: 4, borderRadius: 4, cursor: "pointer", fontSize: "0.8rem",
              padding: "0.45rem 0.8rem",
              border: linksOpen ? "1px solid #007bff" : "1px solid #dee2e6",
              background: linksOpen ? "#007bff" : "white",
              color: linksOpen ? "white" : "#555",
            }}
          >
            <LinkIcon size={14} /> Links
          </button>
          <button
            onClick={toggleTerminology}
            title="Which code systems this data uses, and whether they are standards"
            style={{
              display: "flex", alignItems: "center", gap: 4, borderRadius: 4, cursor: "pointer", fontSize: "0.8rem",
              padding: "0.45rem 0.8rem",
              border: termOpen ? "1px solid #007bff" : "1px solid #dee2e6",
              background: termOpen ? "#007bff" : "white",
              color: termOpen ? "white" : "#555",
            }}
          >
            <Tags size={14} /> Codes
          </button>
          <span style={{ marginLeft: "auto", color: "#888", fontSize: "0.85rem" }}>
            {total.toLocaleString()} {query ? "matches" : "resources"}
            {sortField ? ` · sorted by ${sortField} (${sortOrder})` : ""}
          </span>
          {total > 0 && (
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => handleExport("csv")}
                title="Download all matching resources as CSV"
                style={{ display: "flex", alignItems: "center", gap: 4, background: "white", border: "1px solid #dee2e6", color: "#007bff", padding: "0.45rem 0.75rem", borderRadius: 4, cursor: "pointer", fontSize: "0.8rem" }}
              >
                <Download size={14} /> CSV
              </button>
              <button
                onClick={() => handleExport("ndjson")}
                title="Download all matching resources as NDJSON"
                style={{ display: "flex", alignItems: "center", gap: 4, background: "white", border: "1px solid #dee2e6", color: "#007bff", padding: "0.45rem 0.75rem", borderRadius: 4, cursor: "pointer", fontSize: "0.8rem" }}
              >
                <Download size={14} /> JSON
              </button>
            </div>
          )}
        </div>
      )}

      {loading && (
        <div style={{ color: "#666", padding: "1rem 0" }}>
          {streaming
            ? `Streaming ${fmtSize(streaming.totalBytes)} to a disk-backed index. Large files take a moment, and the whole file stays searchable.`
            : "Loading…"}
        </div>
      )}

      {/* Dataset profile: completeness and dominant values per column */}
      {profileOpen && (
        <div style={{ border: "1px solid #e0e0e0", borderRadius: 6, marginBottom: "0.75rem", overflow: "hidden" }}>
          <div style={{ background: "#f8f9fa", padding: "0.6rem 0.9rem", borderBottom: "1px solid #e0e0e0", fontSize: "0.85rem", color: "#333" }}>
            <strong>Dataset profile</strong>
            {profileData && (
              <span style={{ color: "#888" }}>
                {" "}across {profileData.total.toLocaleString()} {profileData.resourceType} resources
              </span>
            )}
          </div>
          {profileLoading && <div style={{ padding: "1rem", color: "#666", fontSize: "0.85rem" }}>Profiling...</div>}
          {!profileLoading && profileData && (
            <div style={{ maxHeight: 340, overflowY: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.8rem" }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "#666" }}>
                    <th style={{ padding: "0.4rem 0.9rem", fontWeight: 500 }}>Field</th>
                    <th style={{ padding: "0.4rem 0.5rem", fontWeight: 500, width: 190 }}>Populated</th>
                    <th style={{ padding: "0.4rem 0.5rem", fontWeight: 500, width: 90 }}>Distinct</th>
                    <th style={{ padding: "0.4rem 0.9rem", fontWeight: 500 }}>Most common values</th>
                  </tr>
                </thead>
                <tbody>
                  {profileData.columns.map((c) => {
                    const pct = Math.round(c.completeness * 100);
                    return (
                      <tr key={c.path} style={{ borderTop: "1px solid #f0f0f0" }}>
                        <td style={{ padding: "0.4rem 0.9rem", whiteSpace: "nowrap", color: "#333" }}>{c.path}</td>
                        <td style={{ padding: "0.4rem 0.5rem" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{ flex: 1, height: 6, background: "#eee", borderRadius: 3, overflow: "hidden" }}>
                              <div style={{ width: `${pct}%`, height: "100%", background: pct === 100 ? "#28a745" : pct >= 50 ? "#007bff" : "#ffc107" }} />
                            </div>
                            <span style={{ color: "#666", width: 34, textAlign: "right" }}>{pct}%</span>
                          </div>
                        </td>
                        <td style={{ padding: "0.4rem 0.5rem", color: "#666" }}>{c.distinct.toLocaleString()}</td>
                        <td style={{ padding: "0.4rem 0.9rem" }}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {c.populated === 0 ? (
                              <span style={{ color: "#aaa" }}>none</span>
                            ) : c.distinct === c.populated && c.populated > 1 ? (
                              // Every resource has its own value, so listing a few
                              // says nothing. That it is unique is the finding.
                              <span style={{ color: "#888", fontStyle: "italic" }}>unique per resource</span>
                            ) : (
                              c.top_values.slice(0, 3).map((tv) => (
                                <span key={tv.value} title={`${tv.value} (${tv.count.toLocaleString()})`} style={{ background: "#f1f5f9", borderRadius: 10, padding: "0.1rem 0.5rem", color: "#334155", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {tv.value} <span style={{ color: "#94a3b8" }}>{tv.count.toLocaleString()}</span>
                                </span>
                              ))
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Cohort: the dataset seen as patients rather than resources */}
      {cohortOpen && (
        <div style={{ border: "1px solid #e0e0e0", borderRadius: 6, marginBottom: "0.75rem", overflow: "hidden" }}>
          <div style={{ background: "#f8f9fa", padding: "0.6rem 0.9rem", borderBottom: "1px solid #e0e0e0", fontSize: "0.85rem", color: "#333" }}>
            <strong>Patients</strong>
            {cohortData && (
              <span style={{ color: "#888" }}>
                {" "}{cohortData.total_patients.toLocaleString()} in this dataset
                {cohortData.patients_referenced_only > 0 && (
                  <span style={{ color: "#b45309" }}>
                    {" "}({cohortData.patients_referenced_only.toLocaleString()} referenced but not present)
                  </span>
                )}
              </span>
            )}
          </div>
          {cohortLoading && <div style={{ padding: "1rem", color: "#666", fontSize: "0.85rem" }}>Grouping by patient...</div>}
          {!cohortLoading && cohortData && cohortData.total_patients === 0 && (
            <div style={{ padding: "1rem", color: "#666", fontSize: "0.85rem" }}>
              No resources in this dataset reference a patient.
              {Object.keys(cohortData.unlinked || {}).length > 0 && (
                <> Unlinked: {Object.entries(cohortData.unlinked).map(([t, n]) => `${t} (${n.toLocaleString()})`).join(", ")}.</>
              )}
            </div>
          )}
          {!cohortLoading && cohortData && cohortData.total_patients > 0 && (
            <div style={{ maxHeight: 320, overflowY: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.8rem" }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "#666" }}>
                    <th style={{ padding: "0.4rem 0.9rem", fontWeight: 500 }}>Patient</th>
                    <th style={{ padding: "0.4rem 0.5rem", fontWeight: 500 }}>Total</th>
                    {cohortData.resource_types.map((t) => (
                      <th key={t} style={{ padding: "0.4rem 0.5rem", fontWeight: 500 }}>{t}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cohortData.patients.map((p) => (
                    <tr
                      key={p.patient_id}
                      onClick={() => p.present && followReference(p.reference)}
                      style={{ borderTop: "1px solid #f0f0f0", cursor: p.present ? "pointer" : "default" }}
                      onMouseEnter={(e) => p.present && (e.currentTarget.style.background = "#f6faff")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "white")}
                    >
                      <td style={{ padding: "0.4rem 0.9rem", whiteSpace: "nowrap", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis" }}>
                        <span style={{ color: p.present ? "#1d4ed8" : "#94a3b8" }}>{p.reference}</span>
                        {!p.present && (
                          <span style={{ marginLeft: 6, color: "#b45309", background: "#fef3c7", borderRadius: 8, padding: "0 0.4rem" }}>
                            not in file
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "0.4rem 0.5rem", color: "#333", fontWeight: 500 }}>{p.total.toLocaleString()}</td>
                      {cohortData.resource_types.map((t) => (
                        <td key={t} style={{ padding: "0.4rem 0.5rem", color: p.counts[t] ? "#666" : "#ddd" }}>
                          {(p.counts[t] || 0).toLocaleString()}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {cohortData.truncated && (
                <div style={{ padding: "0.5rem 0.9rem", color: "#888", fontSize: "0.75rem", borderTop: "1px solid #f0f0f0" }}>
                  Showing the first {cohortData.patients.length.toLocaleString()} patients by data volume.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Terminology: which code systems this data speaks */}
      {termOpen && (
        <div style={{ border: "1px solid #e0e0e0", borderRadius: 6, marginBottom: "0.75rem", overflow: "hidden" }}>
          <div style={{ background: "#f8f9fa", padding: "0.6rem 0.9rem", borderBottom: "1px solid #e0e0e0", fontSize: "0.85rem", color: "#333" }}>
            <strong>Code systems</strong>
            {termData && (
              <span style={{ color: "#888" }}>
                {" "}from {termData.analyzed.toLocaleString()} {termData.resourceType} resources
                {termData.sampled ? " (sampled)" : ""}
              </span>
            )}
          </div>
          {termLoading && <div style={{ padding: "1rem", color: "#666", fontSize: "0.85rem" }}>Analyzing codes...</div>}
          {!termLoading && termData && termData.total_codings === 0 && (
            <div style={{ padding: "1rem", color: "#666", fontSize: "0.85rem" }}>
              This resource type carries no coded concepts.
            </div>
          )}
          {!termLoading && termData && termData.total_codings > 0 && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "0.7rem 0.9rem", borderBottom: "1px solid #f0f0f0", fontSize: "0.8rem", flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "#666" }}>In recognized standards</span>
                  <div style={{ width: 140, height: 8, background: "#eee", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: `${Math.round(termData.standard_share * 100)}%`, height: "100%", background: termData.standard_share >= 0.9 ? "#28a745" : termData.standard_share >= 0.5 ? "#ffc107" : "#dc3545" }} />
                  </div>
                  <strong style={{ color: "#333" }}>{Math.round(termData.standard_share * 100)}%</strong>
                </div>
                <span style={{ color: "#666" }}>
                  {termData.local_codings.toLocaleString()} local of {termData.total_codings.toLocaleString()} codings
                </span>
                {termData.text_only_concepts > 0 && (
                  <span style={{ color: "#b45309", background: "#fef3c7", borderRadius: 10, padding: "0.1rem 0.5rem" }}>
                    {termData.text_only_concepts.toLocaleString()} text only, no code
                  </span>
                )}
                {termData.codings_without_system > 0 && (
                  <span style={{ color: "#b91c1c", background: "#fee2e2", borderRadius: 10, padding: "0.1rem 0.5rem" }}>
                    {termData.codings_without_system.toLocaleString()} with no system
                  </span>
                )}
              </div>
              <div style={{ maxHeight: 260, overflowY: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.8rem" }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "#666" }}>
                      <th style={{ padding: "0.4rem 0.9rem", fontWeight: 500 }}>System</th>
                      <th style={{ padding: "0.4rem 0.5rem", fontWeight: 500 }}>Codings</th>
                      <th style={{ padding: "0.4rem 0.5rem", fontWeight: 500 }}>Distinct</th>
                      <th style={{ padding: "0.4rem 0.5rem", fontWeight: 500 }}>Used at</th>
                      <th style={{ padding: "0.4rem 0.9rem", fontWeight: 500 }}>Examples</th>
                    </tr>
                  </thead>
                  <tbody>
                    {termData.systems.map((s) => (
                      <tr key={s.system} style={{ borderTop: "1px solid #f0f0f0" }}>
                        <td style={{ padding: "0.4rem 0.9rem", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={s.uri || s.system}>
                          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", marginRight: 6, background: s.recognized ? "#28a745" : "#dc3545" }} />
                          <strong style={{ color: "#333" }}>{s.system}</strong>
                          {!s.recognized && <span style={{ color: "#b91c1c", marginLeft: 6 }}>local</span>}
                        </td>
                        <td style={{ padding: "0.4rem 0.5rem", color: "#666" }}>{s.codings.toLocaleString()}</td>
                        <td style={{ padding: "0.4rem 0.5rem", color: "#666" }}>{s.distinct_codes.toLocaleString()}</td>
                        <td style={{ padding: "0.4rem 0.5rem", color: "#666", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.paths.join(", ")}</td>
                        <td style={{ padding: "0.4rem 0.9rem", color: "#94a3b8", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.examples.join(", ") || "none"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Reference integrity: where this type points, and what resolves */}
      {linksOpen && (
        <div style={{ border: "1px solid #e0e0e0", borderRadius: 6, marginBottom: "0.75rem", overflow: "hidden" }}>
          <div style={{ background: "#f8f9fa", padding: "0.6rem 0.9rem", borderBottom: "1px solid #e0e0e0", fontSize: "0.85rem", color: "#333" }}>
            <strong>References</strong>
            {linksData && (
              <span style={{ color: "#888" }}>
                {" "}from {linksData.analyzed.toLocaleString()} {linksData.resourceType} resources
                {linksData.sampled ? " (sampled)" : ""}
              </span>
            )}
          </div>
          {linksLoading && <div style={{ padding: "1rem", color: "#666", fontSize: "0.85rem" }}>Checking references...</div>}
          {!linksLoading && linksData && linksData.links.length === 0 && (
            <div style={{ padding: "1rem", color: "#666", fontSize: "0.85rem" }}>
              This resource type has no references to other resources.
            </div>
          )}
          {!linksLoading && linksData && linksData.links.length > 0 && (
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.8rem" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#666" }}>
                  <th style={{ padding: "0.4rem 0.9rem", fontWeight: 500 }}>Link</th>
                  <th style={{ padding: "0.4rem 0.5rem", fontWeight: 500 }}>References</th>
                  <th style={{ padding: "0.4rem 0.5rem", fontWeight: 500 }}>Targets</th>
                  <th style={{ padding: "0.4rem 0.5rem", fontWeight: 500, width: 200 }}>Found in dataset</th>
                  <th style={{ padding: "0.4rem 0.9rem", fontWeight: 500 }}>Missing examples</th>
                </tr>
              </thead>
              <tbody>
                {linksData.links.map((l) => {
                  const pct = Math.round(l.resolution * 100);
                  return (
                    <tr key={`${l.path}->${l.target_type}`} style={{ borderTop: "1px solid #f0f0f0" }}>
                      <td style={{ padding: "0.4rem 0.9rem", whiteSpace: "nowrap", color: "#333" }}>
                        {l.path} <span style={{ color: "#94a3b8" }}>to</span>{" "}
                        <strong style={{ color: "#334155" }}>{l.target_type}</strong>
                      </td>
                      <td style={{ padding: "0.4rem 0.5rem", color: "#666" }}>{l.references.toLocaleString()}</td>
                      <td style={{ padding: "0.4rem 0.5rem", color: "#666" }}>{l.distinct_targets.toLocaleString()}</td>
                      <td style={{ padding: "0.4rem 0.5rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ flex: 1, height: 6, background: "#eee", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ width: `${pct}%`, height: "100%", background: pct === 100 ? "#28a745" : pct > 0 ? "#ffc107" : "#dc3545" }} />
                          </div>
                          <span style={{ color: "#666", width: 34, textAlign: "right" }}>{pct}%</span>
                        </div>
                      </td>
                      <td style={{ padding: "0.4rem 0.9rem", color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260 }}>
                        {l.dangling_examples.length ? l.dangling_examples.join(", ") : "none"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Table */}
      {!loading && source && activeType && rows.length > 0 && (
        <>
          <div style={{ overflowX: "auto", border: "1px solid #e0e0e0", borderRadius: 6 }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ background: "#f8f9fa", textAlign: "left" }}>
                  {columns.map((c) => {
                    const sp = viewMode === "readable" ? sortPathFor(c, rows[0]) : c;
                    const active = sortField === sp;
                    return (
                      <th
                        key={c}
                        onClick={() => handleSort(sp)}
                        title="Sort by this column"
                        style={{ padding: "0.5rem 0.75rem", borderBottom: "2px solid #e0e0e0", whiteSpace: "nowrap", color: active ? "#007bff" : "#444", cursor: "pointer", userSelect: "none" }}
                      >
                        {c}
                        {active ? (sortOrder === "asc" ? " ▲" : " ▼") : ""}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const cells = viewMode === "readable" ? readableRow(r) : flattenResource(r);
                  return (
                    <tr
                      key={r.id || i}
                      onClick={() => setSelected(r)}
                      style={{ cursor: "pointer", borderBottom: "1px solid #f0f0f0" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#f6faff")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "white")}
                    >
                      {columns.map((c) => (
                        <td key={c} style={{ padding: "0.5rem 0.75rem", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {displayValue(cells[c], "-")}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "0.75rem", color: "#555", fontSize: "0.85rem" }}>
            <span>
              {offset + 1} to {Math.min(offset + rows.length, total)} of {total}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                disabled={offset === 0}
                onClick={() => runQuery(source.source_id, activeType, { offset: Math.max(0, offset - PAGE_SIZE), q: query, sort: sortField, order: sortOrder })}
                style={pagerBtn(offset === 0)}
              >
                Previous
              </button>
              <span style={{ alignSelf: "center" }}>Page {page} / {pageCount}</span>
              <button
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => runQuery(source.source_id, activeType, { offset: offset + PAGE_SIZE, q: query, sort: sortField, order: sortOrder })}
                style={pagerBtn(offset + PAGE_SIZE >= total)}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {!loading && source && activeType && rows.length === 0 && (
        <div style={{ color: "#666", padding: "1rem 0" }}>
          {query
            ? `No ${activeType} resources match "${query}".`
            : `No ${activeType} resources in this file.`}
        </div>
      )}

      {/* Drill-down drawer */}
      {selected && (
        <div
          onClick={() => setSelected(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1000 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed", top: 0, right: 0, height: "100%", width: "min(560px, 90vw)",
              background: "white", boxShadow: "-2px 0 12px rgba(0,0,0,0.15)", padding: "1.25rem",
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <strong style={{ color: "#333" }}>
                {selected.resourceType}/{selected.id || "(no id)"}
              </strong>
              <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", cursor: "pointer" }}>
                <X size={20} color="#666" />
              </button>
            </div>
            {selectedRefs.length > 0 && (
              <div style={{ marginBottom: "0.75rem" }}>
                <div style={{ fontSize: "0.75rem", color: "#888", marginBottom: 4 }}>
                  Referenced resources (click to follow)
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {selectedRefs.map(({ path, ref }) => (
                    <button
                      key={`${path}:${ref}`}
                      onClick={() => followReference(ref)}
                      title={`Open ${ref}`}
                      style={{ display: "flex", alignItems: "center", gap: 4, background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1d4ed8", borderRadius: 12, padding: "0.2rem 0.6rem", cursor: "pointer", fontSize: "0.75rem" }}
                    >
                      <LinkIcon size={12} />
                      <span style={{ color: "#64748b" }}>{path}:</span> {ref}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <pre
              style={{
                background: "#0d1117", color: "#c9d1d9", padding: "1rem", borderRadius: 6,
                fontSize: "0.8rem", lineHeight: 1.5, overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word",
              }}
            >
              {JSON.stringify(selected, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function pagerBtn(disabled) {
  return {
    padding: "0.35rem 0.9rem",
    borderRadius: 4,
    border: "1px solid #dee2e6",
    background: disabled ? "#f8f9fa" : "white",
    color: disabled ? "#aaa" : "#007bff",
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

export default LocalFileViewer;
