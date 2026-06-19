// src/services/sourcesApi.js
// Client for the backend local-file data source endpoints (/api/sources).
// Kept separate from api.js because uploads use multipart/form-data rather
// than the JSON envelope safeFetch() assumes.
import { CONFIG } from '../config';

const SOURCES_BASE = `${CONFIG.api.baseUrl}/api/sources`;

/**
 * Shared response handler: unwraps the backend's { success, data } envelope
 * and turns non-2xx responses into thrown Errors with a readable message.
 */
async function handle(response) {
  let body = null;
  try {
    body = await response.json();
  } catch {
    // fall through to status-based error below
  }

  if (!response.ok) {
    const detail = body?.detail || body?.message || `HTTP ${response.status}`;
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
  }
  // Endpoints return { success, data } (or { success, message } for delete).
  return body?.data !== undefined ? body.data : body;
}

/**
 * Upload a FHIR file (resource, Bundle, JSON array, or NDJSON).
 * Returns the source metadata { source_id, summary, resource_types, ... }.
 */
export async function uploadSource(file) {
  const form = new FormData();
  form.append('file', file);
  // NOTE: do not set Content-Type — the browser sets the multipart boundary.
  const response = await fetch(`${SOURCES_BASE}/upload`, {
    method: 'POST',
    body: form,
  });
  return handle(response);
}

/** List all loaded sources. */
export async function listSources() {
  return handle(await fetch(SOURCES_BASE));
}

/** Get metadata for a single source. */
export async function getSource(sourceId) {
  return handle(await fetch(`${SOURCES_BASE}/${sourceId}`));
}

/** Fetch a paginated FHIR searchset Bundle for one resource type. */
export async function searchResources(sourceId, resourceType, { count = 50, offset = 0 } = {}) {
  const qs = new URLSearchParams({ count: String(count), offset: String(offset) });
  return handle(
    await fetch(`${SOURCES_BASE}/${sourceId}/resources/${resourceType}?${qs}`)
  );
}

/** Get inferred tabular columns for a resource type. */
export async function getResourceSchema(sourceId, resourceType, sample = 20) {
  const qs = new URLSearchParams({ sample: String(sample) });
  return handle(
    await fetch(`${SOURCES_BASE}/${sourceId}/resources/${resourceType}/schema?${qs}`)
  );
}

/** Read a single resource by id. */
export async function readResource(sourceId, resourceType, resourceId) {
  return handle(
    await fetch(`${SOURCES_BASE}/${sourceId}/resources/${resourceType}/${resourceId}`)
  );
}

/** Unload a source. */
export async function deleteSource(sourceId) {
  const response = await fetch(`${SOURCES_BASE}/${sourceId}`, { method: 'DELETE' });
  return handle(response);
}
