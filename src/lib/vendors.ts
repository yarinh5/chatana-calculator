import type { Database } from "@/integrations/supabase/types";

export type VendorStatus = Database["public"]["Enums"]["vendor_status"];
export type VendorRow = Database["public"]["Tables"]["vendors"]["Row"];
export type VendorInsert = Database["public"]["Tables"]["vendors"]["Insert"];
export type VendorUpdate = Database["public"]["Tables"]["vendors"]["Update"];

export const VENDOR_STATUSES: VendorStatus[] = [
  "interested",
  "contacted",
  "quote_received",
  "negotiating",
  "booked",
  "cancelled",
];

export const VENDOR_STATUS_LABELS: Record<VendorStatus, string> = {
  interested: "מתעניינים",
  contacted: "נוצר קשר",
  quote_received: "התקבלה הצעה",
  negotiating: "במשא ומתן",
  booked: "נסגר",
  cancelled: "בוטל",
};

export const VENDOR_STATUS_STYLES: Record<VendorStatus, string> = {
  interested: "bg-secondary text-muted-foreground ring-border",
  contacted: "bg-blue-50 text-blue-700 ring-blue-200",
  quote_received: "bg-gold/15 text-foreground ring-gold/40",
  negotiating: "bg-purple-50 text-purple-700 ring-purple-200",
  booked: "bg-success/10 text-success ring-success/30",
  cancelled: "bg-destructive/10 text-destructive ring-destructive/30",
};

export const DEFAULT_VENDOR_STATUS: VendorStatus = "interested";

export type VendorFormValues = {
  business_name: string;
  category: string;
  contact_name: string;
  phone: string;
  whatsapp_phone: string;
  email: string;
  website: string;
  instagram: string;
  initial_quote: string;
  status: VendorStatus;
  notes: string;
};

export const EMPTY_VENDOR_FORM: VendorFormValues = {
  business_name: "",
  category: "",
  contact_name: "",
  phone: "",
  whatsapp_phone: "",
  email: "",
  website: "",
  instagram: "",
  initial_quote: "",
  status: DEFAULT_VENDOR_STATUS,
  notes: "",
};

const LENGTH_LIMITS = {
  business_name: 160,
  category: 80,
  contact_name: 160,
  phone: 40,
  whatsapp_phone: 40,
  email: 254,
  website: 300,
  instagram: 300,
  notes: 4000,
} as const;

export function vendorToForm(vendor: VendorRow | null): VendorFormValues {
  if (!vendor) return EMPTY_VENDOR_FORM;
  return {
    business_name: vendor.business_name,
    category: vendor.category,
    contact_name: vendor.contact_name ?? "",
    phone: vendor.phone ?? "",
    whatsapp_phone: vendor.whatsapp_phone ?? "",
    email: vendor.email ?? "",
    website: vendor.website ?? "",
    instagram: vendor.instagram ?? "",
    initial_quote: vendor.initial_quote == null ? "" : String(vendor.initial_quote),
    status: vendor.status,
    notes: vendor.notes ?? "",
  };
}

export function normalizeVendorForm(values: VendorFormValues): {
  payload: Omit<VendorInsert, "event_id">;
  error: string | null;
} {
  const businessName = values.business_name.trim();
  const category = values.category.trim();
  if (!businessName) return { payload: emptyPayload(), error: "שם העסק הוא שדה חובה" };
  if (!category) return { payload: emptyPayload(), error: "קטגוריה היא שדה חובה" };
  if (businessName.length > LENGTH_LIMITS.business_name) {
    return { payload: emptyPayload(), error: "שם העסק ארוך מדי" };
  }
  if (category.length > LENGTH_LIMITS.category) {
    return { payload: emptyPayload(), error: "שם הקטגוריה ארוך מדי" };
  }

  const quoteText = values.initial_quote.trim();
  const quote = quoteText === "" ? null : Number(quoteText);
  if (quoteText !== "" && (!Number.isFinite(quote) || quote < 0)) {
    return { payload: emptyPayload(), error: "הצעת מחיר ראשונית חייבת להיות מספר לא שלילי" };
  }

  const payload = {
    business_name: businessName,
    category,
    contact_name: nullableTrim(values.contact_name, LENGTH_LIMITS.contact_name),
    phone: nullableTrim(values.phone, LENGTH_LIMITS.phone),
    whatsapp_phone: nullableTrim(values.whatsapp_phone, LENGTH_LIMITS.whatsapp_phone),
    email: nullableTrim(values.email, LENGTH_LIMITS.email),
    website: nullableTrim(values.website, LENGTH_LIMITS.website),
    instagram: nullableTrim(values.instagram, LENGTH_LIMITS.instagram),
    initial_quote: quote,
    status: values.status,
    notes: nullableTrim(values.notes, LENGTH_LIMITS.notes),
  };

  if (Object.values(payload).some((value) => value === "__TOO_LONG__")) {
    return { payload: emptyPayload(), error: "אחד השדות ארוך מהמותר" };
  }

  return { payload: payload as Omit<VendorInsert, "event_id">, error: null };
}

export function safeExternalUrl(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function safeInstagramUrl(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text) return null;
  const existing = safeExternalUrl(text);
  if (existing) {
    try {
      const url = new URL(existing);
      const hostname = url.hostname.toLowerCase();
      return hostname === "instagram.com" || hostname.endsWith(".instagram.com") ? existing : null;
    } catch {
      return null;
    }
  }
  const handle = text.replace(/^@/, "");
  return /^[a-zA-Z0-9._]{1,30}$/.test(handle) ? `https://www.instagram.com/${handle}` : null;
}

export function vendorSearchText(vendor: VendorRow) {
  return [vendor.business_name, vendor.contact_name, vendor.category].filter(Boolean).join(" ");
}

function nullableTrim(value: string, max: number) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? "__TOO_LONG__" : trimmed;
}

function emptyPayload(): Omit<VendorInsert, "event_id"> {
  return {
    business_name: "",
    category: "",
  };
}
