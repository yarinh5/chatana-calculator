import { useMemo, useState } from "react";
import { Search, Check, X, Gift } from "lucide-react";
import { formatILS } from "@/lib/wedding-data";
import { PAYMENT_METHODS, type Guest, type PaymentMethod } from "@/hooks/useGuests";

export function WeddingDayMode({
  guests,
  stats,
  onUpdate,
  readOnly,
}: {
  guests: Guest[];
  stats: { arrivedCount: number; totalInvited: number; totalGifts: number };
  onUpdate: (id: string, updates: Partial<Guest>) => void;
  readOnly?: boolean;
}) {
  const [term, setTerm] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const results = useMemo(() => {
    const t = term.trim();
    if (!t) return guests.filter((g) => g.arrived === null).slice(0, 25);
    return guests
      .filter((g) => g.full_name.includes(t) || (g.phone ?? "").includes(t))
      .slice(0, 40);
  }, [guests, term]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-card p-3 text-center shadow-sm ring-1 ring-border transition-all duration-300 hover:shadow-md">
          <div className="text-xs text-muted-foreground">הגיעו</div>
          <div className="font-display text-2xl tabular-nums text-foreground">{stats.arrivedCount}</div>
        </div>
        <div className="rounded-2xl bg-card p-3 text-center shadow-sm ring-1 ring-border transition-all duration-300 hover:shadow-md">
          <div className="text-xs text-muted-foreground">מתוך</div>
          <div className="font-display text-2xl tabular-nums text-foreground">{stats.totalInvited}</div>
        </div>
        <div className="rounded-2xl bg-card p-3 text-center shadow-sm ring-1 ring-border transition-all duration-300 hover:shadow-md">
          <div className="text-xs text-muted-foreground">מתנות</div>
          <div className="font-display text-2xl tabular-nums text-gold">{formatILS(stats.totalGifts)}</div>
        </div>
      </div>

      <div className="sticky top-16 z-10 rounded-2xl bg-card p-2 shadow-sm ring-1 ring-border">
        <div className="flex items-center gap-2">
          <Search size={18} className="text-muted-foreground" />
          <input
            autoFocus
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="חיפוש מהיר לפי שם או טלפון..."
            className="min-h-12 w-full bg-transparent text-base outline-none"
          />
        </div>
      </div>

      <div className="space-y-3">
        {results.map((g) => (
          <div key={g.id} className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border transition-all duration-300 hover:shadow-md">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-lg font-semibold text-foreground">{g.full_name}</div>
                <div className="text-xs text-muted-foreground">
                  {g.group_size} אנשים{g.side ? ` · ${g.side}` : ""}
                  {Number(g.gift_amount) > 0 ? ` · ${formatILS(Number(g.gift_amount))}` : ""}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  disabled={readOnly}
                  onClick={() => {
                    onUpdate(g.id, { arrived: true, arrived_count: g.arrived_count ?? g.group_size });
                    setOpenId(g.id);
                  }}
                  className={`inline-flex min-h-12 min-w-12 items-center justify-center rounded-xl border ${
                    g.arrived === true
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-emerald-600/40 text-emerald-700 hover:bg-emerald-600/10"
                  }`}
                  aria-label="הגיע"
                >
                  <Check size={22} />
                </button>
                <button
                  disabled={readOnly}
                  onClick={() => onUpdate(g.id, { arrived: false, arrived_count: 0 })}
                  className={`inline-flex min-h-12 min-w-12 items-center justify-center rounded-xl border ${
                    g.arrived === false
                      ? "border-destructive bg-destructive text-white"
                      : "border-destructive/40 text-destructive hover:bg-destructive/10"
                  }`}
                  aria-label="לא הגיע"
                >
                  <X size={22} />
                </button>
              </div>
            </div>

            {(openId === g.id || Number(g.gift_amount) > 0) && (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                <Gift size={16} className="text-gold" />
                <input
                  type="number"
                  inputMode="numeric"
                  disabled={readOnly}
                  placeholder="סכום מתנה"
                  className="min-h-11 w-28 rounded-xl border border-border bg-background px-3 text-base"
                  value={Number(g.gift_amount) || ""}
                  onChange={(e) => onUpdate(g.id, { gift_amount: Number(e.target.value) || 0 })}
                  aria-label="סכום מתנה"
                />
                <select
                  disabled={readOnly}
                  className="min-h-11 rounded-xl border border-border bg-background px-3 text-base"
                  value={g.payment_method ?? ""}
                  onChange={(e) =>
                    onUpdate(g.id, { payment_method: (e.target.value || null) as PaymentMethod | null })
                  }
                  aria-label="אמצעי תשלום"
                >
                  <option value="">אמצעי תשלום</option>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  disabled={readOnly}
                  className="min-h-11 w-20 rounded-xl border border-border bg-background px-3 text-base"
                  value={g.arrived_count ?? ""}
                  onChange={(e) => onUpdate(g.id, { arrived_count: Number(e.target.value) || 0 })}
                  aria-label="כמה הגיעו"
                />
              </div>
            )}
          </div>
        ))}
        {results.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            לא נמצאו אורחים
          </div>
        )}
      </div>
    </div>
  );
}
