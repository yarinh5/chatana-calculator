import { useEffect, useMemo, useState } from "react";
import {
  Plus, Pencil, Trash2, Check, X, RefreshCw, Printer, Save,
  Sparkles, Users, Wallet, Mail, TrendingUp, TrendingDown,
} from "lucide-react";
import { CATEGORIES, MARKET_ITEMS, formatILS, type CategoryKey, type MarketItem } from "@/lib/wedding-data";
import { cn } from "@/lib/utils";

type Expense = {
  id: string;
  name: string;
  price: number;
  category: CategoryKey;
  /** אם מוגדר — המחיר הוא לאורח/למנה ומוכפל במספר האורחים לחישוב */
  mealPrice?: number;
};

type GuestSettings = {
  totalInvited: number;
  attendanceRate: number;
  reserve: number;
  avgEnvelopePrice: number;
};

const DEFAULT_GUESTS: GuestSettings = {
  totalInvited: 250,
  attendanceRate: 80,
  reserve: 20,
  avgEnvelopePrice: 600,
};

const MEAL_KEYWORDS = /אולם|אוכל|מנה|מנת/;
export const isMealName = (name: string) => MEAL_KEYWORDS.test(name);
export const getEffectivePrice = (e: Expense, guestCount: number) =>
  e.mealPrice != null ? e.mealPrice * guestCount : Number(e.price || 0);

const uid = () => Math.random().toString(36).slice(2, 10);


