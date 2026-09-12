import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type GuestSide = "חתן" | "כלה" | "משותף";
export type PaymentMethod = "מזומן" | "העברה" | "צ'ק" | "אפליקציה" | "לא ידוע";

export const SIDES: GuestSide[] = ["חתן", "כלה", "משותף"];
export const PAYMENT_METHODS: PaymentMethod[] = ["מזומן", "העברה", "צ'ק", "אפליקציה", "לא ידוע"];

type GuestRow = Database["public"]["Tables"]["guests"]["Row"];
type GuestInsert = Database["public"]["Tables"]["guests"]["Insert"];
type WorkspaceGuestRow =
  Database["public"]["Functions"]["list_workspace_guests"]["Returns"][number];

export type Guest = Omit<GuestRow, "payment_method" | "side"> & {
  side: GuestSide | null;
  payment_method: PaymentMethod | null;
  can_view_gifts?: boolean;
  can_view_attendance?: boolean;
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
  const loadSeq = useRef(0);

  const loadGuests = useCallback(async () => {
    const requestId = ++loadSeq.current;
    if (!eventId) {
      setGuests([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase.rpc("list_workspace_guests", { _event_id: eventId });
    if (requestId !== loadSeq.current) return;
    if (error) {
      toast.error("שגיאה בטעינת רשימת המוזמנים");
    } else {
      setGuests((data ?? []).map(rowToGuest));
    }
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    setGuests([]);
    setSearchTerm("");
    setFilter("all");
    if (!eventId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    loadGuests();
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
    const { data, error } = await supabase.rpc("create_workspace_guest", {
      _email: guest.email ?? null,
      _event_id: eventId,
      _full_name: guest.full_name,
      _group_category: guest.group_category ?? null,
      _group_size: guest.group_size ?? 1,
      _needs_transport: guest.needs_transport ?? false,
      _notes: guest.notes ?? null,
      _phone: guest.phone ?? null,
      _pickup_location: guest.pickup_location ?? null,
      _relationship: guest.relationship ?? null,
      _side: guest.side ?? null,
    });
    if (error) {
      toast.error("הוספת האורח נכשלה");
      await loadGuests();
      return false;
    }
    const created = (data ?? []).map(rowToGuest);
    setGuests((prev) => [...prev, ...created]);
    toast.success("האורח נוסף");
    return true;
  };

  const updateGuest = async (id: string, updates: Partial<Guest>): Promise<boolean> => {
    if (guard()) return false;
    const current = guests.find((g) => g.id === id);
    if (!current) return false;
    const next = { ...current, ...updates };
    setGuests((prev) => prev.map((g) => (g.id === id ? { ...g, ...updates } : g)));
    try {
      let updated: Guest | null = null;
      if (
        updates.full_name !== undefined ||
        updates.group_size !== undefined ||
        updates.phone !== undefined ||
        updates.email !== undefined ||
        updates.notes !== undefined ||
        updates.side !== undefined ||
        updates.group_category !== undefined ||
        updates.relationship !== undefined ||
        updates.needs_transport !== undefined ||
        updates.pickup_location !== undefined
      ) {
        const { data, error } = await supabase.rpc("update_workspace_guest_details", {
          _email: next.email ?? null,
          _full_name: next.full_name,
          _group_category: next.group_category ?? null,
          _group_size: next.group_size,
          _guest_id: id,
          _needs_transport: next.needs_transport,
          _notes: next.notes ?? null,
          _phone: next.phone ?? null,
          _pickup_location: next.pickup_location ?? null,
          _relationship: next.relationship ?? null,
          _side: next.side ?? null,
        });
        if (error) throw error;
        updated = rowToGuest((data ?? [])[0]);
      }
      if (updates.gift_amount !== undefined || updates.payment_method !== undefined) {
        const { data, error } = await supabase.rpc("update_workspace_guest_gift", {
          _gift_amount: next.gift_amount ?? 0,
          _guest_id: id,
          _payment_method: next.payment_method ?? null,
        });
        if (error) throw error;
        updated = rowToGuest((data ?? [])[0]);
      }
      if (updates.arrived !== undefined || updates.arrived_count !== undefined) {
        const { data, error } = await supabase.rpc("update_workspace_guest_attendance", {
          _arrived: next.arrived ?? false,
          _arrived_count: next.arrived_count ?? null,
          _guest_id: id,
        });
        if (error) throw error;
        updated = rowToGuest((data ?? [])[0]);
      }
      if (updated) {
        setGuests((prev) => prev.map((g) => (g.id === id ? updated : g)));
      }
      return true;
    } catch {
      toast.error("העדכון נכשל");
      await loadGuests();
      return false;
    }
  };

  const deleteGuest = async (id: string): Promise<boolean> => {
    if (guard()) return false;
    setGuests((prev) => prev.filter((g) => g.id !== id));
    const { data, error } = await supabase.rpc("delete_workspace_guest", { _guest_id: id });
    if (error) {
      toast.error("המחיקה נכשלה");
      await loadGuests();
      return false;
    }
    if (!data) {
      toast.error("המחיקה נכשלה");
      await loadGuests();
      return false;
    }
    return true;
  };

  const importGuests = async (list: NewGuest[]): Promise<boolean> => {
    if (!eventId || guard() || list.length === 0) return false;
    const created: Guest[] = [];
    for (const guest of list) {
      const { data, error } = await supabase.rpc("create_workspace_guest", {
        _email: guest.email ?? null,
        _event_id: eventId,
        _full_name: guest.full_name,
        _group_category: guest.group_category ?? null,
        _group_size: guest.group_size ?? 1,
        _needs_transport: guest.needs_transport ?? false,
        _notes: guest.notes ?? null,
        _phone: guest.phone ?? null,
        _pickup_location: guest.pickup_location ?? null,
        _relationship: guest.relationship ?? null,
        _side: guest.side ?? null,
      });
      if (error) {
        toast.error("הייבוא נכשל");
        await loadGuests();
        return false;
      }
      created.push(...(data ?? []).map(rowToGuest));
    }
    if (created.length === 0) {
      toast.error("הייבוא נכשל");
      await loadGuests();
      return false;
    }
    setGuests((prev) => [...prev, ...created]);
    toast.success(`יובאו ${created.length} אורחים`);
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

function rowToGuest(row: WorkspaceGuestRow | undefined): Guest {
  if (!row) throw new Error("Guest RPC did not return a row");
  return {
    ...row,
    arrived: row.arrived ?? null,
    arrived_count: row.arrived_count ?? null,
    email: row.email ?? null,
    gift_amount: row.gift_amount ?? 0,
    group_category: row.group_category ?? null,
    needs_transport: row.needs_transport ?? false,
    notes: row.notes ?? null,
    payment_method: (row.payment_method ?? null) as PaymentMethod | null,
    phone: row.phone ?? null,
    pickup_location: row.pickup_location ?? null,
    relationship: row.relationship ?? null,
    side: (row.side ?? null) as GuestSide | null,
  };
}
