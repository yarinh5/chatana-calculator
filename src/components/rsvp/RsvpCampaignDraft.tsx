import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  prepareCampaignPreview,
  type CampaignCandidate,
  type CampaignSelection,
} from "@/lib/rsvp-campaign";
import type { RsvpRow } from "@/lib/rsvp";

type GuestMetadata = { category: string | null; side: string | null };
type SelectionKind = "all" | "not_sent" | "unanswered" | "manual" | "category" | "side";

const DEFAULT_TEMPLATE = "היי $שם_פרטי, נשמח לראות אותך בחתונה שלנו 💍\nנא לאשר הגעה כאן: $קישור";
const EMPTY_METADATA: Record<string, GuestMetadata> = {};
const PROBLEM_LABELS = {
  invalid_phone: "מספר טלפון חסר או לא תקין",
  duplicate_phone: "מספר טלפון כפול",
  missing_name: "שם חסר",
  missing_link: "קישור RSVP אישי חסר או לא תקין",
  missing_variable: "פרט חסר בתבנית",
} as const;

function isCurrentRsvpLink(value: string) {
  try {
    const url = new URL(value);
    return (
      url.origin === window.location.origin &&
      /^\/rsvp\/[^/]+$/u.test(url.pathname) &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

export function RsvpCampaignDraft({
  eventId,
  rows,
  canViewGuests,
  weddingDate,
  onClose,
}: {
  eventId: string;
  rows: RsvpRow[];
  canViewGuests: boolean;
  weddingDate: string | null;
  onClose: () => void;
}) {
  const [selectionKind, setSelectionKind] = useState<SelectionKind>("all");
  const [category, setCategory] = useState("");
  const [side, setSide] = useState<"חתן" | "כלה" | "משותף">("משותף");
  const [manualIds, setManualIds] = useState<ReadonlySet<string>>(new Set());
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [coupleNames, setCoupleNames] = useState("");
  const [venueName, setVenueName] = useState("");
  const [date, setDate] = useState(weddingDate ?? "");
  const [links, setLinks] = useState<Record<string, string>>({});
  const [senderSource, setSenderSource] = useState<"central" | "couple">("central");
  const [metadataState, setMetadataState] = useState<{
    eventId: string;
    values: Record<string, GuestMetadata>;
    error: boolean;
  }>({ eventId, values: {}, error: false });

  useEffect(() => {
    setSelectionKind("all");
    setCategory("");
    setManualIds(new Set());
    setTemplate(DEFAULT_TEMPLATE);
    setCoupleNames("");
    setVenueName("");
    setDate(weddingDate ?? "");
    setLinks({});
    setSenderSource("central");
  }, [eventId, weddingDate]);

  useEffect(() => {
    let cancelled = false;
    if (!canViewGuests) return;
    void (async () => {
      const { data, error } = await supabase.rpc("list_workspace_guests", { _event_id: eventId });
      if (cancelled) return;
      if (error) {
        setMetadataState({ eventId, values: {}, error: true });
        return;
      }
      const values: Record<string, GuestMetadata> = {};
      for (const guest of data ?? []) {
        values[guest.id] = {
          category: guest.group_category ?? null,
          side: guest.side ?? null,
        };
      }
      setMetadataState({ eventId, values, error: false });
    })();
    return () => {
      cancelled = true;
    };
  }, [canViewGuests, eventId]);

  useEffect(() => {
    if (!canViewGuests) {
      setSelectionKind((current) =>
        current === "category" || current === "side" ? "all" : current,
      );
    }
  }, [canViewGuests]);

  const metadata =
    canViewGuests && metadataState.eventId === eventId ? metadataState.values : EMPTY_METADATA;
  const categories = useMemo(
    () =>
      [
        ...new Set(
          Object.values(metadata)
            .map((item) => item.category)
            .filter((value): value is string => !!value),
        ),
      ].sort((a, b) => a.localeCompare(b, "he")),
    [metadata],
  );
  const candidates = useMemo<CampaignCandidate[]>(
    () =>
      rows.map((row) => ({
        guestId: row.guest_id,
        fullName: row.guest_name ?? "",
        phone: row.guest_phone ?? null,
        category: metadata[row.guest_id]?.category ?? null,
        side: metadata[row.guest_id]?.side ?? null,
        rsvpStatus:
          row.status === "confirmed"
            ? "confirmed"
            : row.status === "declined"
              ? "declined"
              : row.status === "partially_confirmed"
                ? "partial"
                : row.status === "not_sent"
                  ? null
                  : "awaiting",
        lastInvitationSentAt: row.sent_at ?? null,
        rsvpLink:
          row.link_active && isCurrentRsvpLink(links[row.guest_id] ?? "")
            ? links[row.guest_id]
            : null,
      })),
    [links, metadata, rows],
  );

  const selection = useMemo<CampaignSelection>(
    () =>
      selectionKind === "manual"
        ? { kind: "manual", guestIds: manualIds }
        : selectionKind === "category"
          ? { kind: "category", value: category }
          : selectionKind === "side"
            ? { kind: "side", value: side }
            : selectionKind === "not_sent"
              ? { kind: "not_sent" }
              : selectionKind === "unanswered"
                ? { kind: "unanswered" }
                : { kind: "all" },
    [category, manualIds, selectionKind, side],
  );

  const selectedCandidates = candidates.filter((candidate) => {
    if (selection.kind === "all") return true;
    if (selection.kind === "manual") return selection.guestIds.has(candidate.guestId);
    if (selection.kind === "category") return candidate.category === selection.value;
    if (selection.kind === "side") return candidate.side === selection.value;
    if (selection.kind === "not_sent") return candidate.lastInvitationSentAt === null;
    return (
      candidate.rsvpStatus === null ||
      candidate.rsvpStatus === "awaiting" ||
      candidate.rsvpStatus === "partial"
    );
  });

  const result = useMemo(() => {
    try {
      if (![...template.matchAll(/\$[\p{L}_]+/gu)].some((match) => match[0] === "$קישור")) {
        throw new Error("הודעת אישורי הגעה חייבת לכלול את המשתנה $קישור");
      }
      const preview = prepareCampaignPreview(candidates, selection, template, {
        coupleNames,
        weddingDate: date ? date.split("-").reverse().join("/") : "",
        venueName,
      });
      return { preview, error: null as string | null };
    } catch (error) {
      return {
        preview: [],
        error: error instanceof Error ? error.message : "לא ניתן להכין תצוגה מקדימה",
      };
    }
  }, [candidates, selection, template, coupleNames, date, venueName]);

  const ready = result.preview.filter((recipient) => recipient.problems.length === 0);
  const blocked = result.preview.length - ready.length;
  const countProblem = (problem: keyof typeof PROBLEM_LABELS) =>
    result.preview.filter((recipient) => recipient.problems.includes(problem)).length;

  return (
    <section dir="rtl" className="space-y-5 rounded-2xl border border-gold/40 bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl">טיוטת הודעה לאישורי הגעה</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            תכנון ותצוגה מקדימה בלבד. אין כאן שליחה, תזמון או סימון הודעות כנשלחו.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-border px-3 py-2 text-sm"
        >
          סגירת הטיוטה
        </button>
      </div>
      <p role="note" className="rounded-xl bg-gold/10 p-3 text-sm text-foreground">
        הטיוטה והקישורים שהודבקו נשמרים בזיכרון המסך בלבד. סגירה, רענון הדף או מעבר סביבת עבודה
        ימחקו אותם.
      </p>

      <fieldset className="rounded-xl border border-border p-3">
        <legend className="px-1 text-sm font-semibold">מקור השליחה המתוכנן</legend>
        <div className="flex flex-col gap-2 text-sm sm:flex-row sm:gap-6">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="campaign-sender-source"
              checked={senderSource === "central"}
              onChange={() => setSenderSource("central")}
            />
            מספר WhatsApp Business מרכזי של Wedding Budget IL
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="campaign-sender-source"
              checked={senderSource === "couple"}
              onChange={() => setSenderSource("couple")}
            />
            מספר WhatsApp Business של הזוג, לאחר חיבור מאושר
          </label>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          הבחירה היא חלק מטיוטה מקומית בלבד. חיבור הספק והמספרים טרם הוגדרו; אין שליחה מהמסך הזה.
        </p>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">
          בחרו נמענים
          <select
            value={selectionKind}
            onChange={(event) => setSelectionKind(event.target.value as SelectionKind)}
            className="mt-1 min-h-11 w-full rounded-xl border border-input bg-background px-3"
          >
            <option value="all">כל קבוצות ההזמנה</option>
            <option value="not_sent">טרם סומן שנשלח</option>
            <option value="unanswered">טרם השיבו או אישרו חלקית</option>
            <option value="manual">בחירה ידנית</option>
            {canViewGuests && categories.length > 0 && (
              <option value="category">לפי קטגוריה</option>
            )}
            {canViewGuests && <option value="side">לפי צד</option>}
          </select>
        </label>
        {selectionKind === "category" && (
          <label className="text-sm font-medium">
            קטגוריה
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border border-input bg-background px-3"
            >
              <option value="">בחרו קטגוריה</option>
              {categories.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        )}
        {selectionKind === "side" && (
          <label className="text-sm font-medium">
            צד
            <select
              value={side}
              onChange={(event) => setSide(event.target.value as typeof side)}
              className="mt-1 min-h-11 w-full rounded-xl border border-input bg-background px-3"
            >
              <option value="משותף">משותף</option>
              <option value="חתן">חתן</option>
              <option value="כלה">כלה</option>
            </select>
          </label>
        )}
      </div>
      {canViewGuests && metadataState.eventId === eventId && metadataState.error && (
        <p role="alert" className="text-sm text-destructive">
          לא נטענו קטגוריות וצדדים. עדיין אפשר לבחור נמענים בדרכים האחרות.
        </p>
      )}
      {!canViewGuests && (
        <p className="text-xs text-muted-foreground">
          סינון לפי קטגוריה או צד דורש הרשאת צפייה ברשימת המוזמנים.
        </p>
      )}
      {selectionKind === "manual" && (
        <fieldset className="max-h-52 space-y-2 overflow-y-auto rounded-xl border border-border p-3">
          <legend className="px-1 text-sm font-medium">
            קבוצות הזמנה שנבחרו: {manualIds.size}
          </legend>
          {rows.map((row) => (
            <label key={row.guest_id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={manualIds.has(row.guest_id)}
                onChange={(event) => {
                  const next = new Set(manualIds);
                  if (event.target.checked) next.add(row.guest_id);
                  else next.delete(row.guest_id);
                  setManualIds(next);
                }}
              />
              <span>{row.guest_name || "ללא שם"}</span>
            </label>
          ))}
        </fieldset>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm font-medium">
          שמות הזוג
          <input
            value={coupleNames}
            onChange={(event) => setCoupleNames(event.target.value)}
            className="mt-1 min-h-11 w-full rounded-xl border border-input bg-background px-3"
          />
        </label>
        <label className="text-sm font-medium">
          תאריך החתונה
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="mt-1 min-h-11 w-full rounded-xl border border-input bg-background px-3"
          />
        </label>
        <label className="text-sm font-medium">
          שם האולם
          <input
            value={venueName}
            onChange={(event) => setVenueName(event.target.value)}
            className="mt-1 min-h-11 w-full rounded-xl border border-input bg-background px-3"
          />
        </label>
      </div>
      <label className="block text-sm font-medium">
        נוסח ההודעה
        <textarea
          value={template}
          onChange={(event) => setTemplate(event.target.value)}
          rows={4}
          className="mt-1 w-full rounded-xl border border-input bg-background p-3 text-sm"
        />
      </label>
      <p className="text-xs text-muted-foreground">
        משתנים זמינים: $שם_פרטי, $שמות_הזוג, $תאריך_החתונה, $שם_האולם, $קישור.
      </p>

      <div className="rounded-xl border border-border p-3">
        <h3 className="font-semibold">קישורים אישיים לתצוגה מקדימה</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          קישור קיים אינו ניתן לשחזור. אפשר להדביק כאן קישור שהופק כעת בחלון הקישור האישי; הוא לא
          נשמר.
        </p>
        <div className="mt-3 max-h-56 space-y-3 overflow-y-auto">
          {selectedCandidates.map((candidate) => {
            const row = rows.find((item) => item.guest_id === candidate.guestId);
            return (
              <label key={candidate.guestId} className="block text-sm">
                <span>
                  {candidate.fullName || "ללא שם"}
                  {!row?.link_active ? " · אין קישור פעיל" : ""}
                </span>
                <input
                  type="url"
                  dir="ltr"
                  autoComplete="off"
                  value={links[candidate.guestId] ?? ""}
                  onChange={(event) =>
                    setLinks((current) => ({ ...current, [candidate.guestId]: event.target.value }))
                  }
                  placeholder="https://.../rsvp/..."
                  className="mt-1 min-h-10 w-full rounded-lg border border-input bg-background px-2 text-xs"
                />
              </label>
            );
          })}
        </div>
      </div>

      {result.error && (
        <p role="alert" className="text-sm text-destructive">
          {result.error}
        </p>
      )}
      <div className="grid gap-2 text-sm sm:grid-cols-3">
        <p className="rounded-xl bg-secondary p-3">
          נבחרו: <strong>{result.preview.length}</strong>
        </p>
        <p className="rounded-xl bg-success/10 p-3">
          מוכנים לתצוגה: <strong>{ready.length}</strong>
        </p>
        <p className="rounded-xl bg-destructive/10 p-3">
          חסומים: <strong>{blocked}</strong>
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        טלפונים לא תקינים: {countProblem("invalid_phone")} · מספרים כפולים:{" "}
        {countProblem("duplicate_phone")} · קישורים חסרים: {countProblem("missing_link")} · שמות
        חסרים: {countProblem("missing_name")}
      </p>
      <div className="max-h-80 space-y-3 overflow-y-auto" aria-live="polite">
        {result.preview.map((recipient) => (
          <article key={recipient.guestId} className="rounded-xl border border-border p-3 text-sm">
            <h4 className="font-semibold">
              {recipient.fullName || "ללא שם"} · {recipient.normalizedPhone ?? "ללא טלפון תקין"}
            </h4>
            {recipient.problems.length ? (
              <p className="mt-1 text-destructive">
                חסום: {recipient.problems.map((problem) => PROBLEM_LABELS[problem]).join(" · ")}
              </p>
            ) : (
              <pre className="mt-2 whitespace-pre-wrap break-words font-sans" dir="rtl">
                {recipient.message}
              </pre>
            )}
          </article>
        ))}
        {!result.error && result.preview.length === 0 && (
          <p className="text-sm text-muted-foreground">לא נבחרו קבוצות להצגה.</p>
        )}
      </div>
      <p className="text-xs font-medium text-muted-foreground">
        לא בוצעה שליחה לאף נמען. התצוגה אינה מסמנת יצירת קשר, תזכורת או שליחה.
      </p>
    </section>
  );
}