export function WeddingCalculator() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [guests, setGuests] = useState<GuestSettings>(DEFAULT_GUESTS);
  const [showMarket, setShowMarket] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Load
  useEffect(() => {
    try {
      const e = localStorage.getItem("wedding-expenses");
      if (e) setExpenses(JSON.parse(e));
      const g = localStorage.getItem("wedding-guests");
      if (g) setGuests({ ...DEFAULT_GUESTS, ...JSON.parse(g) });
    } catch {}
    setHydrated(true);
  }, []);

  // Save
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("wedding-expenses", JSON.stringify(expenses));
  }, [expenses, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("wedding-guests", JSON.stringify(guests));
  }, [guests, hydrated]);

  const expectedGuests = Math.round(guests.totalInvited * (guests.attendanceRate / 100));
  const totalGuestsForCost = expectedGuests + guests.reserve;
  const totalExpenses = useMemo(
    () => expenses.reduce((s, e) => s + getEffectivePrice(e, totalGuestsForCost), 0),
    [expenses, totalGuestsForCost],
  );
  const costPerGuest = expectedGuests > 0 ? totalExpenses / expectedGuests : 0;
  const envelopeCoverPerGuest = costPerGuest;
  const expectedIncome = guests.avgEnvelopePrice * guests.totalInvited;
  const profit = expectedIncome - totalExpenses;

  function addExpense(e: Omit<Expense, "id">) {
    setExpenses((cur) => [...cur, { ...e, id: uid() }]);
  }
  function updateExpense(id: string, patch: Partial<Expense>) {
    setExpenses((cur) => cur.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }
  function deleteExpense(id: string) {
    setExpenses((cur) => cur.filter((e) => e.id !== id));
  }

  function importMarketItems(items: { item: MarketItem; quantity: number }[]) {
    const newOnes: Expense[] = items.map(({ item, quantity }) => {
      // פריטים שהם "לאורח" מהשוק — נשמרים כמחיר למנה ומחושבים דינמית
      if (item.perUnit === "guest") {
        return {
          id: uid(),
          name: item.name,
          price: 0,
          mealPrice: item.price,
          category: item.category,
        };
      }
      return {
        id: uid(),
        name: item.perUnit ? `${item.name} × ${quantity}` : item.name,
        price: item.perUnit ? item.price * quantity : item.price,
        category: item.category,
      };
    });
    setExpenses((cur) => [...cur, ...newOnes]);
  }


  function resetAll() {
    setExpenses([]);
    setConfirmReset(false);
  }

  function exportJSON() {
    const data = { expenses, guests, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wedding-budget-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12 md:px-6">
        <Header />

        <SummaryCards
          totalExpenses={totalExpenses}
          costPerGuest={costPerGuest}
          envelopeCover={envelopeCoverPerGuest}
          profit={profit}
        />

        <GuestSettingsPanel
          guests={guests}
          onChange={setGuests}
          expectedGuests={expectedGuests}
          totalGuestsForCost={totalGuestsForCost}
        />

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-2xl text-foreground">פירוט ההוצאות</h2>
          <button
            onClick={() => setShowMarket(true)}
            className="no-print inline-flex items-center gap-2 rounded-full bg-gold/15 px-5 py-2.5 text-sm font-semibold text-foreground ring-1 ring-gold/40 transition hover:bg-gold/25"
          >
            <Sparkles size={16} className="text-gold" />
            הוסף הוצאות מהשוק הישראלי
          </button>
        </div>

        <AddExpenseForm onAdd={addExpense} mealGuestCount={totalGuestsForCost} />

        <ExpensesTable
          expenses={expenses}
          expectedGuests={expectedGuests}
          mealGuestCount={totalGuestsForCost}
          onUpdate={updateExpense}
          onDelete={deleteExpense}
          totalExpenses={totalExpenses}
          costPerGuest={costPerGuest}
        />


        <ActionButtons
          onReset={() => setConfirmReset(true)}
          onPrint={() => window.print()}
          onExport={exportJSON}
        />

        <footer className="mt-12 text-center text-xs text-muted-foreground">
          כל הנתונים נשמרים אוטומטית בדפדפן שלך — שום דבר לא נשלח לשום מקום ♥
        </footer>
      </div>

      {showMarket && (
        <MarketModal
          onClose={() => setShowMarket(false)}
          onImport={(items) => {
            importMarketItems(items);
            setShowMarket(false);
          }}
          expectedAttending={expectedGuests}
          totalForCost={totalGuestsForCost}
          totalInvited={guests.totalInvited}
        />
      )}

      {confirmReset && (
        <ConfirmDialog
          title="לאפס את כל ההוצאות?"
          message="פעולה זו תמחק את כל ההוצאות שהוזנו. הגדרות האורחים יישמרו."
          confirmLabel="כן, אפס הכל"
          onConfirm={resetAll}
          onCancel={() => setConfirmReset(false)}
        />
      )}
    </div>
  );
}

/* ============================= HEADER ============================= */

function Header() {
  return (
    <header className="text-center">
      <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-xs text-muted-foreground shadow-sm">
        Wedding Budget IL · 2025
      </div>
      <h1 className="mt-4 font-display text-4xl text-foreground sm:text-5xl md:text-6xl">
        💍 מחשבון תקציב חתונה
      </h1>
      <p className="mt-3 text-sm text-muted-foreground sm:text-base">
        כי כל שקל חשוב — וכי אתם ראויים לחתונת החלומות
      </p>
      <div className="mx-auto mt-6 h-px w-24 bg-gradient-to-l from-transparent via-gold to-transparent" />
    </header>
  );
}

/* ============================= SUMMARY ============================= */

function SummaryCards({
  totalExpenses, costPerGuest, envelopeCover, profit,
}: { totalExpenses: number; costPerGuest: number; envelopeCover: number; profit: number }) {
  return (
    <section className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <SummaryCard label="סה״כ הוצאות" value={formatILS(totalExpenses)} icon={<Wallet size={18} />} />
      <SummaryCard label="עלות ממוצעת לאורח" value={formatILS(costPerGuest)} icon={<Users size={18} />} />
      <SummaryCard
        label="עלות למעטפה (כיסוי)"
        value={formatILS(envelopeCover)}
        icon={<Mail size={18} />}
        hint="הסכום שצריך להתקבל ממעטפה כדי לכסות עלות אורח"
      />
      <SummaryCard
        label={profit >= 0 ? "רווח צפוי" : "הפסד צפוי"}
        value={formatILS(Math.abs(profit))}
        icon={profit >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
        tone={profit > 0 ? "success" : profit < 0 ? "danger" : "neutral"}
      />
    </section>
  );
}

function SummaryCard({
  label, value, icon, tone = "neutral", hint,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: "neutral" | "success" | "danger";
  hint?: string;
}) {
  const toneRing =
    tone === "success" ? "ring-success/30" : tone === "danger" ? "ring-destructive/30" : "ring-border";
  const toneText =
    tone === "success" ? "text-success" : tone === "danger" ? "text-destructive" : "text-foreground";

  return (
    <div className={cn(
      "group rounded-2xl bg-card p-4 shadow-sm ring-1 transition-all duration-300 hover:shadow-md sm:p-5",
      toneRing,
    )}>
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-xs font-medium sm:text-sm">{label}</span>
        <span className="text-rose">{icon}</span>
      </div>
      <div
        className={cn(
          "mt-3 font-display text-2xl tabular-nums transition-all duration-300 sm:text-3xl md:text-4xl",
          toneText,
        )}
      >
        {value}
      </div>
      {hint && <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{hint}</p>}
    </div>
  );
}

/* ============================= GUEST SETTINGS ============================= */

function GuestSettingsPanel({
  guests, onChange, expectedGuests, totalGuestsForCost,
}: {
  guests: GuestSettings;
  onChange: (g: GuestSettings) => void;
  expectedGuests: number;
  totalGuestsForCost: number;
}) {
  const set = <K extends keyof GuestSettings>(k: K, v: GuestSettings[K]) =>
    onChange({ ...guests, [k]: v });

  return (
    <section className="mt-8 rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border sm:p-6">
      <div className="flex items-center gap-2">
        <Users size={18} className="text-rose" />
        <h2 className="font-display text-xl text-foreground">הגדרות אורחים</h2>
      </div>
      <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="מספר מוזמנים">
          <NumberInput
            value={guests.totalInvited}
            onChange={(v) => set("totalInvited", v)}
            min={0}
          />
        </Field>

        <Field
          label={`אחוז הגעה צפוי — ${guests.attendanceRate}%`}
          hint={`~${expectedGuests} אורחים צפויים`}
        >
          <input
            type="range"
            min={50}
            max={100}
            value={guests.attendanceRate}
            onChange={(e) => set("attendanceRate", Number(e.target.value))}
            className="w-full accent-[color:var(--rose)]"
          />
        </Field>

        <Field label="רזרבה (ספקים, ילדים, נ/א)" hint={`סה"כ לחישוב: ${totalGuestsForCost}`}>
          <NumberInput value={guests.reserve} onChange={(v) => set("reserve", v)} min={0} />
        </Field>

        <Field label="מחיר מעטפה ממוצע (₪)">
          <NumberInput
            value={guests.avgEnvelopePrice}
            onChange={(v) => set("avgEnvelopePrice", v)}
            min={0}
          />
        </Field>
      </div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-2 text-xs font-medium text-muted-foreground">{label}</div>
      {children}
      {hint && <div className="mt-1.5 text-[11px] text-muted-foreground">{hint}</div>}
    </label>
  );
}

function NumberInput({
  value, onChange, min, className,
}: { value: number; onChange: (v: number) => void; min?: number; className?: string }) {
  return (
    <input
      type="number"
      inputMode="numeric"
      value={Number.isFinite(value) ? value : 0}
      min={min}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
      className={cn(
        "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm tabular-nums outline-none transition focus:border-rose focus:ring-2 focus:ring-rose/20",
        className,
      )}
    />
  );
}

/* ============================= ADD EXPENSE FORM ============================= */

function AddExpenseForm({ onAdd }: { onAdd: (e: Omit<Expense, "id">) => void }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState<CategoryKey | "">("");

  const canAdd = name.trim() && Number(price) > 0 && category;

  function submit() {
    if (!canAdd) return;
    onAdd({ name: name.trim(), price: Number(price), category: category as CategoryKey });
    setName(""); setPrice(""); setCategory("");
  }

  return (
    <div className="no-print mt-4 grid gap-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border sm:grid-cols-[1fr_140px_180px_auto] sm:items-end">
      <Field label="שם ההוצאה">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="למשל: צלם סטילס"
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-rose focus:ring-2 focus:ring-rose/20"
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
      </Field>
      <Field label="מחיר (₪)">
        <input
          type="number"
          inputMode="numeric"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="0"
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm tabular-nums outline-none focus:border-rose focus:ring-2 focus:ring-rose/20"
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
      </Field>
      <Field label="קטגוריה">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as CategoryKey)}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-rose focus:ring-2 focus:ring-rose/20"
        >
          <option value="">בחר קטגוריה</option>
          {Object.entries(CATEGORIES).map(([k, v]) => (
            <option key={k} value={k}>{v.emoji} {v.label}</option>
          ))}
        </select>
      </Field>
      <button
        onClick={submit}
        disabled={!canAdd}
        aria-label="הוסף הוצאה"
        className="inline-flex h-[42px] items-center justify-center gap-1.5 rounded-lg bg-rose px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-deep disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus size={16} /> הוסף
      </button>
    </div>
  );
}

