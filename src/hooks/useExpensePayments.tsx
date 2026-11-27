import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Payment } from "@/lib/payments";

type Row = {
  id: string;
  expense_id: string;
  amount: number | string | null;
  payment_date: string;
  payment_type: string;
  payment_method: string;
  note: string | null;
};

type Snapshot = {
  version: number;
  rows: Payment[];
  loaded: boolean;
  refreshing: boolean;
  error: string | null;
};

const toPayment = (r: Row): Payment => ({
  id: r.id,
  expenseId: r.expense_id,
  amount: Number(r.amount ?? 0),
  paymentDate: r.payment_date,
  paymentType: r.payment_type,
  paymentMethod: r.payment_method,
  note: r.note,
});

const emptySnapshot = (version: number, loaded = false): Snapshot => ({
  version,
  rows: [],
  loaded,
  refreshing: false,
  error: null,
});

export function useExpensePayments(eventId: string | null | undefined) {
  const currentEventId = eventId ?? null;
  const lifecycleRef = useRef({ eventId: currentEventId, version: 0, mounted: true });
  if (lifecycleRef.current.eventId !== currentEventId) {
    lifecycleRef.current = {
      eventId: currentEventId,
      version: lifecycleRef.current.version + 1,
      mounted: true,
    };
  }
  const [snapshot, setSnapshot] = useState<Snapshot>(() => emptySnapshot(0, !currentEventId));
  const snapshotRef = useRef(snapshot);
  const requestRef = useRef(0);
  const pendingRef = useRef(new Set<string>());

  useEffect(() => {
    lifecycleRef.current.mounted = true;
    return () => {
      lifecycleRef.current.mounted = false;
      lifecycleRef.current.version += 1;
    };
  }, []);

  const isActive = useCallback(
    (version: number, requestEventId: string | null) =>
      lifecycleRef.current.mounted &&
      lifecycleRef.current.version === version &&
      lifecycleRef.current.eventId === requestEventId,
    [],
  );

  const commit = useCallback(
    (version: number, requestEventId: string | null, update: (current: Snapshot) => Snapshot) => {
      if (!isActive(version, requestEventId)) return;
      const current =
        snapshotRef.current.version === version
          ? snapshotRef.current
          : emptySnapshot(version, !requestEventId);
      const next = update(current);
      snapshotRef.current = next;
      setSnapshot(next);
    },
    [isActive],
  );

  const reload = useCallback(async (): Promise<boolean> => {
    const version = lifecycleRef.current.version;
    if (!isActive(version, currentEventId)) return false;
    const request = ++requestRef.current;
    if (!currentEventId) {
      commit(version, null, () => emptySnapshot(version, true));
      return true;
    }
    commit(version, currentEventId, (current) => ({
      ...current,
      refreshing: current.loaded,
      error: null,
    }));
    try {
      const { data, error } = await supabase
        .from("expense_payments")
        .select(
          "id,expense_id,amount,payment_date,payment_type,payment_method,note,expenses!inner(event_id)",
        )
        .eq("expenses.event_id", currentEventId)
        .order("payment_date", { ascending: true });
      if (!isActive(version, currentEventId) || request !== requestRef.current) return false;
      if (error) throw error;
      commit(version, currentEventId, () => ({
        version,
        rows: ((data ?? []) as unknown as Row[]).map(toPayment),
        loaded: true,
        refreshing: false,
        error: null,
      }));
      return true;
    } catch {
      if (!isActive(version, currentEventId) || request !== requestRef.current) return false;
      commit(version, currentEventId, (current) => ({
        ...current,
        refreshing: false,
        error: "לא הצלחנו לטעון את נתוני התשלומים.",
      }));
      return false;
    }
  }, [commit, currentEventId, isActive]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!currentEventId) return;
    const channel = supabase
      .channel(`expense_payments_${currentEventId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "expense_payments" }, () => {
        void reload();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentEventId, reload]);

  const current =
    snapshot.version === lifecycleRef.current.version
      ? snapshot
      : emptySnapshot(lifecycleRef.current.version, !currentEventId);
  const payments = current.rows;
  const byExpense = useMemo(() => {
    const map = new Map<string, Payment[]>();
    for (const payment of payments) {
      const list = map.get(payment.expenseId) ?? [];
      list.push(payment);
      map.set(payment.expenseId, list);
    }
    return map;
  }, [payments]);

  const mutate = useCallback(
    async (
      key: string,
      action: (version: number, requestEventId: string) => Promise<boolean>,
    ): Promise<boolean> => {
      const version = lifecycleRef.current.version;
      const requestEventId = currentEventId;
      if (!requestEventId || !isActive(version, requestEventId)) return false;
      const scopedKey = `${version}:${key}`;
      if (pendingRef.current.has(scopedKey)) return false;
      pendingRef.current.add(scopedKey);
      ++requestRef.current;
      try {
        return await action(version, requestEventId);
      } catch {
        if (isActive(version, requestEventId)) {
          toast.error("פעולת התשלום נכשלה");
          void reload();
        }
        return false;
      } finally {
        pendingRef.current.delete(scopedKey);
      }
    },
    [currentEventId, isActive, reload],
  );

  const addPayment = useCallback(
    (payment: Omit<Payment, "id">): Promise<boolean> =>
      mutate(`add:${payment.expenseId}`, async (version, requestEventId) => {
        const { data, error } = await supabase
          .from("expense_payments")
          .insert({
            expense_id: payment.expenseId,
            amount: payment.amount,
            payment_date: payment.paymentDate,
            payment_type: payment.paymentType,
            payment_method: payment.paymentMethod,
            note: payment.note,
          })
          .select("id,expense_id,amount,payment_date,payment_type,payment_method,note")
          .single();
        if (!isActive(version, requestEventId)) return false;
        if (error || !data || data.expense_id !== payment.expenseId) {
          toast.error("הוספת התשלום נכשלה");
          void reload();
          return false;
        }
        commit(version, requestEventId, (current) => ({
          ...current,
          rows: [...current.rows, toPayment(data as Row)],
          loaded: true,
          error: null,
        }));
        toast.success("התשלום נוסף");
        return true;
      }),
    [commit, isActive, mutate, reload],
  );

  const updatePayment = useCallback(
    (id: string, patch: Partial<Omit<Payment, "id" | "expenseId">>): Promise<boolean> =>
      mutate(`payment:${id}`, async (version, requestEventId) => {
        const existing =
          snapshotRef.current.version === version
            ? snapshotRef.current.rows.find((row) => row.id === id)
            : undefined;
        if (!existing) return false;
        const dbPatch: Record<string, unknown> = {};
        if (patch.amount !== undefined) dbPatch.amount = patch.amount;
        if (patch.paymentDate !== undefined) dbPatch.payment_date = patch.paymentDate;
        if (patch.paymentType !== undefined) dbPatch.payment_type = patch.paymentType;
        if (patch.paymentMethod !== undefined) dbPatch.payment_method = patch.paymentMethod;
        if (patch.note !== undefined) dbPatch.note = patch.note;
        if (Object.keys(dbPatch).length === 0) return false;
        const { data, error } = await supabase
          .from("expense_payments")
          .update(dbPatch as never)
          .eq("id", id)
          .eq("expense_id", existing.expenseId)
          .select("id,expense_id,amount,payment_date,payment_type,payment_method,note")
          .single();
        if (!isActive(version, requestEventId)) return false;
        if (error || !data || data.id !== id || data.expense_id !== existing.expenseId) {
          toast.error("עדכון התשלום נכשל");
          void reload();
          return false;
        }
        commit(version, requestEventId, (current) => ({
          ...current,
          rows: current.rows.map((row) => (row.id === id ? toPayment(data as Row) : row)),
          error: null,
        }));
        toast.success("התשלום עודכן");
        return true;
      }),
    [commit, isActive, mutate, reload],
  );

  const deletePayment = useCallback(
    (id: string): Promise<boolean> =>
      mutate(`payment:${id}`, async (version, requestEventId) => {
        const existing =
          snapshotRef.current.version === version
            ? snapshotRef.current.rows.find((row) => row.id === id)
            : undefined;
        if (!existing) return false;
        const { data, error } = await supabase
          .from("expense_payments")
          .delete()
          .eq("id", id)
          .eq("expense_id", existing.expenseId)
          .select("id")
          .single();
        if (!isActive(version, requestEventId)) return false;
        if (error || !data || data.id !== id) {
          toast.error("מחיקת התשלום נכשלה");
          void reload();
          return false;
        }
        commit(version, requestEventId, (current) => ({
          ...current,
          rows: current.rows.filter((row) => row.id !== id),
          error: null,
        }));
        toast.success("התשלום נמחק");
        return true;
      }),
    [commit, isActive, mutate, reload],
  );

  return {
    payments,
    byExpense,
    loading: !!currentEventId && !current.loaded && !current.error,
    refreshing: current.refreshing,
    error: current.error,
    hasLoaded: current.loaded,
    reload,
    addPayment,
    updatePayment,
    deletePayment,
  };
}
