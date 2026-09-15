import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import type { VendorInsert, VendorRow, VendorUpdate } from "@/lib/vendors";

type UseVendorsOptions = {
  canView: boolean;
  canEdit: boolean;
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
  const activeEventIdRef = useRef(eventId ?? null);
  const pendingRef = useRef(new Set<string>());
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());

  activeEventIdRef.current = eventId ?? null;

  const query = useQuery<VendorRow[], Error>({
    queryKey: vendorsQueryKey(userId, eventId),
    enabled: !!userId && !!eventId && canView,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      if (!eventId || !canView) return [];
      const requestEventId = eventId;
      const { data, error } = await supabase
        .from("vendors")
        .select(
          "id,event_id,business_name,contact_name,category,phone,whatsapp_phone,email,website,instagram,initial_quote,status,notes,created_at,updated_at",
        )
        .eq("event_id", requestEventId)
        .order("business_name", { ascending: true });
      if (error) throw error;
      if (activeEventIdRef.current !== requestEventId) return [];
      return (data ?? []) as VendorRow[];
    },
  });

  const hasData = !!query.data;

  const refresh = useCallback(async () => {
    if (!userId || !eventId || !canView) return;
    await queryClient.invalidateQueries({ queryKey: vendorsQueryKey(userId, eventId) });
  }, [canView, eventId, queryClient, userId]);

  const guardedMutation = useCallback(
    async <T>(key: string, action: () => Promise<T>): Promise<T | null> => {
      if (pendingRef.current.has(key)) return null;
      pendingRef.current.add(key);
      setPendingKeys(new Set(pendingRef.current));
      try {
        return await action();
      } finally {
        pendingRef.current.delete(key);
        setPendingKeys(new Set(pendingRef.current));
      }
    },
    [],
  );

  const addVendor = useCallback(
    async (payload: Omit<VendorInsert, "event_id">): Promise<boolean> => {
      if (!eventId || !canEdit) {
        toast.error("אין הרשאה לניהול ספקים");
        return false;
      }
      const requestEventId = eventId;
      const result = await guardedMutation("add", async () => {
        const { data, error } = await supabase
          .from("vendors")
          .insert({ ...payload, event_id: requestEventId })
          .select(
            "id,event_id,business_name,contact_name,category,phone,whatsapp_phone,email,website,instagram,initial_quote,status,notes,created_at,updated_at",
          )
          .single();
        if (error || !data) {
          if (activeEventIdRef.current === requestEventId) {
            toast.error("הוספת הספק נכשלה");
          }
          return false;
        }
        if (activeEventIdRef.current !== requestEventId) return false;
        queryClient.setQueryData<VendorRow[]>(
          vendorsQueryKey(userId, requestEventId),
          (current = EMPTY_VENDORS) =>
            [...current, data as VendorRow].sort((a, b) =>
              a.business_name.localeCompare(b.business_name, "he"),
            ),
        );
        try {
          await refresh();
        } catch {
          toast.warning("הספק נוסף, אבל הרענון נכשל. נסו לרענן ידנית.");
        }
        toast.success("הספק נוסף");
        return true;
      });
      return result === true;
    },
    [canEdit, eventId, guardedMutation, queryClient, refresh, userId],
  );

  const updateVendor = useCallback(
    async (id: string, patch: VendorUpdate): Promise<boolean> => {
      if (!eventId || !canEdit) {
        toast.error("אין הרשאה לניהול ספקים");
        return false;
      }
      const requestEventId = eventId;
      const result = await guardedMutation(`update:${id}`, async () => {
        const { data, error } = await supabase
          .from("vendors")
          .update(patch)
          .eq("id", id)
          .eq("event_id", requestEventId)
          .select(
            "id,event_id,business_name,contact_name,category,phone,whatsapp_phone,email,website,instagram,initial_quote,status,notes,created_at,updated_at",
          )
          .single();
        if (error || !data) {
          if (activeEventIdRef.current === requestEventId) {
            toast.error("שמירת הספק נכשלה");
            await safeRefresh(refresh);
          }
          return false;
        }
        if (activeEventIdRef.current !== requestEventId) return false;
        queryClient.setQueryData<VendorRow[]>(
          vendorsQueryKey(userId, requestEventId),
          (current = EMPTY_VENDORS) =>
            current
              .map((vendor) => (vendor.id === id ? (data as VendorRow) : vendor))
              .sort((a, b) => a.business_name.localeCompare(b.business_name, "he")),
        );
        try {
          await refresh();
        } catch {
          toast.warning("הספק נשמר, אבל הרענון נכשל. נסו לרענן ידנית.");
        }
        toast.success("הספק נשמר");
        return true;
      });
      return result === true;
    },
    [canEdit, eventId, guardedMutation, queryClient, refresh, userId],
  );

  const deleteVendor = useCallback(
    async (id: string): Promise<boolean> => {
      if (!eventId || !canEdit) {
        toast.error("אין הרשאה לניהול ספקים");
        return false;
      }
      const requestEventId = eventId;
      const result = await guardedMutation(`delete:${id}`, async () => {
        const { data, error } = await supabase
          .from("vendors")
          .delete()
          .eq("id", id)
          .eq("event_id", requestEventId)
          .select("id")
          .single();
        if (error || !data?.id) {
          if (activeEventIdRef.current === requestEventId) {
            toast.error("מחיקת הספק נכשלה");
            await safeRefresh(refresh);
          }
          return false;
        }
        if (activeEventIdRef.current !== requestEventId) return false;
        queryClient.setQueryData<VendorRow[]>(
          vendorsQueryKey(userId, requestEventId),
          (current = EMPTY_VENDORS) => current.filter((vendor) => vendor.id !== id),
        );
        try {
          await refresh();
        } catch {
          toast.warning("הספק נמחק, אבל הרענון נכשל. נסו לרענן ידנית.");
        }
        toast.success("הספק נמחק וההוצאות המקושרות נשמרו");
        return true;
      });
      return result === true;
    },
    [canEdit, eventId, guardedMutation, queryClient, refresh, userId],
  );

  const isPending = useCallback((key: string) => pendingKeys.has(key), [pendingKeys]);

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
      mutationPending: pendingKeys.size > 0,
    }),
    [
      addVendor,
      canView,
      deleteVendor,
      hasData,
      isPending,
      pendingKeys.size,
      query.data,
      query.error,
      query.isFetching,
      query.isLoading,
      refresh,
      updateVendor,
    ],
  );
}

async function safeRefresh(refresh: () => Promise<void>) {
  try {
    await refresh();
  } catch {
    // Keep the user's draft/dialog state; the caller already reports the write failure.
  }
}
