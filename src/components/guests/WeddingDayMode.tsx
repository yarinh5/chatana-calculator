import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Gift, Search, X } from "lucide-react";
import { formatILS } from "@/lib/wedding-data";
import { arrivalPatch, receptionSearch, receptionSummary } from "@/lib/wedding-day";
import { PAYMENT_METHODS, type Guest, type PaymentMethod } from "@/hooks/useGuests";

type GiftDraft = { amount: string; method: string };

export function WeddingDayMode({
  guests,
  stats,
  onUpdate,
  readOnly,
  attendanceLocked,
  onAttendanceBlocked,
  canViewGifts = true,
  giftsReadOnly,
  canViewSeating = false,
}: {
  guests: Guest[];
  stats: { arrivedCount: number; totalInvited: number; totalGifts: number };
  onUpdate: (id: string, updates: Partial<Guest>) => Promise<boolean>;
  readOnly?: boolean;
  attendanceLocked?: boolean;
  onAttendanceBlocked?: () => void;
  canViewGifts?: boolean;
  giftsReadOnly?: boolean;
  canViewSeating?: boolean;
}) {
  const [term, setTerm] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [arrivalDrafts, setArrivalDrafts] = useState<Record<string, string>>({});
  const [giftDrafts, setGiftDrafts] = useState<Record<string, GiftDraft>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const pendingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const results = useMemo(() => receptionSearch(guests, term), [guests, term]);
  const calculated = useMemo(() => receptionSummary(guests), [guests]);
  const arrivedCount = calculated.arrived;
  const invitedCount = calculated.invited;

  function showDetails(guest: Guest) {
    if (pendingRef.current) return;
    setOpenId((current) => (current === guest.id ? null : guest.id));
    setArrivalDrafts((current) => ({
      ...current,
      [guest.id]: String(guest.arrived ? (guest.arrived_count ?? guest.group_size) : 0),
    }));
    setGiftDrafts((current) => ({
      ...current,
      [guest.id]: {
        amount: String(Number(guest.gift_amount) || 0),
        method: guest.payment_method ?? "",
      },
    }));
    setErrors((current) => ({ ...current, [guest.id]: "" }));
  }

  async function save(guest: Guest, updates: Partial<Guest>, kind: "attendance" | "gift") {
    if (readOnly || pendingRef.current) return;
    if (kind === "attendance" && attendanceLocked) {
      onAttendanceBlocked?.();
      return;
    }
    if (kind === "gift" && giftsReadOnly) return;
    pendingRef.current = true;
    setPendingId(guest.id);
    setErrors((current) => ({ ...current, [guest.id]: "" }));
    try {
      const ok = await onUpdate(guest.id, updates);
      if (!mountedRef.current) return;
      if (!ok) {
        setErrors((current) => ({
          ...current,
          [guest.id]: "הפעולה לא נשמרה. הפרטים נשארו לעריכה; נסו שוב.",
        }));
        return;
      }
      if (kind === "attendance") {
        if (updates.arrived_count !== undefined && updates.arrived_count !== null) {
          setArrivalDrafts((current) => ({
            ...current,
            [guest.id]: String(updates.arrived_count),
          }));
        }
        setOpenId(guest.id);
      }
    } catch {
      if (mountedRef.current)
        setErrors((current) => ({
          ...current,
          [guest.id]: "שגיאת תקשורת. הפעולה לא אושרה; נסו שוב.",
        }));
    } finally {
      pendingRef.current = false;
      if (mountedRef.current) setPendingId(null);
    }
  }

  function savePartial(guest: Guest) {
    if (attendanceLocked) {
      onAttendanceBlocked?.();
      return;
    }
    const raw = arrivalDrafts[guest.id]?.trim() ?? "";
    if (!raw) {
      setErrors((current) => ({ ...current, [guest.id]: "יש להזין מספר אנשים שהגיעו." }));
      return;
    }
    try {
      void save(guest, arrivalPatch(Number(raw), guest.group_size), "attendance");
    } catch (reason) {
      setErrors((current) => ({
        ...current,
        [guest.id]: reason instanceof Error ? reason.message : "מספר לא תקין",
      }));
    }
  }

  function saveGift(guest: Guest) {
    const draft = giftDrafts[guest.id];
    const amount = Number(draft?.amount);
    if (!draft || !draft.amount.trim() || !Number.isFinite(amount) || amount < 0) {
      setErrors((current) => ({ ...current, [guest.id]: "יש להזין סכום מתנה תקין שאינו שלילי." }));
      return;
    }
    if (draft.method && !PAYMENT_METHODS.includes(draft.method as PaymentMethod)) {
      setErrors((current) => ({ ...current, [guest.id]: "אמצעי התשלום אינו תקין." }));
      return;
    }
    void save(
      guest,
      { gift_amount: amount, payment_method: (draft.method || null) as PaymentMethod | null },
      "gift",
    );
  }

  return (
    <div className="space-y-4">
      <div
        className={`grid gap-2 ${canViewGifts ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3"}`}
      >
        {[
          ["הגיעו", arrivedCount],
          ["חסרים", Math.max(0, invitedCount - arrivedCount)],
          ["הגעה חלקית", calculated.partialGroups],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-2xl bg-card p-3 text-center shadow-sm ring-1 ring-border"
          >
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="font-display text-2xl tabular-nums">{value}</div>
          </div>
        ))}
        {canViewGifts && (
          <div className="rounded-2xl bg-card p-3 text-center shadow-sm ring-1 ring-border">
            <div className="text-xs text-muted-foreground">מתנות</div>
            <div className="font-display text-2xl tabular-nums text-gold">
              {formatILS(stats.totalGifts)}
            </div>
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {arrivedCount} מתוך {invitedCount} מוזמנים סומנו כהגיעו. כברירת מחדל מוצגות קבוצות שטרם
        הגיעו או שהגיעו חלקית.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {canViewSeating && (
          <Link
            to="/seating"
            className="rounded-full border border-border bg-card px-3 py-2 text-sm"
          >
            סקיצת אולם (טיוטה מקומית)
          </Link>
        )}
        <span className="text-xs text-muted-foreground">
          מספרי שולחנות אינם שמורים עדיין ליום החתונה.
        </span>
      </div>
      <div className="sticky top-16 z-10 rounded-2xl bg-card p-2 shadow-sm ring-1 ring-border">
        <label className="flex items-center gap-2">
          <Search size={18} className="text-muted-foreground" />
          <span className="sr-only">חיפוש מהיר לפי שם או טלפון</span>
          <input
            autoFocus
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="חיפוש מהיר לפי שם או טלפון..."
            className="min-h-12 w-full bg-transparent text-base outline-none"
          />
        </label>
      </div>
      <div className="space-y-3">
        {results.map((guest) => {
          const open = openId === guest.id;
          const busy = pendingId === guest.id;
          const currentCount = guest.arrived
            ? Math.max(0, Math.min(guest.group_size, guest.arrived_count ?? guest.group_size))
            : 0;
          return (
            <article
              key={guest.id}
              className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-semibold">{guest.full_name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {currentCount} מתוך {guest.group_size} הגיעו
                    {guest.side ? ` · ${guest.side}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={readOnly || !!pendingId}
                    onClick={() =>
                      void save(
                        guest,
                        arrivalPatch(guest.group_size, guest.group_size),
                        "attendance",
                      )
                    }
                    aria-label={`סמן את כל קבוצת ${guest.full_name} כהגיעה`}
                    className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border disabled:opacity-50 ${guest.arrived && currentCount === guest.group_size ? "border-emerald-600 bg-emerald-600 text-white" : "border-emerald-600/40 text-emerald-700"}`}
                  >
                    <Check size={20} />
                  </button>
                  <button
                    type="button"
                    disabled={readOnly || !!pendingId}
                    onClick={() =>
                      void save(guest, arrivalPatch(0, guest.group_size), "attendance")
                    }
                    aria-label={`סמן את קבוצת ${guest.full_name} כלא הגיעה`}
                    className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border disabled:opacity-50 ${guest.arrived === false ? "border-destructive bg-destructive text-white" : "border-destructive/40 text-destructive"}`}
                  >
                    <X size={20} />
                  </button>
                  <button
                    type="button"
                    onClick={() => showDetails(guest)}
                    disabled={!!pendingId}
                    className="rounded-xl border border-border px-3 text-sm disabled:opacity-50"
                  >
                    {open ? "סגור פרטים" : "הגעה חלקית / מתנה"}
                  </button>
                </div>
              </div>
              {errors[guest.id] && (
                <p role="alert" className="mt-2 text-sm text-destructive">
                  {errors[guest.id]}
                </p>
              )}
              {open && (
                <div className="mt-3 space-y-3 border-t border-border pt-3">
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="text-sm">
                      מספר אנשים שהגיעו
                      <input
                        type="number"
                        min="0"
                        max={guest.group_size}
                        inputMode="numeric"
                        disabled={readOnly || busy}
                        value={arrivalDrafts[guest.id] ?? String(currentCount)}
                        onChange={(event) =>
                          setArrivalDrafts((current) => ({
                            ...current,
                            [guest.id]: event.target.value,
                          }))
                        }
                        className="mt-1 block min-h-10 w-24 rounded-lg border border-border bg-background px-2"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={readOnly || !!pendingId}
                      onClick={() => savePartial(guest)}
                      className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-50"
                    >
                      שמור הגעה חלקית
                    </button>
                  </div>
                  {canViewGifts && (
                    <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
                      <Gift size={17} className="mb-2 text-gold" />
                      <label className="text-sm">
                        סכום מתנה
                        <input
                          type="number"
                          min="0"
                          inputMode="decimal"
                          disabled={readOnly || giftsReadOnly || busy}
                          value={
                            giftDrafts[guest.id]?.amount ?? String(Number(guest.gift_amount) || 0)
                          }
                          onChange={(event) =>
                            setGiftDrafts((current) => ({
                              ...current,
                              [guest.id]: {
                                amount: event.target.value,
                                method: current[guest.id]?.method ?? guest.payment_method ?? "",
                              },
                            }))
                          }
                          className="mt-1 block min-h-10 w-28 rounded-lg border border-border bg-background px-2"
                        />
                      </label>
                      <label className="text-sm">
                        אמצעי תשלום
                        <select
                          disabled={readOnly || giftsReadOnly || busy}
                          value={giftDrafts[guest.id]?.method ?? guest.payment_method ?? ""}
                          onChange={(event) =>
                            setGiftDrafts((current) => ({
                              ...current,
                              [guest.id]: {
                                amount:
                                  current[guest.id]?.amount ??
                                  String(Number(guest.gift_amount) || 0),
                                method: event.target.value,
                              },
                            }))
                          }
                          className="mt-1 block min-h-10 rounded-lg border border-border bg-background px-2"
                        >
                          <option value="">לא צוין</option>
                          {PAYMENT_METHODS.map((method) => (
                            <option key={method} value={method}>
                              {method}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        disabled={readOnly || giftsReadOnly || !!pendingId}
                        onClick={() => saveGift(guest)}
                        className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-50"
                      >
                        שמור מתנה
                      </button>
                    </div>
                  )}
                  {busy && (
                    <p role="status" className="text-xs text-muted-foreground">
                      שומרים...
                    </p>
                  )}
                </div>
              )}
            </article>
          );
        })}
        {results.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            לא נמצאו קבוצות מוזמנים.
          </div>
        )}
      </div>
    </div>
  );
}
