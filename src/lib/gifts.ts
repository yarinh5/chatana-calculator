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
    if (row.gift_amount === null) continue;
    const amount = Number(row.gift_amount);
    if (amount === 0) continue;
    if (!Number.isFinite(amount) || amount < 0) {
      invalidGiftRows += 1;
      continue;
    }
    const amountCents = Math.round(amount * 100);
    if (
      !Number.isSafeInteger(amountCents) ||
      amountCents <= 0 ||
      Math.abs(amount * 100 - amountCents) > 1e-7
    ) {
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
