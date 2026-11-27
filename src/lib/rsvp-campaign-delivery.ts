/** Server-side delivery lifecycle contract. Contains no recipient data or RSVP token. */
export type CampaignDeliveryStatus =
  "queued" | "sent" | "delivered" | "read" | "failed" | "cancelled";

export type CampaignDeliveryState = {
  status: CampaignDeliveryStatus;
  /** Starts at one. A retry creates a new provider attempt. */
  attempt: number;
};

export type CampaignDeliveryEvent =
  | {
      kind: "provider_sent" | "provider_delivered" | "provider_read" | "provider_failed";
      attempt: number;
    }
  | { kind: "retry" }
  | { kind: "cancel" };

export type CampaignDeliveryResult = {
  state: CampaignDeliveryState;
  applied: boolean;
  reason?: "stale_attempt" | "duplicate_or_regression" | "invalid_transition";
};

/**
 * Keeps delivery receipts monotonic and ignores receipts from superseded attempts.
 * The queue, consent, price approval, provider signature and audit remain server responsibilities.
 */
export function applyCampaignDeliveryEvent(
  state: CampaignDeliveryState,
  event: CampaignDeliveryEvent,
): CampaignDeliveryResult {
  if (!Number.isSafeInteger(state.attempt) || state.attempt < 1)
    throw new Error("Invalid delivery attempt");

  if (event.kind === "retry") {
    if (state.status !== "failed") return { state, applied: false, reason: "invalid_transition" };
    return { state: { status: "queued", attempt: state.attempt + 1 }, applied: true };
  }

  if (event.kind === "cancel") {
    if (state.status !== "queued" && state.status !== "failed")
      return { state, applied: false, reason: "invalid_transition" };
    return { state: { ...state, status: "cancelled" }, applied: true };
  }

  if (event.attempt !== state.attempt) return { state, applied: false, reason: "stale_attempt" };
  if (state.status === "cancelled" || state.status === "failed")
    return { state, applied: false, reason: "invalid_transition" };

  const target: CampaignDeliveryStatus =
    event.kind === "provider_sent"
      ? "sent"
      : event.kind === "provider_delivered"
        ? "delivered"
        : event.kind === "provider_read"
          ? "read"
          : "failed";

  if (target === "failed") {
    if (state.status !== "queued" && state.status !== "sent")
      return { state, applied: false, reason: "invalid_transition" };
  } else {
    const rank = { queued: 0, sent: 1, delivered: 2, read: 3 } as const;
    if (rank[target] <= rank[state.status])
      return { state, applied: false, reason: "duplicate_or_regression" };
  }

  return { state: { ...state, status: target }, applied: true };
}
