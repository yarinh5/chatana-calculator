import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { summarizeInvitationGroups } from "@/lib/dashboard-overview";
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
      const { data, error } = await supabase.rpc("list_workspace_guests", { _event_id: eventId });
      if (error || data === null) throw error ?? new Error("Guest list unavailable");
      return summarizeInvitationGroups(data);
    },
  });

  const rsvp = useQuery({
    queryKey: ["dashboard-overview", userId, eventId, "rsvp"],
    enabled: !!eventId && !!userId && permissions.rsvp,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    queryFn: async () => {
      if (!eventId) throw new Error("Missing event");
      const { data, error } = await supabase.rpc("list_workspace_rsvps", { _event_id: eventId });
      if (error || data === null) throw error ?? new Error("RSVP list unavailable");
      return calculateRsvpStats(data);
    },
  });

  const vendors = useQuery({
    queryKey: ["dashboard-overview", userId, eventId, "vendors"],
    enabled: !!eventId && !!userId && permissions.vendors,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    queryFn: async () => {
      if (!eventId) throw new Error("Missing event");
      const { count, error } = await supabase
        .from("vendors")
        .select("id", { count: "exact", head: true })
        .eq("event_id", eventId);
      if (error || count === null) throw error ?? new Error("Vendor count unavailable");
      return count;
    },
  });

  return { guests, rsvp, vendors };
}
