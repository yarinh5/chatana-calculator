import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  allOverviewRows,
  summarizeInvitationGroups,
  summarizeVendorCounts,
} from "@/lib/dashboard-overview";
import { calculateRsvpStats } from "@/lib/rsvp";

type OverviewPermissions = { guests: boolean; rsvp: boolean; vendors: boolean };

export function useDashboardOverview(
  eventId: string | null,
  userId: string | null,
  permissions: OverviewPermissions,
) {
  const guests = useQuery({
    queryKey: ["dashboard-overview", userId, eventId, "guests"],
    enabled: !!eventId && !!userId && permissions.guests,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    queryFn: async () => {
      if (!eventId) throw new Error("Missing event");
      const rows = await allOverviewRows((from, to) =>
        supabase
          .rpc("list_workspace_guests", { _event_id: eventId }, { count: "exact" })
          .select("id,group_size")
          .order("id")
          .range(from, to),
      );
      return summarizeInvitationGroups(rows);
    },
  });

  const rsvp = useQuery({
    queryKey: ["dashboard-overview", userId, eventId, "rsvp"],
    enabled: !!eventId && !!userId && permissions.rsvp,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    queryFn: async () => {
      if (!eventId) throw new Error("Missing event");
      const rows = await allOverviewRows((from, to) =>
        supabase
          .rpc("list_workspace_rsvps", { _event_id: eventId }, { count: "exact" })
          .select("guest_id,group_size,status,confirmed_count")
          .order("guest_id")
          .range(from, to),
      );
      return calculateRsvpStats(rows);
    },
  });

  const vendors = useQuery({
    queryKey: ["dashboard-overview", userId, eventId, "vendors"],
    enabled: !!eventId && !!userId && permissions.vendors,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    queryFn: async () => {
      if (!eventId) throw new Error("Missing event");
      const counts = await Promise.all(
        ([null, "booked", "cancelled"] as const).map(async (status) => {
          let query = supabase
            .from("vendors")
            .select("id", { count: "exact", head: true })
            .eq("event_id", eventId);
          if (status !== null) query = query.eq("status", status);
          const { count, error } = await query;
          if (error || count === null) throw error ?? new Error("Vendor count unavailable");
          return count;
        }),
      );
      return summarizeVendorCounts(counts[0], counts[1], counts[2]);
    },
  });

  return { guests, rsvp, vendors };
}
