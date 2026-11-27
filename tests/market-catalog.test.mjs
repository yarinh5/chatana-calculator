import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parsePriceCatalogJson,
  previewCatalogRange,
  previewCatalogTotal,
  validatePriceCatalog,
} from "../src/lib/market-catalog.ts";

const catalog = {
  format: "range-v2",
  version: " 2026-01 ",
  source: " בדיקה עצמית ",
  effectiveDate: "2026-01-01",
  currency: "ILS",
  items: [
    {
      id: "dj",
      name: "DJ",
      category: "music",
      pricingModel: "event",
      region: "מרכז",
      source: "הצעת מחיר",
      updatedAt: "2026-01-01",
      min: 6000,
      typical: 7000,
      max: 9000,
    },
    {
      id: "meal",
      name: "מנה",
      category: "venue",
      pricingModel: "meal",
      region: "דרום",
      source: "בדיקת ספקים",
      updatedAt: "2026-02-01",
      min: 400,
      typical: 450.5,
      max: 500,
    },
  ],
};

const legacy = {
  version: "2026-01",
  source: "בדיקה עצמית",
  effectiveDate: "2026-01-01",
  currency: "ILS",
  items: [{ id: "dj", name: "DJ", category: "music", unit: "item", price: 7000 }],
};

test("accepts per-item provenance and computes selected min/typical/max", () => {
  const parsed = parsePriceCatalogJson(JSON.stringify(catalog));
  assert.equal(parsed.format, "range-v2");
  assert.equal(parsed.version, "2026-01");
  assert.equal(parsed.items[0].region, "מרכז");
  assert.deepEqual(
    previewCatalogRange(parsed, {
      dj: { selected: true, quantity: 1 },
      meal: { selected: true, quantity: 2 },
    }),
    { min: 6800, typical: 7901, max: 10000 },
  );
  assert.equal(previewCatalogTotal(parsed, { dj: { selected: true, quantity: 1 } }), 7000);
});

test("old JSON remains loadable but does not invent range or per-item provenance", () => {
  const parsed = validatePriceCatalog(legacy);
  assert.equal(parsed.format, "legacy-point-v1");
  assert.equal(parsed.items[0].pricingModel, null);
  assert.equal(parsed.items[0].legacyUnit, "item");
  assert.equal(parsed.items[0].source, null);
  assert.equal(parsed.items[0].updatedAt, null);
  assert.deepEqual(previewCatalogRange(parsed, { dj: { selected: true, quantity: 2 } }), {
    min: null,
    typical: 14000,
    max: null,
  });
});

test("rejects invalid range, pricing model, region, source and date", () => {
  const first = catalog.items[0];
  const withFirst = (patch) => ({ ...catalog, items: [{ ...first, ...patch }] });
  assert.throws(() => validatePriceCatalog(withFirst({ min: 8000 })), /טווח/);
  assert.throws(() => validatePriceCatalog(withFirst({ max: 6999 })), /טווח/);
  assert.throws(() => validatePriceCatalog(withFirst({ pricingModel: "invited" })), /מודל/);
  assert.throws(() => validatePriceCatalog(withFirst({ region: "" })), /אזור/);
  assert.throws(() => validatePriceCatalog(withFirst({ source: "" })), /מקור/);
  assert.throws(() => validatePriceCatalog(withFirst({ updatedAt: "2026-02-30" })), /תאריך/);
  assert.throws(() => validatePriceCatalog(withFirst({ min: 1.234 })), /שתי ספרות/);
  assert.throws(() => validatePriceCatalog({ ...catalog, source: "" }), /מקור/);
  assert.throws(() => validatePriceCatalog({ ...catalog, format: undefined }), /range-v2/);
  assert.throws(() => validatePriceCatalog({ ...catalog, currency: "USD" }), /ILS/);
});

test("rejects duplicates, malformed import, bad quantities and unsafe totals", () => {
  assert.throws(
    () => validatePriceCatalog({ ...catalog, items: [...catalog.items, catalog.items[0]] }),
    /יותר מפעם/,
  );
  assert.throws(() => parsePriceCatalogJson("{"), /JSON/);
  assert.throws(() => parsePriceCatalogJson("x".repeat(1024 * 1024 + 1)), /גדול/);
  const parsed = validatePriceCatalog(catalog);
  assert.throws(
    () => previewCatalogRange(parsed, { dj: { selected: true, quantity: 1.5 } }),
    /כמות/,
  );
  assert.throws(() => previewCatalogRange(parsed, { dj: { selected: true, quantity: 0 } }), /כמות/);
  assert.throws(
    () => previewCatalogRange(parsed, { dj: { selected: true, quantity: 1_000_001 } }),
    /כמות/,
  );
  const huge = validatePriceCatalog({
    ...catalog,
    items: [{ ...catalog.items[0], min: 1e9, typical: 1e9, max: 1e9 }],
  });
  assert.throws(
    () => previewCatalogRange(huge, { dj: { selected: true, quantity: 1_000_000 } }),
    /גדול/,
  );
});
