import type { Database } from "@/integrations/supabase/types";

export type RsvpStatus = Database["public"]["Enums"]["rsvp_status"];

export type RsvpRow = Database["public"]["Functions"]["list_workspace_rsvps"]["Returns"][number];

export type PublicRsvp = Database["public"]["Functions"]["get_public_rsvp"]["Returns"][number];

export const RSVP_STATUSES: RsvpStatus[] = [
  "not_sent",
  "sent",
  "awaiting_response",
  "confirmed",
  "declined",
  "partially_confirmed",
];

export const RSVP_STATUS_LABELS: Record<RsvpStatus, string> = {
  not_sent: "טרם נשלח",
  sent: "נשלחה הזמנה",
  awaiting_response: "ממתינים לתשובה",
  confirmed: "אישרו",
  declined: "לא מגיעים",
  partially_confirmed: "אישרו חלקית",
};

export const RSVP_STATUS_VARIANTS: Record<RsvpStatus, string> = {
  not_sent: "bg-secondary text-muted-foreground ring-border",
  sent: "bg-blue-50 text-blue-700 ring-blue-200",
  awaiting_response: "bg-gold/15 text-foreground ring-gold/40",
  confirmed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  declined: "bg-destructive/10 text-destructive ring-destructive/25",
  partially_confirmed: "bg-amber-50 text-amber-800 ring-amber-200",
};

export function formatRsvpDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatWeddingDate(value: string | null | undefined) {
  if (!value) return "תאריך יעודכן בהמשך";
  return new Intl.DateTimeFormat("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

export function getConfirmedCountForStatus(
  status: RsvpStatus,
  groupSize: number,
  count: number | null | undefined,
) {
  if (status === "confirmed") return groupSize;
  if (status === "declined") return 0;
  if (status === "partially_confirmed") return count ?? 1;
  return null;
}

export function validateConfirmedCount(
  status: RsvpStatus,
  groupSize: number,
  count: number | null,
) {
  if (status === "confirmed" || status === "declined") return null;
  if (status === "not_sent" || status === "sent" || status === "awaiting_response") return null;
  if (!count || count <= 0 || count >= groupSize) {
    return `באישור חלקי יש לבחור מספר בין 1 ל-${Math.max(groupSize - 1, 1)}`;
  }
  return null;
}

export function calculateRsvpStats(rows: RsvpRow[]) {
  const invited = rows.reduce((sum, row) => sum + (row.group_size || 0), 0);
  const confirmed = rows.reduce((sum, row) => sum + (row.confirmed_count ?? 0), 0);
  const declined = rows.reduce((sum, row) => {
    if (row.status === "declined") return sum + row.group_size;
    if (row.status === "partially_confirmed") {
      return sum + Math.max(row.group_size - (row.confirmed_count ?? 0), 0);
    }
    return sum;
  }, 0);
  const awaiting = rows.reduce((sum, row) => {
    if (["not_sent", "sent", "awaiting_response"].includes(row.status)) {
      return sum + row.group_size;
    }
    return sum;
  }, 0);
  const partialGroups = rows.filter((row) => row.status === "partially_confirmed").length;
  const respondedGroups = rows.filter((row) =>
    ["confirmed", "declined", "partially_confirmed"].includes(row.status),
  ).length;
  const responseRate = rows.length ? Math.round((respondedGroups / rows.length) * 100) : 0;

  return {
    invited,
    confirmed,
    declined,
    awaiting,
    partialGroups,
    responseRate,
    groups: rows.length,
    respondedGroups,
  };
}

export type RsvpStats = ReturnType<typeof calculateRsvpStats>;

export function normalizePhoneForWhatsapp(phone: string | null | undefined) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;
  return digits.length >= 8 ? digits : null;
}

export function buildWhatsappMessage({
  guestName,
  eventName,
  link,
}: {
  guestName: string;
  eventName?: string | null;
  link: string;
}) {
  const greeting = guestName ? `היי ${guestName} 💍` : "היי 💍";
  const eventText = eventName ? `ל${eventName}` : "לחתונה שלנו";
  return `${greeting}
נשמח שתעדכנו אותנו אם תוכלו להגיע ${eventText}:
${link}`;
}
