export type GiftSummaryInput = {
  gift_amount: number | string | null;
  group_size: number | null;
  side: string | null;
  payment_method: string | null;
};

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
  averagePerInvitedPerson: number;
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
  const side = new Map<string, GiftBreakdownCents>();
  const method = new Map<string, GiftBreakdownCents>();

  for (const row of rows) {
    const amount = Number(row.gift_amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const amountCents = Math.round(amount * 100);
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) continue;
    const groupSize = Number(row.group_size);
    const invitedPeople = Number.isFinite(groupSize) && groupSize >= 1 ? groupSize : 1;
    totalCents += amountCents;
    giftedGroups += 1;
    invitedPeopleInGiftedGroups += invitedPeople;
    addBreakdown(side, row.side?.trim() || "לא שויך", amountCents);
    addBreakdown(method, row.payment_method?.trim() || "לא צוין", amountCents);
  }

  const total = totalCents / 100;

  return {
    total,
    giftedGroups,
    invitedPeopleInGiftedGroups,
    averagePerGiftedGroup: giftedGroups ? total / giftedGroups : 0,
    averagePerInvitedPerson: invitedPeopleInGiftedGroups ? total / invitedPeopleInGiftedGroups : 0,
    bySide: sortedBreakdown(side),
    byPaymentMethod: sortedBreakdown(method),
  };
}
