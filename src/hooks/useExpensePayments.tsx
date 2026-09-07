import { useCallback, useEffect, useMemo, useState } from "react";
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

const toPayment = (r: Row): Payment => ({
  id: r.id,
  expenseId: r.expense_id,
  amount: Number(r.amount ?? 0),
  paymentDate: r.payment_date,
  paymentType: r.payment_type,
  paymentMethod: r.payment_method,
  note: r.note,
});

export function useExpensePayments(eventId: string | null | undefined) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!eventId) {
      setPayments([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("expense_payments")
      .select("id,expense_id,amount,payment_date,payment_type,payment_method,note,expenses!inner(event_id)")
      .eq("expenses.event_id", eventId)
      .order("payment_date", { ascending: true });
    if (!error && data) setPayments((data as unknown as Row[]).map(toPayment));
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!eventId) return;
    const channel = supabase
      .channel(`expense_payments_${eventId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "expense_payments" }, () => {
        void reload();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [eventId, reload]);

  const byExpense = useMemo(() => {
    const map = new Map<string, Payment[]>();
    for (const p of payments) {
      const list = map.get(p.expenseId) ?? [];
      list.push(p);
      map.set(p.expenseId, list);
    }
    return map;
  }, [payments]);

  const addPayment = useCallback(async (p: Omit<Payment, "id">) => {
    const { data, error } = await supabase
      .from("expense_payments")
      .insert({
        expense_id: p.expenseId,
        amount: p.amount,
        payment_date: p.paymentDate,
        payment_type: p.paymentType,
        payment_method: p.paymentMethod,
        note: p.note,
      })
      .select("id,expense_id,amount,payment_date,payment_type,payment_method,note")
      .single();
    if (error || !data) {
      toast.error("הוספת התשלום נכשלה");
      return;
    }
    setPayments((cur) => [...cur, toPayment(data as Row)]);
    toast.success("התשלום נוסף");
  }, []);

  const updatePayment = useCallback(async (id: string, patch: Partial<Omit<Payment, "id" | "expenseId">>) => {
    const prev = payments;
    setPayments((cur) => cur.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    const dbPatch: Record<string, unknown> = {};
    if (patch.amount !== undefined) dbPatch.amount = patch.amount;
    if (patch.paymentDate !== undefined) dbPatch.payment_date = patch.paymentDate;
    if (patch.paymentType !== undefined) dbPatch.payment_type = patch.paymentType;
    if (patch.paymentMethod !== undefined) dbPatch.payment_method = patch.paymentMethod;
    if (patch.note !== undefined) dbPatch.note = patch.note;
    const { error } = await supabase.from("expense_payments").update(dbPatch as never).eq("id", id);
    if (error) {
      toast.error("עדכון התשלום נכשל");
      setPayments(prev);
    }
  }, [payments]);

  const deletePayment = useCallback(async (id: string) => {
    const prev = payments;
    setPayments((cur) => cur.filter((p) => p.id !== id));
    const { error } = await supabase.from("expense_payments").delete().eq("id", id);
    if (error) {
      toast.error("מחיקת התשלום נכשלה");
      setPayments(prev);
    } else {
      toast.success("התשלום נמחק");
    }
  }, [payments]);

  return { payments, byExpense, loading, reload, addPayment, updatePayment, deletePayment };
}
