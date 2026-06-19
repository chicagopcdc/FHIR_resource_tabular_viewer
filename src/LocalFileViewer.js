// src/LocalFileViewer.js
// Standalone page: upload a FHIR file and explore it as a table, served by the
// backend /api/sources endpoints. Kept independent of the patient-centric flow
// so it can't destabilize it. Reuses flattenResource/displayValue from api.js
// so the table matches the rest of the app.
import React, { useCallback, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Upload, FileJson, Trash2, X, ArrowLeft } from "lucide-react";
import { flattenResource, displayValue } from "./api";
import * as sourcesApi from "./services/sourcesApi";

const PAGE_SIZE = 25;
const MAX_COLUMNS = 12; // keep the table readable; full detail is in drill-down

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

  const loadType = useCallback(
    async (sourceId, resourceType, nextOffset = 0) => {
      setLoading(true);
      setError(null);
      try {
        const bundle = await sourcesApi.searchResources(sourceId, resourceType, {
          count: PAGE_SIZE,
          offset: nextOffset,
        });
        const resources = (bundle.entry || [])
          .map((e) => e.resource)
          .filter(Boolean);
        setRows(resources);
        setTotal(bundle.total || resources.length);
        setOffset(nextOffset);
        setActiveType(resourceType);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const handleUpload = useCallback(
    async (file) => {
      if (!file) return;
      setLoading(true);
      setError(null);
      setSelected(null);
      try {
        const meta = await sourcesApi.uploadSource(file);
        setSource(meta);
        const firstType = meta.resource_types?.[0];
        if (firstType) {
          await loadType(meta.source_id, firstType, 0);
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
    [loadType]
  );

  const handleUnload = useCallback(async () => {
    if (source) {
      try {
        await sourcesApi.deleteSource(source.source_id);
      } catch {
        /* ignore — unloading is best-effort */
      }
    }
    setSource(null);
    setActiveType(null);
    setRows([]);
    setTotal(0);
    setOffset(0);
    setSelected(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [source]);

  // Columns derived from the current page of rows (consistent with app helpers).
  const columns = useMemo(() => {
    const freq = {};
    rows.forEach((r) => {
      Object.keys(flattenResource(r)).forEach((k) => {
        freq[k] = (freq[k] || 0) + 1;
      });
    });
    const keys = Object.keys(freq);
    const essential = ["id", "resourceType", "status", "code.text", "code.coding[0].display"];
    const ordered = [
      ...essential.filter((k) => keys.includes(k)),
      ...keys
        .filter((k) => !essential.includes(k))
        .sort((a, b) => freq[b] - freq[a]),
    ];
    return ordered.slice(0, MAX_COLUMNS);
  }, [rows]);

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div style={{ padding: "1.5rem", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
        <Link to="/" style={{ display: "flex", alignItems: "center", gap: 4, color: "#007bff", textDecoration: "none" }}>
          <ArrowLeft size={16} /> Back
        </Link>
        <h1 style={{ fontSize: "1.4rem", fontWeight: 600, margin: 0, color: "#333" }}>
          Local File Viewer
        </h1>
      </div>
      <p style={{ color: "#666", marginTop: 0 }}>
        Upload a FHIR resource, Bundle, JSON array, or NDJSON file to explore it as a table.
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
            <button
              onClick={handleUnload}
              style={{ display: "flex", alignItems: "center", gap: 4, background: "#f8f9fa", border: "1px solid #dee2e6", color: "#dc3545", padding: "0.4rem 0.8rem", borderRadius: 4, cursor: "pointer" }}
            >
              <Trash2 size={14} /> Unload
            </button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {source.resource_types?.map((rt) => (
              <button
                key={rt}
                onClick={() => loadType(source.source_id, rt, 0)}
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

      {loading && <div style={{ color: "#666", padding: "1rem 0" }}>Loading…</div>}

      {/* Table */}
      {!loading && source && activeType && rows.length > 0 && (
        <>
          <div style={{ overflowX: "auto", border: "1px solid #e0e0e0", borderRadius: 6 }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ background: "#f8f9fa", textAlign: "left" }}>
                  {columns.map((c) => (
                    <th key={c} style={{ padding: "0.5rem 0.75rem", borderBottom: "2px solid #e0e0e0", whiteSpace: "nowrap", color: "#444" }}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const flat = flattenResource(r);
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
                          {displayValue(flat[c], "—")}
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
              {offset + 1}–{Math.min(offset + rows.length, total)} of {total}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                disabled={offset === 0}
                onClick={() => loadType(source.source_id, activeType, Math.max(0, offset - PAGE_SIZE))}
                style={pagerBtn(offset === 0)}
              >
                Previous
              </button>
              <span style={{ alignSelf: "center" }}>Page {page} / {pageCount}</span>
              <button
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => loadType(source.source_id, activeType, offset + PAGE_SIZE)}
                style={pagerBtn(offset + PAGE_SIZE >= total)}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {!loading && source && activeType && rows.length === 0 && (
        <div style={{ color: "#666", padding: "1rem 0" }}>No {activeType} resources in this file.</div>
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
