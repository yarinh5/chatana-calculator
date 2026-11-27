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

export type GiftSummary = {
  total: number;
  giftedGroups: number;
  invitedPeopleInGiftedGroups: number;
  averagePerGiftedGroup: number;
  averagePerInvitedPerson: number;
  bySide: GiftBreakdown[];
  byPaymentMethod: GiftBreakdown[];
};

function addBreakdown(map: Map<string, GiftBreakdown>, label: string, amount: number) {
  const current = map.get(label) ?? { label, total: 0, groups: 0 };
  current.total += amount;
  current.groups += 1;
  map.set(label, current);
}

function sortedBreakdown(map: Map<string, GiftBreakdown>): GiftBreakdown[] {
  return [...map.values()].sort(
    (a, b) => b.total - a.total || a.label.localeCompare(b.label, "he"),
  );
}

/** Summarize recorded positive gifts. group_size remains the invited-person count. */
export function summarizeGifts(rows: readonly GiftSummaryInput[]): GiftSummary {
  let total = 0;
  let giftedGroups = 0;
  let invitedPeopleInGiftedGroups = 0;
  const side = new Map<string, GiftBreakdown>();
  const method = new Map<string, GiftBreakdown>();

  for (const row of rows) {
    const amount = Number(row.gift_amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const groupSize = Number(row.group_size);
    const invitedPeople = Number.isFinite(groupSize) && groupSize >= 1 ? groupSize : 1;
    total += amount;
    giftedGroups += 1;
    invitedPeopleInGiftedGroups += invitedPeople;
    addBreakdown(side, row.side?.trim() || "לא שויך", amount);
    addBreakdown(method, row.payment_method?.trim() || "לא צוין", amount);
  }

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
