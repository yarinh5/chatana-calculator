import { useState } from "react";
import { X, Plus, Trash2, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatILS } from "@/lib/wedding-data";
import {
  PAYMENT_METHODS, PAYMENT_TYPES, formatDate, statusTone, todayISO,
  type ExpenseFinance, type Payment, type PaymentStatus,
} from "@/lib/payments";

export type DialogExpense = {
  id: string;
  name: string;
  requiresDeposit: boolean;
  depositPercent: number;
  depositDate: string | null;
  balanceDate: string | null;
};

export function StatusBadge({ status, className }: { status: PaymentStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1",
        statusTone(status),
        className,
      )}
    >
      {status}
    </span>
  );
}

export function ProgressBar({ percent, className }: { percent: number; className?: string }) {
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-secondary", className)}>
      <div
        className="h-full rounded-full bg-gold transition-all"
        style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
      />
    </div>
  );
}

type FormState = {
  amount: string;
  paymentDate: string;
  paymentType: string;
  paymentMethod: string;
  note: string;
};

const emptyForm = (): FormState => ({
  amount: "",
  paymentDate: todayISO(),
  paymentType: PAYMENT_TYPES[0],
  paymentMethod: PAYMENT_METHODS[0],
  note: "",
});

export function ExpensePaymentDialog({
  expense, finance, payments, readOnly, onClose, onUpdateExpense, onAddPayment, onUpdatePayment, onDeletePayment,
}: {
  expense: DialogExpense;
  finance: ExpenseFinance;
  payments: Payment[];
  readOnly?: boolean;
  onClose: () => void;
  onUpdateExpense: (patch: Partial<DialogExpense>) => void | Promise<void>;
  onAddPayment: (p: Omit<Payment, "id">) => void | Promise<void>;
  onUpdatePayment: (id: string, patch: Partial<Omit<Payment, "id" | "expenseId">>) => void | Promise<void>;
  onDeletePayment: (id: string) => void | Promise<void>;
}) {
  const [form, setForm] = useState<FormState>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  function startEdit(p: Payment) {
    setEditingId(p.id);
    setShowForm(true);
    setForm({
      amount: String(p.amount),
      paymentDate: p.paymentDate,
      paymentType: p.paymentType,
      paymentMethod: p.paymentMethod,
      note: p.note ?? "",
    });
  }

  async function submit() {
    const amount = Number(form.amount);
    if (!(amount > 0)) return;
    const base = {
      amount,
      paymentDate: form.paymentDate,
      paymentType: form.paymentType,
      paymentMethod: form.paymentMethod,
      note: form.note.trim() || null,
    };
    if (editingId) await onUpdatePayment(editingId, base);
    else await onAddPayment({ expenseId: expense.id, ...base });
    setForm(emptyForm());
    setEditingId(null);
    setShowForm(false);
  }

  return (
    <div dir="rtl" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-card p-4 shadow-xl ring-1 ring-border sm:max-w-2xl sm:rounded-3xl sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-xl text-foreground">{expense.name}</h3>
            <StatusBadge status={finance.status} className="mt-1" />
          </div>
          <button onClick={onClose} aria-label="סגור" className="rounded-full p-2 hover:bg-secondary">
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniCard label="מחיר" value={formatILS(finance.price)} />
          <MiniCard label="שולם" value={formatILS(finance.totalPaid)} />
          <MiniCard label="נותר" value={formatILS(finance.remaining)} />
          <MiniCard label="אחוז ששולם" value={`${finance.percentPaid}%`} />
        </div>
        <ProgressBar percent={finance.percentPaid} className="mt-3" />
        {finance.overpaid > 0 && (
          <p className="mt-2 text-sm text-destructive">שולם ביתר {formatILS(finance.overpaid)}</p>
        )}

        {expense.requiresDeposit && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-secondary/40 p-3 ring-1 ring-border">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">מקדמה ({expense.depositPercent}%)</span>
                <StatusBadge status={finance.depositStatus} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatILS(finance.depositPaid)} מתוך {formatILS(finance.depositAmount)} · תאריך {formatDate(expense.depositDate)}
              </p>
            </div>
            <div className="rounded-2xl bg-secondary/40 p-3 ring-1 ring-border">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">יתרה</span>
                <StatusBadge status={finance.balanceStatus} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatILS(finance.balancePaid)} מתוך {formatILS(finance.balanceAmount)} · תאריך {formatDate(expense.balanceDate)}
              </p>
            </div>
          </div>
        )}

        {!readOnly && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={expense.requiresDeposit}
                onChange={(e) => onUpdateExpense({ requiresDeposit: e.target.checked })}
              />
              נדרשת מקדמה
            </label>
            {expense.requiresDeposit && (
              <>
                <Field label="אחוז מקדמה">
                  <input
                    type="number" min={0} max={100}
                    value={expense.depositPercent}
                    onChange={(e) => onUpdateExpense({ depositPercent: Number(e.target.value) })}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  />
                </Field>
                <Field label="תאריך מקדמה">
                  <input
                    type="date"
                    value={expense.depositDate ?? ""}
                    onChange={(e) => onUpdateExpense({ depositDate: e.target.value || null })}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  />
                </Field>
              </>
            )}
            <Field label="תאריך יתרה">
              <input
                type="date"
                value={expense.balanceDate ?? ""}
                onChange={(e) => onUpdateExpense({ balanceDate: e.target.value || null })}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              />
            </Field>
          </div>
        )}

        <div className="mt-6">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-foreground">היסטוריית תשלומים</h4>
            {!readOnly && (
              <button
                onClick={() => { setEditingId(null); setForm(emptyForm()); setShowForm((s) => !s); }}
                className="inline-flex items-center gap-1.5 rounded-full bg-gold/15 px-3 py-1.5 text-sm font-semibold ring-1 ring-gold/40 hover:bg-gold/25"
              >
                <Plus size={15} /> תשלום חדש
              </button>
            )}
          </div>

          {payments.length === 0 && (
            <p className="mt-3 text-sm text-muted-foreground">עדיין לא נרשמו תשלומים.</p>
          )}
          <ul className="mt-3 space-y-2">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 rounded-2xl bg-secondary/40 p-3 ring-1 ring-border">
                <div className="min-w-0">
                  <p className="font-semibold tabular-nums text-foreground">{formatILS(p.amount)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.paymentType} · {p.paymentMethod} · {formatDate(p.paymentDate)}
                    {p.note ? ` · ${p.note}` : ""}
                  </p>
                </div>
                {!readOnly && (
                  <div className="flex shrink-0 gap-1">
                    <button onClick={() => startEdit(p)} aria-label="ערוך תשלום" className="rounded-full p-2 hover:bg-background">
                      <Pencil size={15} />
                    </button>
                    <button onClick={() => onDeletePayment(p.id)} aria-label="מחק תשלום" className="rounded-full p-2 text-destructive hover:bg-background">
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>

          {!readOnly && showForm && (
            <div className="mt-4 grid gap-3 rounded-2xl bg-secondary/30 p-3 ring-1 ring-border sm:grid-cols-2">
              <Field label="סכום">
                <input
                  type="number" min={0} value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                />
              </Field>
              <Field label="תאריך">
                <input
                  type="date" value={form.paymentDate}
                  onChange={(e) => setForm({ ...form, paymentDate: e.target.value })}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                />
              </Field>
              <Field label="סוג תשלום">
                <select
                  value={form.paymentType}
                  onChange={(e) => setForm({ ...form, paymentType: e.target.value })}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                >
                  {PAYMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="אמצעי תשלום">
                <select
                  value={form.paymentMethod}
                  onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                >
                  {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
              <Field label="הערה" className="sm:col-span-2">
                <input
                  type="text" value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                />
              </Field>
              <div className="flex gap-2 sm:col-span-2">
                <button
                  onClick={submit}
                  className="rounded-full bg-gold/20 px-4 py-2 text-sm font-semibold ring-1 ring-gold/40 hover:bg-gold/30"
                >
                  {editingId ? "עדכן תשלום" : "שמור תשלום"}
                </button>
                <button
                  onClick={() => { setShowForm(false); setEditingId(null); setForm(emptyForm()); }}
                  className="rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-secondary"
                >
                  ביטול
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-secondary/40 p-3 text-center ring-1 ring-border">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
