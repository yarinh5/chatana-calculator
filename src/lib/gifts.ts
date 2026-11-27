export type GiftSummaryInput = {
  gift_amount: number | string | null;
  group_size: number | null;
  side: string | null;
  payment_method: string | null;
};

/** Explicit gift save accepts zero to clear a recorded amount; blank input is never a write. */
export function parseGiftDraft(
  amountText: string,
  methodText: string,
  allowedMethods: readonly string[],
): { amount: number; paymentMethod: string | null } {
  const normalized = amountText.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error("יש להזין סכום מתנה תקין עם עד שתי ספרות אחרי הנקודה.");
  }
  const amount = Number(normalized);
  const cents = Math.round(amount * 100);
  if (!Number.isSafeInteger(cents)) throw new Error("סכום המתנה גדול מדי.");
  const paymentMethod = methodText.trim() || null;
  if (paymentMethod && !allowedMethods.includes(paymentMethod)) {
    throw new Error("אמצעי התשלום אינו תקין.");
  }
  return { amount: cents / 100, paymentMethod };
}

export const formatGiftAmount = (amount: number) =>
  `${amount.toLocaleString("he-IL", { maximumFractionDigits: 2 })} ₪`;

export type GiftBreakdown = {
  label: string;
  total: number;
  groups: number;
};

export type GiftLedgerInput = GiftSummaryInput & { id: string; full_name: string };
export type GiftLedgerEntry = {
  id: string;
  name: string;
  amount: number;
  side: string;
  paymentMethod: string;
};

function recordedGiftCents(value: number | string | null): number | "empty" | "invalid" {
  if (value === null) return "empty";
  const amount = Number(value);
  if (amount === 0) return "empty";
  if (!Number.isFinite(amount) || amount < 0) return "invalid";
  const cents = Math.round(amount * 100);
  if (!Number.isSafeInteger(cents) || cents <= 0 || Math.abs(amount * 100 - cents) > 1e-7)
    return "invalid";
  return cents;
}

/** The ledger shows only valid positive gifts already recorded for invitation groups. */
export function listRecordedGifts(rows: readonly GiftLedgerInput[]): GiftLedgerEntry[] {
  return rows
    .flatMap((row) => {
      const cents = recordedGiftCents(row.gift_amount);
      return typeof cents === "number"
        ? [
            {
              id: row.id,
              name: row.full_name,
              amount: cents / 100,
              side: row.side?.trim() || "לא שויך",
              paymentMethod: row.payment_method?.trim() || "לא צוין",
            },
          ]
        : [];
    })
    .sort(
      (a, b) =>
        b.amount - a.amount || a.name.localeCompare(b.name, "he") || a.id.localeCompare(b.id),
    );
}

type GiftBreakdownCents = { label: string; totalCents: number; groups: number };

export type GiftSummary = {
  total: number;
  giftedGroups: number;
  invitedPeopleInGiftedGroups: number;
  averagePerGiftedGroup: number;
  averagePerInvitedPerson: number | null;
  invalidGiftRows: number;
  invalidGroupSizeRows: number;
  bySide: GiftBreakdown[];
  byPaymentMethod: GiftBreakdown[];
};

function addBreakdown(map: Map<string, GiftBreakdownCents>, label: string, amountCents: number) {
  const current = map.get(label) ?? { label, totalCents: 0, groups: 0 };
  current.totalCents += amountCents;
  current.groups += 1;
  map.set(label, current);
}

function sortedBreakdown(map: Map<string, GiftBreakdownCents>): GiftBreakdown[] {
  return [...map.values()]
    .sort((a, b) => b.totalCents - a.totalCents || a.label.localeCompare(b.label, "he"))
    .map((item) => ({ label: item.label, total: item.totalCents / 100, groups: item.groups }));
}

/** Summarize recorded positive gifts. group_size remains the invited-person count. */
export function summarizeGifts(rows: readonly GiftSummaryInput[]): GiftSummary {
  let totalCents = 0;
  let giftedGroups = 0;
  let invitedPeopleInGiftedGroups = 0;
  let invalidGiftRows = 0;
  let invalidGroupSizeRows = 0;
  const side = new Map<string, GiftBreakdownCents>();
  const method = new Map<string, GiftBreakdownCents>();

  for (const row of rows) {
    const amountCents = recordedGiftCents(row.gift_amount);
    if (amountCents === "empty") continue;
    if (amountCents === "invalid") {
      invalidGiftRows += 1;
      continue;
    }
    const groupSize = Number(row.group_size);
    const validGroupSize = Number.isSafeInteger(groupSize) && groupSize >= 1;
    if (!Number.isSafeInteger(totalCents + amountCents)) {
      throw new RangeError("Gift total is too large");
    }
    totalCents += amountCents;
    giftedGroups += 1;
    if (validGroupSize) invitedPeopleInGiftedGroups += groupSize;
    else invalidGroupSizeRows += 1;
    addBreakdown(side, row.side?.trim() || "לא שויך", amountCents);
    addBreakdown(method, row.payment_method?.trim() || "לא צוין", amountCents);
  }

  const total = totalCents / 100;

  return {
    total,
    giftedGroups,
    invitedPeopleInGiftedGroups,
    averagePerGiftedGroup: giftedGroups ? total / giftedGroups : 0,
    averagePerInvitedPerson: invalidGroupSizeRows
      ? null
      : invitedPeopleInGiftedGroups
        ? total / invitedPeopleInGiftedGroups
        : 0,
    invalidGiftRows,
    invalidGroupSizeRows,
    bySide: sortedBreakdown(side),
    byPaymentMethod: sortedBreakdown(method),
  };
}
