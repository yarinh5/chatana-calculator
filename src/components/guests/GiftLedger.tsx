import { useMemo, useState } from "react";
import type { Guest } from "@/hooks/useGuests";
import { formatGiftAmount, listRecordedGifts } from "@/lib/gifts";

const PAGE_SIZE = 50;

export function GiftLedger({
  guests,
  canViewGifts,
  invalidGiftRows,
}: {
  guests: readonly Guest[];
  canViewGifts: boolean;
  invalidGiftRows: number;
}) {
  const [search, setSearch] = useState("");
  const [side, setSide] = useState("");
  const [method, setMethod] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const entries = useMemo(
    () => (canViewGifts ? listRecordedGifts(guests) : []),
    [canViewGifts, guests],
  );
  const sides = useMemo(
    () => [...new Set(entries.map((entry) => entry.side))].sort((a, b) => a.localeCompare(b, "he")),
    [entries],
  );
  const methods = useMemo(
    () =>
      [...new Set(entries.map((entry) => entry.paymentMethod))].sort((a, b) =>
        a.localeCompare(b, "he"),
      ),
    [entries],
  );
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("he");
    return entries.filter(
      (entry) =>
        (!term || entry.name.toLocaleLowerCase("he").includes(term)) &&
        (!side || entry.side === side) &&
        (!method || entry.paymentMethod === method),
    );
  }, [entries, method, search, side]);

  if (!canViewGifts) return null;

  return (
    <section
      className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5"
      aria-label="פירוט מתנות שנרשמו"
    >
      <h2 className="font-display text-lg text-foreground">פירוט מתנות שנרשמו</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        הסכום שייך לקבוצת הזמנה. מוצגות רק מתנות חיוביות עם סכום תקין, מתוך נתוני המוזמנים השמורים.
      </p>
      {invalidGiftRows > 0 && (
        <p role="status" className="mt-2 text-xs text-amber-700">
          {invalidGiftRows} רשומות עם סכום לא תקין אינן מוצגות בפירוט.
        </p>
      )}
      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">אין עדיין מתנות חיוביות להצגה.</p>
      ) : (
        <>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <label className="text-xs text-muted-foreground">
              חיפוש קבוצה
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setVisibleCount(PAGE_SIZE);
                }}
                placeholder="שם קבוצה"
                className="mt-1 min-h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
              />
            </label>
            <label className="text-xs text-muted-foreground">
              צד
              <select
                value={side}
                onChange={(event) => {
                  setSide(event.target.value);
                  setVisibleCount(PAGE_SIZE);
                }}
                className="mt-1 min-h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
              >
                <option value="">כל הצדדים</option>
                {sides.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              אמצעי תשלום
              <select
                value={method}
                onChange={(event) => {
                  setMethod(event.target.value);
                  setVisibleCount(PAGE_SIZE);
                }}
                className="mt-1 min-h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
              >
                <option value="">כל האמצעים</option>
                {methods.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="mt-3 text-xs text-muted-foreground" role="status">
            {filtered.length} מתוך {entries.length} קבוצות עם מתנה
          </p>
          {filtered.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">לא נמצאו מתנות לפי הסינון שנבחר.</p>
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {filtered.slice(0, visibleCount).map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{entry.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {entry.side} · {entry.paymentMethod}
                    </p>
                  </div>
                  <strong className="tabular-nums">{formatGiftAmount(entry.amount)}</strong>
                </li>
              ))}
            </ul>
          )}
          {filtered.length > visibleCount && (
            <button
              type="button"
              onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
              className="mt-3 min-h-10 rounded-lg border border-border px-3 text-sm"
            >
              הצג עוד מתנות
            </button>
          )}
        </>
      )}
    </section>
  );
}