/* ============================= EXPENSES TABLE ============================= */

function ExpensesTable({
  expenses, expectedGuests, onUpdate, onDelete, totalExpenses, costPerGuest,
}: {
  expenses: Expense[];
  expectedGuests: number;
  onUpdate: (id: string, patch: Partial<Expense>) => void;
  onDelete: (id: string) => void;
  totalExpenses: number;
  costPerGuest: number;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);

  return (
    <div className="mt-4 overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border">
      <div className="overflow-x-auto">
        <table className="min-w-full text-right text-sm">
          <thead className="bg-secondary/50 text-xs font-semibold text-muted-foreground">
            <tr>
              <th className="px-3 py-3 w-10">#</th>
              <th className="px-3 py-3">שם הוצאה</th>
              <th className="px-3 py-3">קטגוריה</th>
              <th className="px-3 py-3 tabular-nums">מחיר כולל</th>
              <th className="px-3 py-3 tabular-nums">מחיר לאורח</th>
              <th className="no-print px-3 py-3 w-24 text-center">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {expenses.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-12 text-center text-sm text-muted-foreground">
                  אין הוצאות עדיין — הוסיפו ידנית או בחרו "הוסף הוצאות מהשוק" למעלה.
                </td>
              </tr>
            )}
            {expenses.map((e, i) => (
              <ExpenseRow
                key={e.id}
                index={i + 1}
                expense={e}
                pricePerGuest={expectedGuests > 0 ? e.price / expectedGuests : 0}
                onUpdate={(patch) => onUpdate(e.id, patch)}
                onAskDelete={() => setConfirmId(e.id)}
              />
            ))}
          </tbody>
          {expenses.length > 0 && (
            <tfoot className="border-t border-border bg-secondary/30 font-semibold">
              <tr>
                <td className="px-3 py-3" colSpan={3}>סה״כ</td>
                <td className="px-3 py-3 tabular-nums text-foreground">{formatILS(totalExpenses)}</td>
                <td className="px-3 py-3 tabular-nums text-foreground">{formatILS(costPerGuest)}</td>
                <td className="no-print" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {confirmId && (
        <ConfirmDialog
          title="למחוק את ההוצאה?"
          message="לא ניתן לבטל את הפעולה."
          confirmLabel="מחק"
          onConfirm={() => { onDelete(confirmId); setConfirmId(null); }}
          onCancel={() => setConfirmId(null)}
        />
      )}
    </div>
  );
}

function ExpenseRow({
  index, expense, pricePerGuest, onUpdate, onAskDelete,
}: {
  index: number;
  expense: Expense;
  pricePerGuest: number;
  onUpdate: (patch: Partial<Expense>) => void;
  onAskDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(expense);

  useEffect(() => setDraft(expense), [expense]);

  const cat = CATEGORIES[expense.category];

  function save() {
    onUpdate({
      name: draft.name.trim() || expense.name,
      price: Number(draft.price) || 0,
      category: draft.category,
    });
    setEditing(false);
  }

  if (editing) {
    return (
      <tr className={cn("border-t border-border", cat.tint)}>
        <td className="px-3 py-2 text-muted-foreground tabular-nums">{index}</td>
        <td className="px-3 py-2">
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            autoFocus
          />
        </td>
        <td className="px-3 py-2">
          <select
            value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.target.value as CategoryKey })}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          >
            {Object.entries(CATEGORIES).map(([k, v]) => (
              <option key={k} value={k}>{v.emoji} {v.label}</option>
            ))}
          </select>
        </td>
        <td className="px-3 py-2">
          <input
            type="number"
            value={draft.price}
            onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) || 0 })}
            className="w-28 rounded-md border border-input bg-background px-2 py-1.5 text-sm tabular-nums"
          />
        </td>
        <td className="px-3 py-2 tabular-nums text-muted-foreground">{formatILS(pricePerGuest)}</td>
        <td className="no-print px-3 py-2">
          <div className="flex justify-center gap-1">
            <IconBtn onClick={save} title="שמור" tone="success"><Check size={15} /></IconBtn>
            <IconBtn onClick={() => { setDraft(expense); setEditing(false); }} title="ביטול">
              <X size={15} />
            </IconBtn>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className={cn("border-t border-border transition hover:brightness-[0.99]", cat.tint)}>
      <td className="px-3 py-3 text-muted-foreground tabular-nums">{index}</td>
      <td className="px-3 py-3 font-medium text-foreground">{expense.name}</td>
      <td className="px-3 py-3 text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span>{cat.emoji}</span>
          <span className="text-xs">{cat.label}</span>
        </span>
      </td>
      <td className="px-3 py-3 tabular-nums text-foreground">{formatILS(expense.price)}</td>
      <td className="px-3 py-3 tabular-nums text-muted-foreground">{formatILS(pricePerGuest)}</td>
      <td className="no-print px-3 py-3">
        <div className="flex justify-center gap-1">
          <IconBtn onClick={() => setEditing(true)} title="ערוך"><Pencil size={14} /></IconBtn>
          <IconBtn onClick={onAskDelete} title="מחק" tone="danger"><Trash2 size={14} /></IconBtn>
        </div>
      </td>
    </tr>
  );
}

