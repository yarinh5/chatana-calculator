import { useEffect, useMemo, useRef, useState } from "react";
import { FileJson, Info, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  MAX_CATALOG_BYTES,
  parsePriceCatalogJson,
  previewCatalogRange,
  type PriceCatalog,
} from "@/lib/market-catalog";
import { CATEGORIES, type CategoryKey } from "@/lib/wedding-data";

const formatPrice = (value: number) =>
  `${value.toLocaleString("he-IL", { maximumFractionDigits: 2 })} ₪`;

const UNIT_LABELS = {
  event: "אירוע",
  guest: "אורח צפוי",
  meal: "מנה",
  table: "שולחן",
  hour: "שעה",
  package: "חבילה",
} as const;

const LEGACY_UNIT_LABELS = {
  item: "פריט",
  guest: "אורח צפוי",
  invited: "מוזמן",
  tables: "שולחן",
} as const;

type Selection = { selected: boolean; quantity: number };

export function MarketCatalogPreview({ eventName }: { eventName: string }) {
  const [catalog, setCatalog] = useState<PriceCatalog | null>(null);
  const [selections, setSelections] = useState<Record<string, Selection>>({});
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<CategoryKey | "all">("all");
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const mountedRef = useRef(true);
  const requestRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestRef.current += 1;
    };
  }, []);

  const loadFile = async (file: File | null) => {
    if (!file) return;
    const request = ++requestRef.current;
    setError(null);
    setReading(true);
    try {
      if (file.size > MAX_CATALOG_BYTES)
        throw new Error("קובץ המחירון גדול מדי. הגודל המרבי הוא 1MB.");
      if (!file.name.toLowerCase().endsWith(".json")) throw new Error("יש לבחור קובץ JSON בלבד.");
      const nextCatalog = parsePriceCatalogJson(await file.text());
      if (!mountedRef.current || request !== requestRef.current) return;
      setCatalog(nextCatalog);
      setSelections({});
      setSearch("");
      setCategory("all");
    } catch (cause) {
      if (mountedRef.current && request === requestRef.current)
        setError(cause instanceof Error ? cause.message : "לא הצלחנו לקרוא את הקובץ.");
    } finally {
      if (mountedRef.current && request === requestRef.current) setReading(false);
    }
  };

  const visibleItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("he-IL");
    return (catalog?.items ?? []).filter(
      (item) =>
        (category === "all" || item.category === category) &&
        (!query || item.name.toLocaleLowerCase("he-IL").includes(query)),
    );
  }, [catalog, category, search]);

  const selectedCount = Object.values(selections).filter((selection) => selection.selected).length;
  let total = { min: 0, typical: 0, max: 0 } as ReturnType<typeof previewCatalogRange>;
  let totalError: string | null = null;
  if (catalog) {
    try {
      total = previewCatalogRange(catalog, selections);
    } catch (cause) {
      totalError = cause instanceof Error ? cause.message : "הכמויות אינן תקינות.";
    }
  }

  return (
    <div className="space-y-5" dir="rtl">
      <header>
        <h1 className="font-display text-2xl text-foreground sm:text-3xl">מחירון לתכנון</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {eventName} · תצוגה מקומית של קובץ שהבאתם
        </p>
      </header>
      <div
        role="status"
        className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
      >
        <strong>אין כאן מחירי שוק חיים.</strong> הנתונים מגיעים רק מקובץ שתבחרו. יש לבדוק את מקורם
        ותוקפם. הקובץ, הבחירה והחישוב נשארים בדפדפן בלבד; רענון או יציאה ימחקו אותם. התצוגה אינה
        מוסיפה הוצאות לתקציב.
      </div>
      <section className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <FileJson size={19} /> טעינת מחירון מקומי
        </h2>
        <p className="text-sm text-muted-foreground">
          קובץ JSON עד 1MB, עם גרסה, מקור, תאריך תוקף, מטבע ILS ופריטים. כל פריט בפורמט החדש כולל
          טווח מחירים, אזור, מודל תמחור, מקור ותאריך עדכון. המחירון הקשיח הישן במחשבון הוא דוגמה
          בלבד ואינו מקור מאומת למחירים עדכניים.
        </p>
        <input
          type="file"
          accept=".json,application/json"
          disabled={reading}
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            event.target.value = "";
            void loadFile(file);
          }}
          className="block w-full rounded-lg border border-input bg-background p-2 text-sm"
          aria-label="בחרו קובץ מחירון JSON"
        />
        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer">מבנה קובץ לדוגמה</summary>
          <pre
            dir="ltr"
            className="mt-2 max-w-full overflow-auto rounded-lg bg-secondary p-3 text-xs"
          >{`{
  "version": "2026-01",
  "source": "מחירון שהזוג בדק",
  "effectiveDate": "2026-01-01",
  "currency": "ILS",
  "format": "range-v2",
  "items": [{
    "id": "dj-1",
    "name": "DJ",
    "category": "music",
    "pricingModel": "event",
    "region": "מרכז",
    "source": "הצעות מחיר שנבדקו ידנית",
    "updatedAt": "2026-01-01",
    "min": 6000,
    "typical": 7000,
    "max": 9000
  }]
}`}</pre>
          <p className="mt-1">הערכים בדוגמה ממחישים פורמט בלבד ואינם הצעת מחיר.</p>
        </details>
        {reading && (
          <p role="status" className="text-sm">
            קורא ומאמת את הקובץ...
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </section>

      {catalog ? (
        <section className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4 text-sm">
            <h2 className="font-semibold">{catalog.source}</h2>
            <p>
              גרסה {catalog.version} · תאריך תוקף {catalog.effectiveDate} · {catalog.items.length}{" "}
              פריטים · ILS
            </p>
            <p className="mt-1 text-muted-foreground">
              מקור ותאריך הוצהרו בקובץ ולא אומתו מול ספק חיצוני.
            </p>
            {catalog.format === "legacy-point-v1" && (
              <p className="mt-2 font-medium text-amber-700">
                פורמט ישן: לכל פריט מחיר נקודתי בלבד. אין טווח, אזור, מקור ותאריך עדכון ברמת הפריט.
              </p>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 rounded-lg border border-input bg-background px-3">
              <Search size={16} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="חיפוש פריט"
                className="min-h-10 w-full bg-transparent outline-none"
              />
            </label>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as CategoryKey | "all")}
              aria-label="סינון קטגוריה"
              className="min-h-10 rounded-lg border border-input bg-background px-3"
            >
              <option value="all">כל הקטגוריות</option>
              {Object.entries(CATEGORIES).map(([key, value]) => (
                <option key={key} value={key}>
                  {value.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            {visibleItems.length === 0 && (
              <p className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                לא נמצאו פריטים.
              </p>
            )}
            {visibleItems.map((item) => {
              const selection = selections[item.id] ?? { selected: false, quantity: 1 };
              return (
                <article
                  key={item.id}
                  className="grid gap-3 rounded-xl border border-border bg-card p-3 sm:grid-cols-[auto_1fr_auto_auto] sm:items-center"
                >
                  <input
                    type="checkbox"
                    checked={selection.selected}
                    onChange={(event) =>
                      setSelections((current) => ({
                        ...current,
                        [item.id]: { ...selection, selected: event.target.checked },
                      }))
                    }
                    aria-label={`בחרו ${item.name} לחישוב מקומי`}
                    className="h-4 w-4"
                  />
                  <div className="min-w-0 text-sm">
                    <h3 className="break-words font-medium">{item.name}</h3>
                    <p className="text-muted-foreground">
                      {CATEGORIES[item.category].label} · מחיר ל
                      {item.pricingModel
                        ? UNIT_LABELS[item.pricingModel]
                        : LEGACY_UNIT_LABELS[item.legacyUnit!]}
                    </p>
                    {item.region && (
                      <p className="text-xs text-muted-foreground">
                        {item.region} · {item.source} · עודכן {item.updatedAt}
                      </p>
                    )}
                  </div>
                  <span className="text-sm font-semibold">
                    {item.min !== null && item.max !== null ? (
                      <>
                        {formatPrice(item.min)}–{formatPrice(item.max)}
                        <small className="block font-normal text-muted-foreground">
                          טיפוסי {formatPrice(item.typical)}
                        </small>
                      </>
                    ) : (
                      <>מחיר נקודתי {formatPrice(item.typical)}</>
                    )}
                  </span>
                  <label className="flex items-center gap-2 text-sm">
                    <span>כמות</span>
                    <input
                      type="number"
                      min={1}
                      max={1000000}
                      step={1}
                      value={selection.quantity}
                      onChange={(event) =>
                        setSelections((current) => ({
                          ...current,
                          [item.id]: { ...selection, quantity: Number(event.target.value) },
                        }))
                      }
                      className="w-24 rounded-lg border border-input bg-background p-2"
                      aria-label={`כמות ${item.name}`}
                    />
                  </label>
                </article>
              );
            })}
          </div>
          <div
            className="sticky bottom-3 rounded-xl border border-border bg-card p-4 shadow-lg"
            role="status"
          >
            {totalError ? (
              <p className="text-sm text-destructive">{totalError}</p>
            ) : (
              <p className="font-semibold">
                {selectedCount} פריטים נבחרו · מחיר טיפוסי לתכנון: {formatPrice(total.typical)}
              </p>
            )}
            {!totalError && total.min !== null && total.max !== null && selectedCount > 0 && (
              <p className="text-sm">
                טווח: {formatPrice(total.min)}–{formatPrice(total.max)}
              </p>
            )}
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Info size={14} /> סכום לדוגמה בלבד; לא נשמר בהוצאות.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setCatalog(null);
              setSelections({});
            }}
          >
            נקה מחירון מקומי
          </Button>
        </section>
      ) : (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          בחרו קובץ כדי להציג מחירים. אין מחירון מאומת טעון כרגע.
        </p>
      )}
    </div>
  );
}
