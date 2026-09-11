import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type GuestMember = Database["public"]["Tables"]["guest_members"]["Row"];
export type NewGuestMember = Omit<
  Database["public"]["Tables"]["guest_members"]["Insert"],
  "guest_id" | "id" | "created_at" | "updated_at"
>;
export type GuestMemberUpdate = Omit<
  Database["public"]["Tables"]["guest_members"]["Update"],
  "guest_id" | "id" | "created_at" | "updated_at"
>;

type GuestMemberWithJoin = GuestMember & { guests?: { event_id: string } | null };

export function useGuestMembers(eventId: string | null) {
  const [members, setMembers] = useState<GuestMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!eventId) {
      setMembers([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    const { data, error: loadError } = await supabase
      .from("guest_members")
      .select("*, guests!inner(event_id)")
      .eq("guests.event_id", eventId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });

    if (loadError) {
      setError(loadError.message);
      toast.error("טעינת פירוט המוזמנים נכשלה");
      setLoading(false);
      return;
    }

    setMembers(
      ((data ?? []) as GuestMemberWithJoin[]).map(({ guests: _guests, ...member }) => member),
    );
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const membersByGuest = useMemo(
    () =>
      members.reduce<Record<string, GuestMember[]>>((acc, member) => {
        acc[member.guest_id] = [...(acc[member.guest_id] ?? []), member];
        return acc;
      }, {}),
    [members],
  );

  const addMember = useCallback(
    async (guestId: string, values: NewGuestMember = {}) => {
      const nextPosition = (membersByGuest[guestId]?.length ?? 0) + 1;
      const { data, error: addError } = await supabase
        .from("guest_members")
        .insert({ ...values, guest_id: guestId, position: values.position ?? nextPosition })
        .select()
        .single();

      if (addError) {
        toast.error("הוספת משתתף נכשלה");
        await refresh();
        return false;
      }

      setMembers((prev) => [...prev, data as GuestMember]);
      return true;
    },
    [membersByGuest, refresh],
  );

  const updateMember = useCallback(
    async (id: string, updates: GuestMemberUpdate) => {
      const { data, error: updateError } = await supabase
        .from("guest_members")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (updateError) {
        toast.error("עדכון משתתף נכשל");
        await refresh();
        return false;
      }

      setMembers((prev) =>
        prev.map((member) => (member.id === id ? (data as GuestMember) : member)),
      );
      return true;
    },
    [refresh],
  );

  const deleteMember = useCallback(
    async (id: string) => {
      const { error: deleteError } = await supabase.from("guest_members").delete().eq("id", id);

      if (deleteError) {
        toast.error("מחיקת משתתף נכשלה");
        await refresh();
        return false;
      }

      setMembers((prev) => prev.filter((member) => member.id !== id));
      return true;
    },
    [refresh],
  );

  return {
    members,
    membersByGuest,
    loading,
    error,
    refresh,
    addMember,
    updateMember,
    deleteMember,
  };
}
