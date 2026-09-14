import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { calculateRsvpStats, type RsvpRow, type RsvpStatus } from "@/lib/rsvp";

type RsvpSettings = {
  rsvp_collect_dietary: boolean;
};

const rowsKey = (eventId: string | null | undefined) => ["rsvp", eventId, "rows"] as const;
const settingsKey = (eventId: string | null | undefined) => ["rsvp", eventId, "settings"] as const;
const EMPTY_RSVP_ROWS: RsvpRow[] = [];

export function useRsvp(eventId: string | null | undefined) {
  const queryClient = useQueryClient();
  const pendingContactRef = useRef(new Set<string>());
  const [pendingContactKeys, setPendingContactKeys] = useState<Set<string>>(new Set());

  const rowsQuery = useQuery<RsvpRow[], Error>({
    queryKey: rowsKey(eventId),
    enabled: !!eventId,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    queryFn: async () => {
      if (!eventId) return [];
      const { data, error } = await supabase.rpc("list_workspace_rsvps", { _event_id: eventId });
      if (error) throw error;
      return (data ?? []) as RsvpRow[];
    },
  });

  const settingsQuery = useQuery<RsvpSettings, Error>({
    queryKey: settingsKey(eventId),
    enabled: !!eventId,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      if (!eventId) return { rsvp_collect_dietary: false };
      const { data, error } = await supabase
        .rpc("get_workspace_rsvp_settings", { _event_id: eventId })
        .maybeSingle();
      if (error) throw error;
      return { rsvp_collect_dietary: data?.rsvp_collect_dietary ?? false };
    },
  });

  const invalidate = useCallback(async () => {
    if (!eventId) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: rowsKey(eventId) }),
      queryClient.invalidateQueries({ queryKey: settingsKey(eventId) }),
    ]);
  }, [eventId, queryClient]);

  const refresh = useCallback(async () => {
    if (!eventId) return;
    await Promise.all([rowsQuery.refetch(), settingsQuery.refetch()]);
  }, [eventId, rowsQuery, settingsQuery]);

  const setState = useCallback(
    async (args: {
      guestId: string;
      status: RsvpStatus;
      confirmedCount: number | null;
      note?: string | null;
      dietaryNotes?: string | null;
    }) => {
      const { data, error } = await supabase.rpc("set_guest_rsvp_state", {
        _confirmed_count: args.confirmedCount,
        _dietary_notes: args.dietaryNotes,
        _guest_id: args.guestId,
        _note: args.note,
        _status: args.status,
      });
      if (error || !data?.[0]) {
        toast.error("עדכון אישור ההגעה נכשל");
        await refresh();
        return false;
      }
      await invalidate();
      toast.success("אישור ההגעה עודכן");
      return true;
    },
    [invalidate, refresh],
  );

  const markContact = useCallback(
    async (guestId: string) =>
      guardedMarkContactMutation(
        guestId,
        "contact",
        pendingContactRef,
        setPendingContactKeys,
        invalidate,
        refresh,
      ),
    [invalidate, refresh],
  );

  const markReminder = useCallback(
    async (guestId: string) =>
      guardedMarkContactMutation(
        guestId,
        "reminder",
        pendingContactRef,
        setPendingContactKeys,
        invalidate,
        refresh,
      ),
    [invalidate, refresh],
  );

  const issueLink = useCallback(
    async (guestId: string) => {
      const { data, error } = await supabase.rpc("issue_guest_rsvp_link", { _guest_id: guestId });
      const row = data?.[0];
      if (error || !row?.token) {
        toast.error("יצירת הקישור נכשלה");
        await refresh();
        return null;
      }
      await invalidate();
      return row;
    },
    [invalidate, refresh],
  );

  const revokeLink = useCallback(
    async (guestId: string) => {
      const { data, error } = await supabase.rpc("revoke_guest_rsvp_link", {
        _guest_id: guestId,
      });
      if (error || data !== true) {
        toast.error("ביטול הקישור נכשל");
        await refresh();
        return false;
      }
      await invalidate();
      toast.success("הקישור בוטל");
      return true;
    },
    [invalidate, refresh],
  );

  const updateSettings = useCallback(
    async (collectDietary: boolean) => {
      if (!eventId) return false;
      const { data, error } = await supabase.rpc("set_workspace_rsvp_settings", {
        _event_id: eventId,
        _rsvp_collect_dietary: collectDietary,
      });
      if (error || !data?.[0]) {
        toast.error("שמירת הגדרות RSVP נכשלה");
        await refresh();
        return false;
      }
      await invalidate();
      toast.success("ההגדרות נשמרו");
      return true;
    },
    [eventId, invalidate, refresh],
  );

  const rows = rowsQuery.data ?? EMPTY_RSVP_ROWS;
  const hasRowsData = !!rowsQuery.data;
  const hasSettingsData = !!settingsQuery.data;
  const fatalError =
    (rowsQuery.error && !hasRowsData) || (settingsQuery.error && !hasSettingsData)
      ? (rowsQuery.error ?? settingsQuery.error)
      : null;
  const isContactPending = useCallback(
    (guestId: string, type: "contact" | "reminder") =>
      pendingContactKeys.has(contactActionKey(guestId, type)),
    [pendingContactKeys],
  );

  return useMemo(
    () => ({
      rows,
      settings: settingsQuery.data ?? { rsvp_collect_dietary: false },
      stats: calculateRsvpStats(rows),
      loading:
        (rowsQuery.isLoading && !hasRowsData) || (settingsQuery.isLoading && !hasSettingsData),
      refreshing:
        (rowsQuery.isFetching && hasRowsData) || (settingsQuery.isFetching && hasSettingsData),
      error: fatalError,
      refresh,
      setState,
      markContact,
      markReminder,
      isContactPending,
      issueLink,
      revokeLink,
      updateSettings,
    }),
    [
      fatalError,
      hasRowsData,
      hasSettingsData,
      issueLink,
      isContactPending,
      markContact,
      markReminder,
      refresh,
      revokeLink,
      rows,
      rowsQuery.isFetching,
      rowsQuery.isLoading,
      setState,
      settingsQuery.data,
      settingsQuery.isFetching,
      settingsQuery.isLoading,
      updateSettings,
    ],
  );
}

function contactActionKey(guestId: string, type: "contact" | "reminder") {
  return `${type}:${guestId}`;
}

async function guardedMarkContactMutation(
  guestId: string,
  type: "contact" | "reminder",
  pendingRef: MutableRefObject<Set<string>>,
  setPendingKeys: Dispatch<SetStateAction<Set<string>>>,
  invalidate: () => Promise<void>,
  refresh: () => Promise<void>,
) {
  const key = contactActionKey(guestId, type);
  if (pendingRef.current.has(key)) return false;
  pendingRef.current.add(key);
  setPendingKeys(new Set(pendingRef.current));
  try {
    const { data, error } = await supabase.rpc("mark_guest_rsvp_contact", {
      _contact_type: type,
      _guest_id: guestId,
    });
    if (error || !data?.[0]) {
      toast.error("סימון יצירת הקשר נכשל");
      await refresh();
      return false;
    }
    await invalidate();
    toast.success(type === "reminder" ? "סומן תזכורת" : "סומן שנוצר קשר");
    return true;
  } catch {
    toast.error("סימון יצירת הקשר נכשל");
    await refresh();
    return false;
  } finally {
    pendingRef.current.delete(key);
    setPendingKeys(new Set(pendingRef.current));
  }
}
