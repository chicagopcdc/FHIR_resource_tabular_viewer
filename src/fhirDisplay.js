// src/fhirDisplay.js
// Render common FHIR datatypes into short, human-readable strings and pick a
// curated set of readable columns, so the table can show "Glucose", "5.4 mmol/L",
// or "Patient/123" instead of raw dotted paths like code.coding[0].display.
// This is a display layer only; the row drill-down still shows the full raw
// resource, so no information is lost.

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// Top-level fields that are noise in a table (narrative, metadata, extensions).
const SKIP_FIELDS = new Set([
  "meta", "text", "extension", "modifierExtension", "contained",
  "implicitRules", "language",
]);

// Choice-type prefixes: valueQuantity, effectiveDateTime, etc. collapse to a
// single readable column ("value", "effective", ...).
const CHOICE_PREFIXES = [
  "value", "effective", "onset", "performed", "deceased", "occurrence",
  "authored", "abatement", "multipleBirth",
];

// Preferred column order; anything else follows, ordered by how common it is.
const PRIORITY = [
  "id", "resourceType", "status", "clinicalStatus", "verificationStatus",
  "category", "code", "medicationCodeableConcept", "value", "subject", "patient",
  "encounter", "effective", "performed", "onset", "issued", "authoredOn",
  "recordedDate", "name", "gender", "birthDate",
];

/** Collapse a choice-type key (valueQuantity) to its base label (value). */
export function collapseKey(key) {
  for (const p of CHOICE_PREFIXES) {
    if (key.length > p.length && key.startsWith(p) && key[p.length] === key[p.length].toUpperCase()) {
      return p;
    }
  }
  return key;
}

/** Render one FHIR element value as a short readable string. */
export function formatValue(value) {
  if (value === null || value === undefined) return "";

  if (Array.isArray(value)) {
    if (value.length === 0) return "";
    const head = formatValue(value[0]);
    return value.length > 1 ? `${head} (+${value.length - 1} more)` : head;
  }

  if (isObject(value)) {
    // Reference
    if ("reference" in value) return value.display || value.reference || "";
    // CodeableConcept
    if (Array.isArray(value.coding) || (typeof value.text === "string" && !("value" in value))) {
      if (value.text) return value.text;
      const c = Array.isArray(value.coding) ? value.coding[0] : null;
      if (c) return c.display || c.code || "";
      return "";
    }
    // Quantity / Money (numeric value with a unit)
    if (typeof value.value === "number") {
      const unit = value.unit || value.currency || value.code || "";
      return [value.value, unit].filter((x) => x !== undefined && x !== "").join(" ").trim();
    }
    // Identifier (string value with a system)
    if (typeof value.value === "string") return value.value;
    // Coding
    if ("system" in value && ("code" in value || "display" in value)) {
      return value.display || value.code || "";
    }
    // Period
    if ("start" in value || "end" in value) return `${value.start || "?"} to ${value.end || "?"}`;
    // Range
    if ("low" in value || "high" in value) return `${formatValue(value.low)} - ${formatValue(value.high)}`;
    // HumanName
    if ("family" in value || "given" in value) {
      const given = Array.isArray(value.given) ? value.given.join(" ") : value.given || "";
      return [value.family, given].filter(Boolean).join(", ") || value.text || "";
    }
    // Address
    if ("city" in value || "state" in value || "postalCode" in value) {
      return [value.city, value.state, value.postalCode].filter(Boolean).join(", ");
    }
    // Fallback: compact JSON so nothing silently disappears.
    return JSON.stringify(value);
  }

  return String(value);
}

/** Readable { label: value } for one resource, with choice-types collapsed. */
export function readableRow(resource) {
  const row = {};
  if (!isObject(resource)) return row;
  for (const key of Object.keys(resource)) {
    if (SKIP_FIELDS.has(key)) continue;
    const label = collapseKey(key);
    if (label in row) continue; // first present choice-type wins
    row[label] = formatValue(resource[key]);
  }
  return row;
}

/** Ordered readable column labels across a sample of resources. */
export function readableColumns(resources, max = 14) {
  if (!Array.isArray(resources) || resources.length === 0) return [];
  const freq = {};
  resources.forEach((r) => {
    Object.keys(readableRow(r)).forEach((k) => { freq[k] = (freq[k] || 0) + 1; });
  });
  const keys = Object.keys(freq);
  const ordered = [
    ...PRIORITY.filter((k) => keys.includes(k)),
    ...keys.filter((k) => !PRIORITY.includes(k)).sort((a, b) => freq[b] - freq[a]),
  ];
  return ordered.slice(0, max);
}

/**
 * Map a readable column label to a dotted path the backend can sort by,
 * inspecting a sample resource to resolve choice-types.
 */
export function sortPathFor(label, sample) {
  if (!isObject(sample)) return label;

  // Resolve a collapsed choice-type back to the concrete key present here.
  let key = label;
  if (!(key in sample)) {
    const match = Object.keys(sample).find((k) => collapseKey(k) === label);
    if (match) key = match;
  }
  const val = sample[key];

  if (isObject(val)) {
    if ("reference" in val) return `${key}.reference`;
    if (Array.isArray(val.coding)) return `${key}.coding[0].display`;
    if ("value" in val) return `${key}.value`;
    if ("start" in val) return `${key}.start`;
    if ("family" in val) return `${key}.family`;
  }
  if (Array.isArray(val) && isObject(val[0])) {
    if ("family" in val[0]) return `${key}[0].family`;
    if (Array.isArray(val[0].coding)) return `${key}[0].coding[0].display`;
    if ("value" in val[0]) return `${key}[0].value`;
  }
  return key;
}
