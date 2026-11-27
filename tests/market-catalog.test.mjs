import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parsePriceCatalogJson,
  previewCatalogTotal,
  validatePriceCatalog,
} from "../src/lib/market-catalog.ts";

const catalog = {
  version: " 2026-01 ",
  source: " בדיקה עצמית ",
  effectiveDate: "2026-01-01",
  currency: "ILS",
  items: [
    { id: "dj", name: "DJ", category: "music", unit: "item", price: 7000 },
    { id: "meal", name: "מנה", category: "venue", unit: "guest", price: 450.5 },
  ],
};

test("accepts a sourced, versioned catalog and computes selected local total", () => {
  const parsed = parsePriceCatalogJson(JSON.stringify(catalog));
  assert.equal(parsed.version, "2026-01");
  assert.equal(parsed.source, "בדיקה עצמית");
  assert.equal(
    previewCatalogTotal(parsed, {
      dj: { selected: true, quantity: 1 },
      meal: { selected: true, quantity: 2 },
    }),
    7901,
  );
  assert.equal(previewCatalogTotal(parsed, { dj: { selected: false, quantity: 1 } }), 0);
});

test("rejects missing provenance, invalid dates, duplicates and unsupported units", () => {
  assert.throws(() => validatePriceCatalog({ ...catalog, source: "" }), /מקור/);
  assert.throws(() => validatePriceCatalog({ ...catalog, effectiveDate: "2026-02-30" }), /תאריך/);
  assert.throws(
    () => validatePriceCatalog({ ...catalog, items: [...catalog.items, catalog.items[0]] }),
    /יותר מפעם/,
  );
  assert.throws(
    () => validatePriceCatalog({ ...catalog, items: [{ ...catalog.items[0], unit: "hour" }] }),
    /יחידת/,
  );
  assert.throws(
    () => validatePriceCatalog({ ...catalog, items: [{ ...catalog.items[0], price: 0 }] }),
    /מחיר/,
  );
  assert.throws(
    () => validatePriceCatalog({ ...catalog, items: [{ ...catalog.items[0], price: 1.234 }] }),
    /שתי ספרות/,
  );
  assert.throws(() => validatePriceCatalog({ ...catalog, currency: "USD" }), /ILS/);
});

test("rejects malformed or oversized import and invalid quantities", () => {
  assert.throws(() => parsePriceCatalogJson("{"), /JSON/);
  assert.throws(() => parsePriceCatalogJson("x".repeat(1024 * 1024 + 1)), /גדול/);
  const parsed = validatePriceCatalog(catalog);
  assert.throws(
    () => previewCatalogTotal(parsed, { dj: { selected: true, quantity: 1.5 } }),
    /כמות/,
  );
  assert.throws(() => previewCatalogTotal(parsed, { dj: { selected: true, quantity: 0 } }), /כמות/);
});
