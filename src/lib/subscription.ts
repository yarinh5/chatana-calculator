// ── Single source of truth for the commercial model ────────────────────────────
// Two plans only: ניסיון חינם (21 days) and Premium (12 months, ₪99).
// Existing Premium customers may extend by 6 months for ₪39.90.

export const PLAN_CONFIG = {
  trialDays: 21,
  trialExpenseLimit: 5,
  premiumMonths: 12,
  premiumPrice: 99,
  extensionMonths: 6,
  extensionPrice: 39.9,
  currency: "₪",
} as const;

export const PRICE_LABELS = {
  premium: `${PLAN_CONFIG.currency}${PLAN_CONFIG.premiumPrice}`,
  extension: `${PLAN_CONFIG.currency}${PLAN_CONFIG.extensionPrice.toFixed(2)}`,
  trial: `${PLAN_CONFIG.currency}0`,
  launchBadge: "מחיר השקה",
  premiumSubtitle: `גישה מלאה ל-${PLAN_CONFIG.premiumMonths} חודשים`,
  trialSubtitle: `${PLAN_CONFIG.trialDays} ימים`,
  extensionSubtitle: `${PLAN_CONFIG.extensionMonths} חודשים נוספים`,
} as const;

export type SubscriptionStatus =
  | "trial_active"
  | "trial_expired"
  | "premium_active"
  | "premium_expired";

export type SubscriptionRow = {
  id: string;
  event_id: string;
  plan: string;
  trial_started_at: string;
  trial_expires_at: string;
  premium_started_at: string | null;
  premium_expires_at: string | null;
};

export type FeatureKey =
  | "payments"
  | "attendance"
  | "wedding_day_mode"
  | "unlimited_expenses"
  | "advanced_exports"
  | "rsvp"
  | "seating"
  | "suppliers"
  | "ai";

/** Premium-only features. Anything not listed is available during the trial. */
export const PREMIUM_FEATURES: FeatureKey[] = [
  "payments",
  "attendance",
  "wedding_day_mode",
  "unlimited_expenses",
  "advanced_exports",
  "rsvp",
  "seating",
  "suppliers",
  "ai",
];

/** Derived from trusted server timestamps — never from local storage. */
export function deriveStatus(row: SubscriptionRow | null, now: number = Date.now()): SubscriptionStatus {
  if (!row) return "trial_expired";
  const premiumEnd = row.premium_expires_at ? Date.parse(row.premium_expires_at) : null;
  if (premiumEnd !== null) return premiumEnd > now ? "premium_active" : "premium_expired";
  return Date.parse(row.trial_expires_at) > now ? "trial_active" : "trial_expired";
}

export function currentExpiry(row: SubscriptionRow | null): string | null {
  if (!row) return null;
  return row.premium_expires_at ?? row.trial_expires_at;
}

export function daysRemaining(iso: string | null, now: number = Date.now()): number {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((Date.parse(iso) - now) / 86400000));
}

export function formatDateHe(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export type UpgradeReason =
  | "expense_limit"
  | "payments"
  | "attendance"
  | "wedding_day_mode"
  | "trial_expired"
  | "premium_expired"
  | "generic";

export const UPGRADE_COPY: Record<UpgradeReason, { title: string; body: string }> = {
  expense_limit: {
    title: `הגעתם למגבלת ${PLAN_CONFIG.trialExpenseLimit} הפריטים`,
    body: `בתקופת הניסיון אפשר לנהל עד ${PLAN_CONFIG.trialExpenseLimit} פריטי הוצאה. שדרגו ל-Premium כדי להוסיף פריטים ללא הגבלה.`,
  },
  payments: {
    title: "ניהול תשלומים זמין ב-Premium",
    body: "עקבו אחר מקדמות, יתרות, תאריכי תשלום והיסטוריית תשלומים במקום אחד.",
  },
  attendance: {
    title: 'מצב "מי הגיע" זמין ב-Premium',
    body: "סמנו הגעה בזמן אמת, נהלו מתנות וקבלו סיכום כספי מיידי ביום החתונה.",
  },
  wedding_day_mode: {
    title: "מצב יום החתונה זמין ב-Premium",
    body: "מסך כניסה מהיר לאירוע — חיפוש אורח, סימון הגעה ורישום מתנה בשניות.",
  },
  trial_expired: {
    title: "תקופת הניסיון הסתיימה 💍",
    body: "כל הנתונים שהזנתם נשמרו. שדרגו ל-Premium כדי להמשיך לנהל את החתונה.",
  },
  premium_expired: {
    title: "תקופת ה-Premium הסתיימה",
    body: `כל המידע שלכם שמור. אפשר להאריך את הגישה ל-${PLAN_CONFIG.extensionMonths} חודשים נוספים.`,
  },
  generic: {
    title: "הפיצ'ר הזה זמין ב-Premium",
    body: "שדרגו ל-Premium ופתחו את כל המערכת.",
  },
};

/** Lightweight analytics — never carries financial or guest data. */
export function trackSubscriptionEvent(name: string, props: Record<string, string | number> = {}) {
  const w = window as unknown as { dataLayer?: unknown[] };
  if (Array.isArray(w.dataLayer)) w.dataLayer.push({ event: name, ...props });
}
