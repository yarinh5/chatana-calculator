import { CATEGORIES, type CategoryKey } from "./wedding-data.ts";

export const MAX_CATALOG_BYTES = 1024 * 1024;
export const MAX_CATALOG_ITEMS = 500;
export const PRICE_UNITS = ["item", "guest", "invited", "tables"] as const;
export type PriceUnit = (typeof PRICE_UNITS)[number];

export type CatalogPrice = {
  id: string;
  name: string;
  category: CategoryKey;
  unit: PriceUnit;
  price: number;
};

export type PriceCatalog = {
  version: string;
  source: string;
  effectiveDate: string;
  currency: "ILS";
  items: CatalogPrice[];
};

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

/** Validates a user supplied, versioned price catalog; no price is inferred from legacy samples. */
export function validatePriceCatalog(input: unknown): PriceCatalog {
  if (!isRecord(input)) throw new Error("מבנה המחירון אינו תקין.");
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
    const id = shortText(raw.id, `מזהה פריט ${position}`, 64);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(id))
      throw new Error(`מזהה פריט ${position} אינו תקין.`);
    if (seenIds.has(id)) throw new Error(`מזהה הפריט ${id} מופיע יותר מפעם אחת.`);
    seenIds.add(id);
    const name = shortText(raw.name, `שם פריט ${position}`, 160);
    if (typeof raw.category !== "string" || !(raw.category in CATEGORIES)) {
      throw new Error(`קטגוריית פריט ${position} אינה תקינה.`);
    }
    if (!PRICE_UNITS.includes(raw.unit as PriceUnit)) {
      throw new Error(`יחידת פריט ${position} אינה תקינה.`);
    }
    if (
      typeof raw.price !== "number" ||
      !Number.isFinite(raw.price) ||
      raw.price <= 0 ||
      raw.price > 1_000_000_000
    ) {
      throw new Error(`מחיר פריט ${position} חייב להיות מספר חיובי וסביר.`);
    }
    if (Math.abs(raw.price * 100 - Math.round(raw.price * 100)) > 1e-7) {
      throw new Error(`מחיר פריט ${position} יכול להכיל עד שתי ספרות אחרי הנקודה.`);
    }
    return {
      id,
      name,
      category: raw.category as CategoryKey,
      unit: raw.unit as PriceUnit,
      price: raw.price,
    };
  });
  return { version, source, effectiveDate: input.effectiveDate, currency: "ILS", items };
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

export function previewCatalogTotal(
  catalog: PriceCatalog,
  selections: Record<string, { selected: boolean; quantity: number }>,
): number {
  const total = catalog.items.reduce((sum, item) => {
    const selection = selections[item.id];
    if (!selection?.selected) return sum;
    if (
      !Number.isSafeInteger(selection.quantity) ||
      selection.quantity < 1 ||
      selection.quantity > 1_000_000
    ) {
      throw new Error(`הכמות עבור ${item.name} אינה תקינה.`);
    }
    const line = item.price * selection.quantity;
    if (!Number.isFinite(line)) throw new Error("הסכום גדול מדי לחישוב.");
    return sum + line;
  }, 0);
  if (!Number.isFinite(total)) throw new Error("הסכום גדול מדי לחישוב.");
  return Math.round(total * 100) / 100;
}
