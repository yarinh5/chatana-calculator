import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import type { VendorInsert, VendorRow, VendorUpdate } from "@/lib/vendors";

type UseVendorsOptions = {
  canView: boolean;
  canEdit: boolean;
};

type VendorLifecycleContext = {
  eventId: string;
  userId: string | null;
  version: number;
};

const EMPTY_VENDORS: VendorRow[] = [];

export const vendorsQueryKey = (
  userId: string | null | undefined,
  eventId: string | null | undefined,
) => ["vendors", userId ?? "anonymous", eventId ?? "none"] as const;

export function useVendors(
  eventId: string | null | undefined,
  { canView, canEdit }: UseVendorsOptions,
) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();
  const lifecycleRef = useRef({
    eventId: eventId ?? null,
    mounted: true,
    userId,
    version: 0,
  });
  const pendingRef = useRef(new Set<string>());
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());

  if (
    lifecycleRef.current.eventId !== (eventId ?? null) ||
    lifecycleRef.current.userId !== userId
  ) {
    lifecycleRef.current = {
      eventId: eventId ?? null,
      mounted: true,
      userId,
      version: lifecycleRef.current.version + 1,
    };
  }

  useEffect(() => {
    lifecycleRef.current.mounted = true;
    return () => {
      lifecycleRef.current.mounted = false;
      lifecycleRef.current.version += 1;
    };
  }, []);

  const createLifecycleContext = useCallback(
    (requestEventId: string): VendorLifecycleContext => ({
      eventId: requestEventId,
      userId,
      version: lifecycleRef.current.version,
    }),
    [userId],
  );

  const isLifecycleActive = useCallback(
    (context: VendorLifecycleContext) =>
      lifecycleRef.current.mounted &&
      lifecycleRef.current.eventId === context.eventId &&
      lifecycleRef.current.userId === context.userId &&
      lifecycleRef.current.version === context.version,
    [],
  );

  const scopedPendingKey = useCallback((key: string, context?: VendorLifecycleContext) => {
    const version = context?.version ?? lifecycleRef.current.version;
    return `${version}:${key}`;
  }, []);

  const query = useQuery<VendorRow[], Error>({
    queryKey: vendorsQueryKey(userId, eventId),
    enabled: !!userId && !!eventId && canView,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      if (!eventId || !canView) return [];
      const requestEventId = eventId;
      const requestContext = createLifecycleContext(requestEventId);
      const { data, error } = await supabase
        .from("vendors")
        .select(
          "id,event_id,business_name,contact_name,category,phone,whatsapp_phone,email,website,instagram,initial_quote,status,notes,created_at,updated_at",
        )
        .eq("event_id", requestEventId)
        .order("business_name", { ascending: true });
      if (error) throw error;
      if (!isLifecycleActive(requestContext)) return [];
      return (data ?? []) as VendorRow[];
    },
  });

  const hasData = !!query.data;

  const refresh = useCallback(async () => {
    if (!userId || !eventId || !canView) return;
    await queryClient.invalidateQueries({ queryKey: vendorsQueryKey(userId, eventId) });
  }, [canView, eventId, queryClient, userId]);

  const guardedMutation = useCallback(
    async <T>(
      key: string,
      context: VendorLifecycleContext,
      action: () => Promise<T>,
    ): Promise<T | null> => {
      const pendingKey = scopedPendingKey(key, context);
      if (pendingRef.current.has(pendingKey)) return null;
      pendingRef.current.add(pendingKey);
      if (lifecycleRef.current.mounted) setPendingKeys(new Set(pendingRef.current));
      try {
        return await action();
      } finally {
        pendingRef.current.delete(pendingKey);
        if (lifecycleRef.current.mounted) setPendingKeys(new Set(pendingRef.current));
      }
    },
    [scopedPendingKey],
  );

  const addVendor = useCallback(
    async (payload: Omit<VendorInsert, "event_id">): Promise<boolean> => {
      if (!eventId || !canEdit) {
        toast.error("אין הרשאה לניהול ספקים");
        return false;
      }
      const requestEventId = eventId;
      const requestContext = createLifecycleContext(requestEventId);
      const result = await guardedMutation("add", requestContext, async () => {
        const { data, error } = await supabase
          .from("vendors")
          .insert({ ...payload, event_id: requestEventId })
          .select(
            "id,event_id,business_name,contact_name,category,phone,whatsapp_phone,email,website,instagram,initial_quote,status,notes,created_at,updated_at",
          )
          .single();
        if (!isLifecycleActive(requestContext)) return false;
        if (error || !data) {
          toast.error("הוספת הספק נכשלה");
          return false;
        }
        queryClient.setQueryData<VendorRow[]>(
          vendorsQueryKey(userId, requestEventId),
          (current = EMPTY_VENDORS) =>
            [...current, data as VendorRow].sort((a, b) =>
              a.business_name.localeCompare(b.business_name, "he"),
            ),
        );
        try {
          await refresh();
          if (!isLifecycleActive(requestContext)) return false;
        } catch {
          if (!isLifecycleActive(requestContext)) return false;
          toast.warning("הספק נוסף, אבל הרענון נכשל. נסו לרענן ידנית.");
        }
        if (!isLifecycleActive(requestContext)) return false;
        toast.success("הספק נוסף");
        return true;
      });
      return result === true;
    },
    [
      canEdit,
      createLifecycleContext,
      eventId,
      guardedMutation,
      isLifecycleActive,
      queryClient,
      refresh,
      userId,
    ],
  );

  const updateVendor = useCallback(
    async (id: string, patch: VendorUpdate): Promise<boolean> => {
      if (!eventId || !canEdit) {
        toast.error("אין הרשאה לניהול ספקים");
        return false;
      }
      const requestEventId = eventId;
      const requestContext = createLifecycleContext(requestEventId);
      const result = await guardedMutation(`update:${id}`, requestContext, async () => {
        const { data, error } = await supabase
          .from("vendors")
          .update(patch)
          .eq("id", id)
          .eq("event_id", requestEventId)
          .select(
            "id,event_id,business_name,contact_name,category,phone,whatsapp_phone,email,website,instagram,initial_quote,status,notes,created_at,updated_at",
          )
          .single();
        if (!isLifecycleActive(requestContext)) return false;
        if (error || !data) {
          toast.error("שמירת הספק נכשלה");
          await safeRefresh(refresh, requestContext, isLifecycleActive);
          return false;
        }
        queryClient.setQueryData<VendorRow[]>(
          vendorsQueryKey(userId, requestEventId),
          (current = EMPTY_VENDORS) =>
            current
              .map((vendor) => (vendor.id === id ? (data as VendorRow) : vendor))
              .sort((a, b) => a.business_name.localeCompare(b.business_name, "he")),
        );
        try {
          await refresh();
          if (!isLifecycleActive(requestContext)) return false;
        } catch {
          if (!isLifecycleActive(requestContext)) return false;
          toast.warning("הספק נשמר, אבל הרענון נכשל. נסו לרענן ידנית.");
        }
        if (!isLifecycleActive(requestContext)) return false;
        toast.success("הספק נשמר");
        return true;
      });
      return result === true;
    },
    [
      canEdit,
      createLifecycleContext,
      eventId,
      guardedMutation,
      isLifecycleActive,
      queryClient,
      refresh,
      userId,
    ],
  );

  const deleteVendor = useCallback(
    async (id: string): Promise<boolean> => {
      if (!eventId || !canEdit) {
        toast.error("אין הרשאה לניהול ספקים");
        return false;
      }
      const requestEventId = eventId;
      const requestContext = createLifecycleContext(requestEventId);
      const result = await guardedMutation(`delete:${id}`, requestContext, async () => {
        const { data, error } = await supabase
          .from("vendors")
          .delete()
          .eq("id", id)
          .eq("event_id", requestEventId)
          .select("id")
          .single();
        if (!isLifecycleActive(requestContext)) return false;
        if (error || !data?.id) {
          toast.error("מחיקת הספק נכשלה");
          await safeRefresh(refresh, requestContext, isLifecycleActive);
          return false;
        }
        queryClient.setQueryData<VendorRow[]>(
          vendorsQueryKey(userId, requestEventId),
          (current = EMPTY_VENDORS) => current.filter((vendor) => vendor.id !== id),
        );
        try {
          await refresh();
          if (!isLifecycleActive(requestContext)) return false;
        } catch {
          if (!isLifecycleActive(requestContext)) return false;
          toast.warning("הספק נמחק, אבל הרענון נכשל. נסו לרענן ידנית.");
        }
        if (!isLifecycleActive(requestContext)) return false;
        toast.success("הספק נמחק וההוצאות המקושרות נשמרו");
        return true;
      });
      return result === true;
    },
    [
      canEdit,
      createLifecycleContext,
      eventId,
      guardedMutation,
      isLifecycleActive,
      queryClient,
      refresh,
      userId,
    ],
  );

  const isPending = useCallback(
    (key: string) => pendingKeys.has(scopedPendingKey(key)),
    [pendingKeys, scopedPendingKey],
  );
  const currentPendingPrefix = `${lifecycleRef.current.version}:`;
  const currentPendingSize = Array.from(pendingKeys).filter((key) =>
    key.startsWith(currentPendingPrefix),
  ).length;

  return useMemo(
    () => ({
      vendors: canView ? (query.data ?? EMPTY_VENDORS) : EMPTY_VENDORS,
      loading: query.isLoading && !hasData,
      refreshing: query.isFetching && hasData,
      error: query.error && !hasData ? query.error : null,
      refresh,
      addVendor,
      updateVendor,
      deleteVendor,
      isPending,
      mutationPending: currentPendingSize > 0,
    }),
    [
      addVendor,
      canView,
      currentPendingSize,
      deleteVendor,
      hasData,
      isPending,
      query.data,
      query.error,
      query.isFetching,
      query.isLoading,
      refresh,
      updateVendor,
    ],
  );
}

async function safeRefresh(
  refresh: () => Promise<void>,
  context: VendorLifecycleContext,
  isLifecycleActive: (context: VendorLifecycleContext) => boolean,
) {
  try {
    await refresh();
  } catch {
    // Keep the user's draft/dialog state; the caller already reports the write failure.
  }
  return isLifecycleActive(context);
}
