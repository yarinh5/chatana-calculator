import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type GuestSide = "חתן" | "כלה" | "משותף";
export type PaymentMethod = "מזומן" | "העברה" | "צ'ק" | "אפליקציה" | "לא ידוע";

export const SIDES: GuestSide[] = ["חתן", "כלה", "משותף"];
export const PAYMENT_METHODS: PaymentMethod[] = ["מזומן", "העברה", "צ'ק", "אפליקציה", "לא ידוע"];

type GuestRow = Database["public"]["Tables"]["guests"]["Row"];
type GuestInsert = Database["public"]["Tables"]["guests"]["Insert"];

export type Guest = Omit<GuestRow, "payment_method" | "side"> & {
  side: GuestSide | null;
  payment_method: PaymentMethod | null;
};

export type NewGuest = Omit<GuestInsert, "event_id" | "id" | "created_at" | "updated_at"> & {
  side?: GuestSide | null;
  payment_method?: PaymentMethod | null;
};

export type GuestFilter = "all" | "arrived" | "not_arrived" | "pending" | GuestSide;

export function useGuests(
  eventId: string | null,
  readOnly = false,
  extraSearchByGuestId: Record<string, string> = {},
) {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState<GuestFilter>("all");

  const loadGuests = useCallback(async () => {
    if (!eventId) {
      setGuests([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("guests")
      .select("*")
      .eq("event_id", eventId)
      .order("full_name");
    if (error) {
      toast.error("שגיאה בטעינת רשימת המוזמנים");
    } else {
      setGuests((data ?? []) as unknown as Guest[]);
    }
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    if (!eventId) return;
    setLoading(true);
    loadGuests();
    const channel = supabase
      .channel(`guests-${eventId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "guests", filter: `event_id=eq.${eventId}` },
        () => loadGuests(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId, loadGuests]);

  const filteredGuests = useMemo(() => {
    const term = searchTerm.trim();
    return guests
      .filter((g) =>
        term
          ? [
              g.full_name,
              g.phone,
              g.group_category,
              g.relationship,
              g.pickup_location,
              extraSearchByGuestId[g.id],
            ]
              .filter(Boolean)
              .some((value) => String(value).includes(term))
          : true,
      )
      .filter((g) => {
        if (filter === "arrived") return g.arrived === true;
        if (filter === "not_arrived") return g.arrived === false;
        if (filter === "pending") return g.arrived === null;
        if (filter === "חתן" || filter === "כלה" || filter === "משותף") return g.side === filter;
        return true;
      });
  }, [extraSearchByGuestId, guests, searchTerm, filter]);

  const stats = useMemo(() => {
    const totalInvited = guests.reduce((s, g) => s + (g.group_size || 1), 0);
    const arrivedCount = guests
      .filter((g) => g.arrived)
      .reduce((s, g) => s + (g.arrived_count ?? g.group_size ?? 1), 0);
    const totalGifts = guests.reduce((s, g) => s + Number(g.gift_amount || 0), 0);
    const withGift = guests.filter((g) => g.arrived && Number(g.gift_amount) > 0);
    const avgGift = withGift.length
      ? withGift.reduce((s, g) => s + Number(g.gift_amount), 0) / withGift.length
      : 0;
    return {
      totalInvited,
      arrivedCount,
      totalGifts,
      avgGift,
      arrivedRate: totalInvited ? Math.round((arrivedCount / totalInvited) * 100) : 0,
      groups: guests.length,
    };
  }, [guests]);

  const guard = () => {
    if (readOnly) {
      toast.error("מצב צפייה בלבד");
      return true;
    }
    return false;
  };

  const addGuest = async (guest: NewGuest): Promise<boolean> => {
    if (!eventId || guard()) return false;
    const { data, error } = await supabase
      .from("guests")
      .insert({ ...guest, event_id: eventId })
      .select()
      .single();
    if (error) {
      toast.error("הוספת האורח נכשלה");
      return false;
    }
    setGuests((prev) => [...prev, data as unknown as Guest]);
    toast.success("האורח נוסף");
    return true;
  };

  const updateGuest = async (id: string, updates: Partial<Guest>): Promise<boolean> => {
    if (guard()) return false;
    setGuests((prev) => prev.map((g) => (g.id === id ? { ...g, ...updates } : g)));
    const { data, error } = await supabase
      .from("guests")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) {
      toast.error("העדכון נכשל");
      await loadGuests();
      return false;
    }
    setGuests((prev) => prev.map((g) => (g.id === id ? (data as unknown as Guest) : g)));
    return true;
  };

  const deleteGuest = async (id: string): Promise<boolean> => {
    if (guard()) return false;
    setGuests((prev) => prev.filter((g) => g.id !== id));
    const { error } = await supabase.from("guests").delete().eq("id", id);
    if (error) {
      toast.error("המחיקה נכשלה");
      await loadGuests();
      return false;
    }
    return true;
  };

  const importGuests = async (list: NewGuest[]): Promise<boolean> => {
    if (!eventId || guard() || list.length === 0) return false;
    const rows = list.map((g) => ({ ...g, event_id: eventId }));
    const { data, error } = await supabase.from("guests").insert(rows).select();
    if (error) {
      toast.error("הייבוא נכשל");
      return false;
    }
    setGuests((prev) => [...prev, ...((data ?? []) as unknown as Guest[])]);
    toast.success(`יובאו ${data?.length ?? 0} אורחים`);
    return true;
  };

  return {
    allGuests: guests,
    guests: filteredGuests,
    loading,
    stats,
    searchTerm,
    setSearchTerm,
    filter,
    setFilter,
    addGuest,
    updateGuest,
    deleteGuest,
    importGuests,
    reload: loadGuests,
  };
}
