import {
  formatValue,
  collapseKey,
  readableRow,
  readableColumns,
  sortPathFor,
} from "../fhirDisplay";

describe("formatValue", () => {
  test("CodeableConcept prefers text, then coding display", () => {
    expect(formatValue({ text: "Glucose" })).toBe("Glucose");
    expect(formatValue({ coding: [{ display: "Glucose", code: "2339-0" }] })).toBe("Glucose");
    expect(formatValue({ coding: [{ code: "2339-0" }] })).toBe("2339-0");
  });

  test("Reference shows display or reference", () => {
    expect(formatValue({ reference: "Patient/123" })).toBe("Patient/123");
    expect(formatValue({ reference: "Patient/123", display: "Jane Doe" })).toBe("Jane Doe");
  });

  test("Quantity joins value and unit", () => {
    expect(formatValue({ value: 5.4, unit: "mmol/L" })).toBe("5.4 mmol/L");
  });

  test("Identifier shows its value", () => {
    expect(formatValue({ system: "http://hospital", value: "MRN-1" })).toBe("MRN-1");
  });

  test("Period and HumanName", () => {
    expect(formatValue({ start: "2026-01-01", end: "2026-01-02" })).toBe("2026-01-01 to 2026-01-02");
    expect(formatValue({ family: "Doe", given: ["Jane", "A"] })).toBe("Doe, Jane A");
  });

  test("array summarizes with a count", () => {
    expect(formatValue([{ text: "A" }, { text: "B" }])).toBe("A (+1 more)");
    expect(formatValue([])).toBe("");
  });

  test("primitives and nullish", () => {
    expect(formatValue("final")).toBe("final");
    expect(formatValue(72)).toBe("72");
    expect(formatValue(null)).toBe("");
  });
});

describe("collapseKey", () => {
  test("collapses choice types", () => {
    expect(collapseKey("valueQuantity")).toBe("value");
    expect(collapseKey("effectiveDateTime")).toBe("effective");
    expect(collapseKey("status")).toBe("status");
    expect(collapseKey("value")).toBe("value");
  });
});

describe("readableRow / readableColumns", () => {
  const obs = {
    resourceType: "Observation",
    id: "o1",
    status: "final",
    code: { coding: [{ display: "Glucose" }] },
    subject: { reference: "Patient/123" },
    valueQuantity: { value: 5.4, unit: "mmol/L" },
    meta: { lastUpdated: "2026-01-01" },
  };

  test("row collapses value[x] and skips meta", () => {
    const row = readableRow(obs);
    expect(row.value).toBe("5.4 mmol/L");
    expect(row.code).toBe("Glucose");
    expect(row.subject).toBe("Patient/123");
    expect(row.meta).toBeUndefined();
  });

  test("columns are prioritized", () => {
    const cols = readableColumns([obs]);
    expect(cols[0]).toBe("id");
    expect(cols).toContain("value");
    expect(cols).not.toContain("meta");
  });
});

describe("sortPathFor", () => {
  const obs = {
    id: "o1",
    status: "final",
    code: { coding: [{ display: "Glucose" }] },
    subject: { reference: "Patient/123" },
    valueQuantity: { value: 5.4, unit: "mmol/L" },
  };

  test("maps readable labels to backend paths", () => {
    expect(sortPathFor("status", obs)).toBe("status");
    expect(sortPathFor("code", obs)).toBe("code.coding[0].display");
    expect(sortPathFor("subject", obs)).toBe("subject.reference");
    expect(sortPathFor("value", obs)).toBe("valueQuantity.value");
  });
});
