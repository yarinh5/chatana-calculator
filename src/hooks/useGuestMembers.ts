import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

export function useGuestMembers(eventId: string | null) {
  const [members, setMembers] = useState<GuestMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadSeq = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++loadSeq.current;
    if (!eventId) {
      setMembers([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    const { data, error: loadError } = await supabase.rpc("list_workspace_guest_members", {
      _event_id: eventId,
    });

    if (requestId !== loadSeq.current) return;
    if (loadError) {
      setError(loadError.message);
      toast.error("טעינת פירוט המוזמנים נכשלה");
      setLoading(false);
      return;
    }

    setMembers((data ?? []) as GuestMember[]);
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    setMembers([]);
    setError(null);
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
      try {
        const { data, error: addError } = await supabase
          .from("guest_members")
          .insert({ ...values, guest_id: guestId, position: values.position ?? nextPosition })
          .select()
          .single();

        if (addError) throw addError;

        setMembers((prev) => [...prev, data as GuestMember]);
        return true;
      } catch {
        toast.error("הוספת משתתף נכשלה");
        await refresh();
        return false;
      }
    },
    [membersByGuest, refresh],
  );

  const updateMember = useCallback(
    async (id: string, updates: GuestMemberUpdate) => {
      try {
        const { data, error: updateError } = await supabase
          .from("guest_members")
          .update(updates)
          .eq("id", id)
          .select()
          .single();

        if (updateError) throw updateError;

        setMembers((prev) =>
          prev.map((member) => (member.id === id ? (data as GuestMember) : member)),
        );
        return true;
      } catch {
        toast.error("עדכון משתתף נכשל");
        await refresh();
        return false;
      }
    },
    [refresh],
  );

  const deleteMember = useCallback(
    async (id: string) => {
      try {
        const { data, error: deleteError } = await supabase
          .from("guest_members")
          .delete()
          .eq("id", id)
          .select("id")
          .single();
        if (deleteError) throw deleteError;
        if (!data?.id) throw new Error("No member was deleted");
        setMembers((prev) => prev.filter((member) => member.id !== id));
        return true;
      } catch {
        toast.error("מחיקת משתתף נכשלה");
        await refresh();
        return false;
      }
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