function IconBtn({
  children, onClick, title, tone = "neutral",
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  tone?: "neutral" | "danger" | "success";
}) {
  const toneClass =
    tone === "danger"
      ? "text-destructive hover:bg-destructive/10"
      : tone === "success"
        ? "text-success hover:bg-success/10"
        : "text-muted-foreground hover:bg-secondary";
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={cn("rounded-md p-1.5 transition", toneClass)}
    >
      {children}
    </button>
  );
}

/* ============================= ACTION BUTTONS ============================= */

function ActionButtons({
  onReset, onPrint, onExport,
}: { onReset: () => void; onPrint: () => void; onExport: () => void }) {
  return (
    <div className="no-print mt-8 flex flex-wrap justify-center gap-3">
      <button
        onClick={onReset}
        className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-5 py-2.5 text-sm font-medium text-foreground transition hover:bg-secondary"
      >
        <RefreshCw size={15} /> איפוס הכל
      </button>
      <button
        onClick={onPrint}
        className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-5 py-2.5 text-sm font-medium text-foreground transition hover:bg-secondary"
      >
        <Printer size={15} /> ייצוא ל-PDF (הדפסה)
      </button>
      <button
        onClick={onExport}
        className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-5 py-2.5 text-sm font-medium text-foreground transition hover:bg-secondary"
      >
        <Save size={15} /> שמור / ייצוא JSON
      </button>
    </div>
  );
}

