import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  PLAN_CONFIG,
  currentExpiry,
  daysRemaining as getDaysRemaining,
  deriveStatus,
  type SubscriptionRow,
  type SubscriptionStatus,
} from "@/lib/subscription";

type SubscriptionData = {
  subscription: SubscriptionRow | null;
  expenseCount: number;
};

export type SubscriptionState = {
  subscription: SubscriptionRow | null;
  plan: string | null;
  status: SubscriptionStatus;
  expiresAt: string | null;
  daysRemaining: number;
  isTrialActive: boolean;
  isPremiumActive: boolean;
  isExpired: boolean;
  canEdit: boolean;
  expenseLimit: number | null;
  currentExpenseCount: number;
  canAddExpense: boolean;
  canUsePayments: boolean;
  canUseAttendance: boolean;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
};

export const subscriptionQueryKey = (eventId: string | null | undefined) =>
  ["subscription", eventId] as const;

export function useSubscription(eventId: string | null | undefined): SubscriptionState {
  const queryClient = useQueryClient();

  const query = useQuery<SubscriptionData, Error>({
    queryKey: subscriptionQueryKey(eventId),
    enabled: !!eventId,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      if (!eventId) return { subscription: null, expenseCount: 0 };

      const [subscriptionResult, expenseCountResult] = await Promise.all([
        supabase
          .from("subscriptions")
          .select(
            "id,event_id,plan,trial_started_at,trial_expires_at,premium_started_at,premium_expires_at",
          )
          .eq("event_id", eventId)
          .maybeSingle(),
        supabase
          .from("expenses")
          .select("id", { count: "exact", head: true })
          .eq("event_id", eventId),
      ]);

      if (subscriptionResult.error) throw subscriptionResult.error;
      if (expenseCountResult.error) throw expenseCountResult.error;

      return {
        subscription: (subscriptionResult.data as SubscriptionRow | null) ?? null,
        expenseCount: expenseCountResult.count ?? 0,
      };
    },
  });

  const refresh = useCallback(async () => {
    if (!eventId) return;
    await queryClient.invalidateQueries({ queryKey: subscriptionQueryKey(eventId) });
  }, [eventId, queryClient]);

  return useMemo<SubscriptionState>(() => {
    const subscription = query.data?.subscription ?? null;
    const currentExpenseCount = query.data?.expenseCount ?? 0;
    const status = deriveStatus(subscription);
    const expiresAt = currentExpiry(subscription);
    const remainingDays = getDaysRemaining(expiresAt);
    const isTrialActive = status === "trial_active";
    const isPremiumActive = status === "premium_active";
    const isExpired = status === "trial_expired" || status === "premium_expired";
    const canEdit = !query.isLoading && !query.error && (isTrialActive || isPremiumActive);
    const expenseLimit = isTrialActive ? PLAN_CONFIG.trialExpenseLimit : null;

    return {
      subscription,
      plan: subscription?.plan ?? null,
      status,
      expiresAt,
      daysRemaining: remainingDays,
      isTrialActive,
      isPremiumActive,
      isExpired,
      canEdit,
      expenseLimit,
      currentExpenseCount,
      canAddExpense:
        canEdit && (isPremiumActive || currentExpenseCount < PLAN_CONFIG.trialExpenseLimit),
      canUsePayments: canEdit && isPremiumActive,
      canUseAttendance: canEdit && isPremiumActive,
      loading: query.isLoading || query.isFetching,
      error: query.error ?? null,
      refresh,
    };
  }, [query.data, query.error, query.isFetching, query.isLoading, refresh]);
}
