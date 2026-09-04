import { useState } from "react";
import { ChevronDown, Trash2, Check, X } from "lucide-react";
import { formatILS } from "@/lib/wedding-data";
import { PAYMENT_METHODS, type Guest, type PaymentMethod } from "@/hooks/useGuests";

type Props = {
  guests: Guest[];
  readOnly?: boolean;
  onUpdate: (id: string, updates: Partial<Guest>) => void;
  onDelete: (id: string) => void;
};

function ArrivalButtons({ g, onUpdate, readOnly }: { g: Guest; onUpdate: Props["onUpdate"]; readOnly?: boolean }) {
  return (
    <div className="flex items-center gap-1">
      <button
        disabled={readOnly}
        onClick={() => onUpdate(g.id, { arrived: true, arrived_count: g.arrived_count ?? g.group_size })}
        aria-label="סמן הגיע"
        className={`inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border text-xs ${
          g.arrived === true
            ? "border-emerald-600 bg-emerald-600/15 text-emerald-700"
            : "border-border bg-card text-muted-foreground hover:bg-secondary"
        }`}
      >
        <Check size={16} />
      </button>
      <button
        disabled={readOnly}
        onClick={() => onUpdate(g.id, { arrived: false, arrived_count: 0 })}
        aria-label="סמן לא הגיע"
        className={`inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border text-xs ${
          g.arrived === false
            ? "border-destructive bg-destructive/10 text-destructive"
            : "border-border bg-card text-muted-foreground hover:bg-secondary"
        }`}
      >
        <X size={16} />
      </button>
    </div>
  );
}

const inputCls = "min-h-9 w-24 rounded-lg border border-border bg-background px-2 text-sm";

function GiftInput({ g, onUpdate, readOnly }: { g: Guest; onUpdate: Props["onUpdate"]; readOnly?: boolean }) {
  return (
    <input
      type="number"
      inputMode="numeric"
      disabled={readOnly}
      className={inputCls}
      value={Number(g.gift_amount) || ""}
      placeholder="0"
      onChange={(e) => onUpdate(g.id, { gift_amount: Number(e.target.value) || 0 })}
      aria-label="סכום מתנה"
    />
  );
}

function PaymentSelect({ g, onUpdate, readOnly }: { g: Guest; onUpdate: Props["onUpdate"]; readOnly?: boolean }) {
  return (
    <select
      disabled={readOnly}
      className="min-h-9 rounded-lg border border-border bg-background px-2 text-sm"
      value={g.payment_method ?? ""}
      onChange={(e) => onUpdate(g.id, { payment_method: (e.target.value || null) as PaymentMethod | null })}
      aria-label="אמצעי תשלום"
    >
      <option value="">—</option>
      {PAYMENT_METHODS.map((m) => (
        <option key={m} value={m}>
          {m}
        </option>
      ))}
    </select>
  );
}

function GuestCard({ g, onUpdate, onDelete, readOnly }: { g: Guest } & Omit<Props, "guests">) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border transition-all duration-300 hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-semibold text-foreground">{g.full_name}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {g.group_size} אנשים{g.side ? ` · ${g.side}` : ""}
          </div>
        </div>
        <ArrivalButtons g={g} onUpdate={onUpdate} readOnly={readOnly} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <GiftInput g={g} onUpdate={onUpdate} readOnly={readOnly} />
        <PaymentSelect g={g} onUpdate={onUpdate} readOnly={readOnly} />
        <button
          onClick={() => setOpen((v) => !v)}
          className="ms-auto inline-flex min-h-9 items-center gap-1 rounded-lg border border-border px-2 text-xs text-muted-foreground hover:bg-secondary"
        >
          פרטים <ChevronDown size={14} className={open ? "rotate-180 transition" : "transition"} />
        </button>
      </div>
      {open && (
        <div className="mt-3 space-y-2 border-t border-border pt-3 text-sm">
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">טלפון</span>
            <span>{g.phone || "—"}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">אימייל</span>
            <span className="truncate">{g.email || "—"}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">הגיעו בפועל</span>
            <input
              type="number"
              disabled={readOnly}
              className="min-h-9 w-20 rounded-lg border border-border bg-background px-2 text-sm"
              value={g.arrived_count ?? ""}
              onChange={(e) => onUpdate(g.id, { arrived_count: Number(e.target.value) || 0 })}
              aria-label="כמה הגיעו"
            />
          </div>
          {g.notes && <div className="text-muted-foreground">{g.notes}</div>}
          {!readOnly && (
            <button
              onClick={() => onDelete(g.id)}
              className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-destructive/40 px-3 text-xs text-destructive hover:bg-destructive/10"
            >
              <Trash2 size={14} /> מחק אורח
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function GuestTable({ guests, onUpdate, onDelete, readOnly }: Props) {
  if (guests.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
        אין אורחים להצגה
      </div>
    );
  }

  return (
    <>
      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {guests.map((g) => (
          <GuestCard key={g.id} g={g} onUpdate={onUpdate} onDelete={onDelete} readOnly={readOnly} />
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border md:block">
        <table className="w-full text-right text-sm">
          <thead className="bg-secondary/60 text-xs text-muted-foreground">
            <tr>
              <th className="p-3 font-medium">שם</th>
              <th className="p-3 font-medium">כמות</th>
              <th className="p-3 font-medium">צד</th>
              <th className="p-3 font-medium">טלפון</th>
              <th className="p-3 font-medium">הגעה</th>
              <th className="p-3 font-medium">הגיעו</th>
              <th className="p-3 font-medium">מתנה</th>
              <th className="p-3 font-medium">תשלום</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {guests.map((g) => (
              <tr key={g.id} className="border-t border-border align-middle">
                <td className="p-3 font-medium text-foreground">
                  {g.full_name}
                  {g.notes && <div className="text-xs text-muted-foreground">{g.notes}</div>}
                </td>
                <td className="p-3">{g.group_size}</td>
                <td className="p-3">{g.side ?? "—"}</td>
                <td className="p-3 text-muted-foreground">{g.phone ?? "—"}</td>
                <td className="p-3">
                  <ArrivalButtons g={g} onUpdate={onUpdate} readOnly={readOnly} />
                </td>
                <td className="p-3">
                  <input
                    type="number"
                    disabled={readOnly}
                    className="min-h-9 w-16 rounded-lg border border-border bg-background px-2 text-sm"
                    value={g.arrived_count ?? ""}
                    onChange={(e) => onUpdate(g.id, { arrived_count: Number(e.target.value) || 0 })}
                    aria-label="כמה הגיעו"
                  />
                </td>
                <td className="p-3">
                  <GiftInput g={g} onUpdate={onUpdate} readOnly={readOnly} />
                </td>
                <td className="p-3">
                  <PaymentSelect g={g} onUpdate={onUpdate} readOnly={readOnly} />
                </td>
                <td className="p-3">
                  {!readOnly && (
                    <button
                      onClick={() => onDelete(g.id)}
                      aria-label="מחק"
                      className="rounded-lg p-2 text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 text-xs text-muted-foreground md:hidden">
        סה״כ מתנות ברשימה: {formatILS(guests.reduce((s, g) => s + Number(g.gift_amount || 0), 0))}
      </div>
    </>
  );
}
