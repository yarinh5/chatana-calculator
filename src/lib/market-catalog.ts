import { CATEGORIES, type CategoryKey } from "./wedding-data.ts";

export const MAX_CATALOG_BYTES = 1024 * 1024;
export const MAX_CATALOG_ITEMS = 500;
export const PRICING_MODELS = ["event", "guest", "meal", "table", "hour", "package"] as const;
export type PricingModel = (typeof PRICING_MODELS)[number];
export const LEGACY_UNITS = ["item", "guest", "invited", "tables"] as const;
export type LegacyUnit = (typeof LEGACY_UNITS)[number];

export type CatalogPrice = {
  id: string;
  name: string;
  category: CategoryKey;
  pricingModel: PricingModel | null;
  legacyUnit: LegacyUnit | null;
  region: string | null;
  source: string | null;
  updatedAt: string | null;
  min: number | null;
  typical: number;
  max: number | null;
};

export type PriceCatalog = {
  format: "range-v2" | "legacy-point-v1";
  version: string;
  source: string;
  effectiveDate: string;
  currency: "ILS";
  items: CatalogPrice[];
};

export type CatalogRange = { min: number | null; typical: number; max: number | null };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function shortText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
    throw new Error(`${field} נדרש וצריך להכיל עד ${maxLength} תווים.`);
  }
  return value.trim();
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function price(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 1_000_000_000) {
    throw new Error(`${field} חייב להיות מספר חיובי וסביר.`);
  }
  if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-7) {
    throw new Error(`${field} יכול להכיל עד שתי ספרות אחרי הנקודה.`);
  }
  return value;
}

function baseItem(raw: Record<string, unknown>, position: number, seenIds: Set<string>) {
  const id = shortText(raw.id, `מזהה פריט ${position}`, 64);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(id)) throw new Error(`מזהה פריט ${position} אינו תקין.`);
  if (seenIds.has(id)) throw new Error(`מזהה הפריט ${id} מופיע יותר מפעם אחת.`);
  seenIds.add(id);
  const name = shortText(raw.name, `שם פריט ${position}`, 160);
  if (typeof raw.category !== "string" || !Object.hasOwn(CATEGORIES, raw.category)) {
    throw new Error(`קטגוריית פריט ${position} אינה תקינה.`);
  }
  return { id, name, category: raw.category as CategoryKey };
}

/** A range-v2 item requires its own region, source and update date. Legacy point prices remain explicit. */
export function validatePriceCatalog(input: unknown): PriceCatalog {
  if (!isRecord(input)) throw new Error("מבנה המחירון אינו תקין.");
  if (
    input.format === undefined &&
    Array.isArray(input.items) &&
    input.items.some(
      (item) => isRecord(item) && ("min" in item || "typical" in item || "max" in item),
    )
  ) {
    throw new Error('מחירון עם טווחי מחירים חייב לציין format: "range-v2".');
  }
  const format = input.format === undefined ? "legacy-point-v1" : input.format;
  if (format !== "range-v2" && format !== "legacy-point-v1") {
    throw new Error("פורמט המחירון אינו נתמך.");
  }
  const version = shortText(input.version, "גרסת המחירון", 64);
  const source = shortText(input.source, "מקור המחירים", 160);
  if (!validDate(input.effectiveDate)) throw new Error("תאריך תוקף המחירון אינו תקין.");
  if (input.currency !== "ILS") throw new Error("המחירון חייב להשתמש בשקלים (ILS).");
  if (
    !Array.isArray(input.items) ||
    input.items.length === 0 ||
    input.items.length > MAX_CATALOG_ITEMS
  ) {
    throw new Error(`המחירון צריך להכיל בין 1 ל־${MAX_CATALOG_ITEMS} פריטים.`);
  }

  const seenIds = new Set<string>();
  const items = input.items.map((raw, index): CatalogPrice => {
    const position = index + 1;
    if (!isRecord(raw)) throw new Error(`פריט ${position} אינו תקין.`);
    const base = baseItem(raw, position, seenIds);
    if (format === "legacy-point-v1") {
      if (!LEGACY_UNITS.includes(raw.unit as LegacyUnit))
        throw new Error(`יחידת פריט ${position} אינה תקינה.`);
      return {
        ...base,
        pricingModel: null,
        legacyUnit: raw.unit as LegacyUnit,
        region: null,
        source: null,
        updatedAt: null,
        min: null,
        typical: price(raw.price, `מחיר פריט ${position}`),
        max: null,
      };
    }
    if (!PRICING_MODELS.includes(raw.pricingModel as PricingModel)) {
      throw new Error(`מודל תמחור פריט ${position} אינו תקין.`);
    }
    const region = shortText(raw.region, `אזור פריט ${position}`, 100);
    const itemSource = shortText(raw.source, `מקור פריט ${position}`, 160);
    if (!validDate(raw.updatedAt)) throw new Error(`תאריך עדכון פריט ${position} אינו תקין.`);
    const min = price(raw.min, `מחיר מינימום פריט ${position}`);
    const typical = price(raw.typical, `מחיר טיפוסי פריט ${position}`);
    const max = price(raw.max, `מחיר מקסימום פריט ${position}`);
    if (min > typical || typical > max)
      throw new Error(`טווח המחירים של פריט ${position} אינו תקין: מינימום ≤ טיפוסי ≤ מקסימום.`);
    return {
      ...base,
      pricingModel: raw.pricingModel as PricingModel,
      legacyUnit: null,
      region,
      source: itemSource,
      updatedAt: raw.updatedAt,
      min,
      typical,
      max,
    };
  });
  return { format, version, source, effectiveDate: input.effectiveDate, currency: "ILS", items };
}

export function parsePriceCatalogJson(text: string): PriceCatalog {
  if (new TextEncoder().encode(text).byteLength > MAX_CATALOG_BYTES) {
    throw new Error("קובץ המחירון גדול מדי. הגודל המרבי הוא 1MB.");
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("קובץ המחירון אינו JSON תקין.");
  }
  return validatePriceCatalog(value);
}

function sumCents(
  catalog: PriceCatalog,
  selections: Record<string, { selected: boolean; quantity: number }>,
  key: "min" | "typical" | "max",
): number | null {
  let cents = 0;
  for (const item of catalog.items) {
    const selection = selections[item.id];
    if (!selection?.selected) continue;
    if (
      !Number.isSafeInteger(selection.quantity) ||
      selection.quantity < 1 ||
      selection.quantity > 1_000_000
    ) {
      throw new Error(`הכמות עבור ${item.name} אינה תקינה.`);
    }
    const unitPrice = item[key];
    if (unitPrice === null) return null;
    const lineCents = Math.round(unitPrice * 100) * selection.quantity;
    if (!Number.isSafeInteger(lineCents) || !Number.isSafeInteger(cents + lineCents)) {
      throw new Error("הסכום גדול מדי לחישוב.");
    }
    cents += lineCents;
  }
  return cents / 100;
}

export function previewCatalogRange(
  catalog: PriceCatalog,
  selections: Record<string, { selected: boolean; quantity: number }>,
): CatalogRange {
  return {
    min: sumCents(catalog, selections, "min"),
    typical: sumCents(catalog, selections, "typical") ?? 0,
    max: sumCents(catalog, selections, "max"),
  };
}

/** Kept for callers of the first local preview; returns the typical/legacy point estimate. */
export function previewCatalogTotal(
  catalog: PriceCatalog,
  selections: Record<string, { selected: boolean; quantity: number }>,
): number {
  return previewCatalogRange(catalog, selections).typical;
}