/* ============================= CONFIRM DIALOG ============================= */

function ConfirmDialog({
  title, message, confirmLabel, onConfirm, onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl ring-1 ring-border"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-xl text-foreground">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <div className="mt-5 flex justify-start gap-2">
          <button
            onClick={onConfirm}
            className="rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:opacity-90"
          >
            {confirmLabel}
          </button>
          <button
            onClick={onCancel}
            className="rounded-lg border border-border bg-card px-4 py-2 text-sm hover:bg-secondary"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================= MARKET MODAL ============================= */

type SelectedMap = Record<string, { selected: boolean; quantity: number }>;

function MarketModal({
  onClose, onImport, expectedAttending, totalForCost, totalInvited,
}: {
  onClose: () => void;
  onImport: (items: { item: MarketItem; quantity: number }[]) => void;
  expectedAttending: number;
  totalForCost: number;
  totalInvited: number;
}) {
  const [selected, setSelected] = useState<SelectedMap>(() => {
    const m: SelectedMap = {};
    MARKET_ITEMS.forEach((it, i) => {
      const defaultQty =
        it.perUnit === "guest" ? totalForCost :
        it.perUnit === "invited" ? totalInvited :
        it.perUnit === "tables" ? Math.max(1, Math.ceil(expectedAttending / 12)) :
        1;
      m[i] = { selected: false, quantity: defaultQty };
    });
    return m;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const byCat = useMemo(() => {
    const groups: Record<CategoryKey, { item: MarketItem; idx: number }[]> = {
      venue: [], photo: [], music: [], flowers: [], attire: [],
      invites: [], rings: [], transport: [], attractions: [], misc: [],
    };
    MARKET_ITEMS.forEach((item, idx) => groups[item.category].push({ item, idx }));
    return groups;
  }, []);

  const selectedCount = Object.values(selected).filter((s) => s.selected).length;
  const previewTotal = MARKET_ITEMS.reduce((sum, it, i) => {
    const s = selected[i];
    if (!s?.selected) return sum;
    const q = it.perUnit ? s.quantity : 1;
    return sum + it.price * q;
  }, 0);

  function toggle(i: number) {
    setSelected((m) => ({ ...m, [i]: { ...m[i], selected: !m[i].selected } }));
  }
  function setQty(i: number, q: number) {
    setSelected((m) => ({ ...m, [i]: { ...m[i], quantity: Math.max(1, q) } }));
  }
  function submit() {
    const items = MARKET_ITEMS
      .map((item, i) => ({ item, quantity: selected[i].quantity, selected: selected[i].selected }))
      .filter((x) => x.selected)
      .map(({ item, quantity }) => ({ item, quantity }));
    if (items.length) onImport(items);
    else onClose();
  }

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-stretch justify-center bg-foreground/40 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-card shadow-2xl ring-1 ring-border sm:max-h-[90vh] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h3 className="font-display text-xl text-foreground">הוצאות מהשוק הישראלי</h3>
            <p className="text-xs text-muted-foreground">
              סמנו פריטים רלוונטיים, ערכו כמויות, והוסיפו לטבלה בלחיצה אחת.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="סגור"
            className="rounded-full p-2 text-muted-foreground transition hover:bg-secondary"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {(Object.keys(byCat) as CategoryKey[]).map((catKey) => {
            const cat = CATEGORIES[catKey];
            const items = byCat[catKey];
            if (!items.length) return null;
            return (
              <section key={catKey} className="mb-6">
                <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <span>{cat.emoji}</span> {cat.label}
                </h4>
                <div className={cn("overflow-hidden rounded-xl ring-1 ring-border", cat.tint)}>
                  {items.map(({ item, idx }) => {
                    const s = selected[idx];
                    const lineTotal = item.perUnit ? item.price * s.quantity : item.price;
                    return (
                      <label
                        key={idx}
                        className="flex cursor-pointer items-center gap-3 border-b border-border/60 bg-card/60 px-3 py-2.5 text-sm last:border-b-0 hover:bg-card"
                      >
                        <input
                          type="checkbox"
                          checked={s.selected}
                          onChange={() => toggle(idx)}
                          className="size-4 accent-[color:var(--rose)]"
                        />
                        <span className="flex-1 text-foreground">{item.name}</span>
                        {item.perUnit && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <span>×</span>
                            <input
                              type="number"
                              value={s.quantity}
                              onChange={(e) => setQty(idx, Number(e.target.value) || 1)}
                              onClick={(e) => e.stopPropagation()}
                              className="w-16 rounded-md border border-input bg-background px-2 py-1 text-center text-xs tabular-nums"
                              min={1}
                            />
                          </span>
                        )}
                        <span className="w-24 text-end text-xs text-muted-foreground tabular-nums">
                          {formatILS(item.price)}{item.perUnit && " / יח׳"}
                        </span>
                        <span className="w-24 text-end font-semibold text-foreground tabular-nums">
                          {formatILS(lineTotal)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-secondary/40 px-5 py-4">
          <div className="text-sm">
            <span className="text-muted-foreground">נבחרו </span>
            <span className="font-semibold text-foreground">{selectedCount}</span>
            <span className="text-muted-foreground"> פריטים · סה״כ </span>
            <span className="font-display text-lg text-foreground tabular-nums">{formatILS(previewTotal)}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-border bg-card px-4 py-2 text-sm hover:bg-secondary"
            >
              ביטול
            </button>
            <button
              onClick={submit}
              disabled={selectedCount === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary-deep disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus size={15} /> הוסף לטבלה
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
