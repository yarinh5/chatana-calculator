import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Check, Loader2, RotateCcw, Upload, X } from "lucide-react";
import type { Guest, NewGuest } from "@/hooks/useGuests";
import {
  buildInvitedContactDraft,
  classifyContactSwipe,
  fromPickedContacts,
  normalizeDraftCategoryName,
  normalizePhone,
  parseContactCsv,
  parseVCardContacts,
  prepareContactPreview,
  rewindContactDecision,
  summarizeContactDecisions,
  summarizeInvitedByCategory,
  type ContactDecision,
  type ContactDecisionHistoryEntry,
  type ContactPreview,
  type ContactPreviewStatus,
  type PickedContact,
  type RawContact,
} from "@/lib/contact-import";
import { readContactSpreadsheet } from "@/lib/excel-files";

type DraftCategory = { id: string; name: string; color: string };
type CardTransition = ContactDecision | "undo";

const CARD_VARIANTS = {
  enter: (choice: CardTransition) => ({
    opacity: 0,
    x: choice === "invite" ? -26 : choice === "decline" ? 26 : 0,
    y: choice === "maybe" ? 16 : choice === "skip" ? -16 : 0,
    rotate: choice === "invite" ? -2 : choice === "decline" ? 2 : 0,
  }),
  center: { opacity: 1, x: 0, y: 0, rotate: 0 },
  exit: (choice: CardTransition) => ({
    opacity: 0,
    x: choice === "invite" ? 140 : choice === "decline" ? -140 : 0,
    y: choice === "maybe" ? -90 : choice === "skip" ? 90 : 0,
    rotate: choice === "invite" ? 7 : choice === "decline" ? -7 : 0,
  }),
};

const REDUCED_CARD_VARIANTS = {
  enter: { opacity: 1 },
  center: { opacity: 1 },
  exit: { opacity: 1 },
};

type ContactImportDialogProps = {
  scopeId: string;
  existingGuests: Guest[];
  readOnly: boolean;
  onAdd: (guest: NewGuest) => Promise<boolean>;
  onClose: () => void;
};

const STATUS_LABEL: Record<ContactPreviewStatus, string> = {
  ready: "מוכן לבחירה",
  duplicate_import: "כבר מופיע בקובץ",
  existing_guest: "כבר ברשימת המוזמנים",
  missing_name: "חסר שם",
  missing_phone: "חסר מספר טלפון",
  invalid_phone: "מספר טלפון לא תקין",
};

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const DECISION_LABELS: Record<ContactDecision, string> = {
  invite: "מוזמן",
  decline: "לא מוזמן",
  maybe: "אולי",
  skip: "דילוג",
};
const CATEGORY_COLORS = ["#e11d48", "#d97706", "#059669", "#2563eb", "#7c3aed"];

type BrowserContacts = {
  getProperties: () => Promise<string[]>;
  select: (properties: string[], options: { multiple: boolean }) => Promise<PickedContact[]>;
};

function browserContacts(): BrowserContacts | null {
  if (typeof window === "undefined" || !window.isSecureContext || window.top !== window.self)
    return null;
  const manager = (navigator as Navigator & { contacts?: BrowserContacts }).contacts;
  return manager ?? null;
}

export function ContactImportDialog({
  scopeId,
  existingGuests,
  readOnly,
  onAdd,
  onClose,
}: ContactImportDialogProps) {
  const [rows, setRows] = useState<ContactPreview[] | null>(null);
  const [choices, setChoices] = useState<Record<number, ContactDecision>>({});
  const [phones, setPhones] = useState<Record<number, string>>({});
  const [groupSizes, setGroupSizes] = useState<Record<number, string>>({});
  const [categoryIds, setCategoryIds] = useState<Record<number, string>>({});
  const [categories, setCategories] = useState<DraftCategory[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState(CATEGORY_COLORS[0]);
  const [pendingDeleteCategoryId, setPendingDeleteCategoryId] = useState<string | null>(null);
  const [history, setHistory] = useState<ContactDecisionHistoryEntry[]>([]);
  const [cardTransition, setCardTransition] = useState<CardTransition>("undo");
  const [saved, setSaved] = useState<number[]>([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pickerSupported, setPickerSupported] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const fileVersion = useRef(0);
  const mounted = useRef(true);
  const saveInFlight = useRef(false);
  const readOnlyRef = useRef(readOnly);
  const scopeRef = useRef(scopeId);
  const onAddRef = useRef(onAdd);
  const swipeStart = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const categorySequence = useRef(0);
  const reducedMotion = useReducedMotion();
  readOnlyRef.current = readOnly;
  scopeRef.current = scopeId;
  onAddRef.current = onAdd;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      fileVersion.current += 1;
    };
  }, []);

  useEffect(() => {
    const manager = browserContacts();
    if (!manager) return;
    let active = true;
    void manager.getProperties().then(
      (properties) => {
        if (active) setPickerSupported(properties.includes("name") && properties.includes("tel"));
      },
      () => {
        if (active) setPickerSupported(false);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  const currentIndex = useMemo(
    () => rows?.findIndex((row, index) => row.status === "ready" && !choices[index]) ?? -1,
    [choices, rows],
  );
  const invited = useMemo(
    () =>
      rows?.flatMap((row, index) =>
        row.status === "ready" && choices[index] === "invite" ? [index] : [],
      ) ?? [],
    [choices, rows],
  );
  const summary = useMemo(
    () => summarizeContactDecisions(rows ?? [], choices, new Set(saved)),
    [choices, rows, saved],
  );
  const invitedByCategory = useMemo(
    () => summarizeInvitedByCategory(rows ?? [], choices, categoryIds, categories, new Set(saved)),
    [categoryIds, categories, choices, rows, saved],
  );
  const pending = invited.filter((index) => !saved.includes(index));
  const current = currentIndex >= 0 ? rows?.[currentIndex] : null;

  const choose = (index: number, choice: ContactDecision) => {
    if (!rows || rows[index]?.status !== "ready" || saved.includes(index) || saving || readOnly)
      return;
    if (choices[index] === choice) return;
    setCardTransition(choice);
    setHistory((previous) => [...previous, { index, previous: choices[index] }]);
    setChoices((previous) => ({ ...previous, [index]: choice }));
  };

  const undo = () => {
    if (saving || !history.length) return;
    const result = rewindContactDecision(choices, history, new Set(saved));
    if (!result) return;
    setCardTransition("undo");
    setChoices(result.choices);
    setHistory(result.history);
  };

  const createCategory = () => {
    if (saving || readOnly) return;
    const name = normalizeDraftCategoryName(
      newCategoryName,
      categories.map((category) => category.name),
    );
    if (!name) {
      setError("שם הקטגוריה חייב להיות ייחודי ובאורך עד 60 תווים.");
      return;
    }
    setCategories((previous) => [
      ...previous,
      { id: `draft-${++categorySequence.current}`, name, color: newCategoryColor },
    ]);
    setNewCategoryName("");
    setError("");
  };

  const renameCategory = (id: string, input: string) => {
    const category = categories.find((item) => item.id === id);
    if (!category || saved.some((index) => categoryIds[index] === id)) return category?.name ?? "";
    const name = normalizeDraftCategoryName(
      input,
      categories.map((item) => item.name),
      category.name,
    );
    if (!name) {
      setError("שם הקטגוריה חייב להיות ייחודי ובאורך עד 60 תווים.");
      return category.name;
    }
    setCategories((previous) =>
      previous.map((item) => (item.id === id ? { ...item, name } : item)),
    );
    setError("");
    return name;
  };

  const moveCategory = (id: string, offset: -1 | 1) => {
    setCategories((previous) => {
      const index = previous.findIndex((category) => category.id === id);
      const target = index + offset;
      if (index < 0 || target < 0 || target >= previous.length) return previous;
      const next = [...previous];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const deleteCategory = (id: string) => {
    if (saved.some((index) => categoryIds[index] === id)) return;
    const assigned = Object.values(categoryIds).some((value) => value === id);
    if (assigned && pendingDeleteCategoryId !== id) {
      setPendingDeleteCategoryId(id);
      return;
    }
    setCategories((previous) => previous.filter((category) => category.id !== id));
    setCategoryIds((previous) =>
      Object.fromEntries(Object.entries(previous).filter(([, value]) => value !== id)),
    );
    setPendingDeleteCategoryId(null);
  };

  const appendContacts = (contacts: RawContact[]) => {
    setRows((previous) => {
      const existingRows = previous ?? [];
      const existingRaw = existingRows.map(({ fullName, phones }) => ({ fullName, phones }));
      const additions = prepareContactPreview([...existingRaw, ...contacts], existingGuests).slice(
        existingRows.length,
      );
      return [...existingRows, ...additions];
    });
    setError("");
  };

  const addManualContact = () => {
    if (saving || reading || readOnly) return;
    if (!manualName.trim() || !normalizePhone(manualPhone)) {
      setError("יש להזין שם ומספר טלפון תקין.");
      return;
    }
    appendContacts([{ fullName: manualName.trim(), phones: [manualPhone.trim()] }]);
    setManualName("");
    setManualPhone("");
  };

  const pickContacts = async () => {
    const manager = browserContacts();
    if (!manager || !pickerSupported || saving || reading || readOnly) return;
    const version = ++fileVersion.current;
    setReading(true);
    setError("");
    try {
      // select() must be called directly from this click; permission is per use.
      const selected = await manager.select(["name", "tel"], { multiple: true });
      if (!mounted.current || version !== fileVersion.current) return;
      if (selected.length) appendContacts(fromPickedContacts(selected));
    } catch (cause) {
      if (
        mounted.current &&
        version === fileVersion.current &&
        !(cause instanceof DOMException && cause.name === "AbortError")
      ) {
        setError("בחירת אנשי הקשר לא זמינה כרגע. אפשר להשתמש בקובץ או בהזנה ידנית.");
      }
    } finally {
      if (mounted.current && version === fileVersion.current) setReading(false);
    }
  };

  const readFile = async (file: File) => {
    if (saving) return;
    const version = ++fileVersion.current;
    setRows(null);
    setChoices({});
    setPhones({});
    setGroupSizes({});
    setCategoryIds({});
    setCategories([]);
    setNewCategoryName("");
    setNewCategoryColor(CATEGORY_COLORS[0]);
    setPendingDeleteCategoryId(null);
    categorySequence.current = 0;
    setHistory([]);
    setSaved([]);
    setError("");
    setFileName(file.name);
    const extension = file.name.toLowerCase().split(".").pop();
    if (extension === "xls") {
      setError("קובצי XLS ישנים אינם נתמכים. שמרו את הקובץ כ־XLSX או CSV.");
      return;
    }
    if (extension !== "csv" && extension !== "vcf" && extension !== "xlsx") {
      setError("יש לבחור קובץ XLSX, CSV או VCF.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("הקובץ גדול מדי. הגודל המרבי הוא 5MB.");
      return;
    }
    setReading(true);
    try {
      const contacts =
        extension === "xlsx"
          ? await readContactSpreadsheet(file)
          : extension === "vcf"
            ? parseVCardContacts(await file.text())
            : parseContactCsv(await file.text());
      if (!mounted.current || version !== fileVersion.current) return;
      if (!contacts.length) throw new Error("לא נמצאו אנשי קשר בקובץ.");
      setRows(prepareContactPreview(contacts, existingGuests));
    } catch (cause) {
      if (mounted.current && version === fileVersion.current) {
        setError(cause instanceof Error ? cause.message : "לא הצלחנו לקרוא את הקובץ.");
      }
    } finally {
      if (mounted.current && version === fileVersion.current) setReading(false);
    }
  };

  const saveInvited = async () => {
    if (
      !rows ||
      currentIndex >= 0 ||
      !pending.length ||
      readOnlyRef.current ||
      saveInFlight.current
    )
      return;
    saveInFlight.current = true;
    const startingScope = scopeId;
    setSaving(true);
    setError("");
    try {
      for (const index of pending) {
        if (!mounted.current || readOnlyRef.current || scopeRef.current !== startingScope) break;
        const row = rows[index];
        const phone = phones[index] ?? row.selectedPhone;
        const categoryName =
          categories.find((category) => category.id === categoryIds[index])?.name ?? null;
        let guest: NewGuest;
        try {
          guest = buildInvitedContactDraft(
            row,
            phone,
            Number(groupSizes[index] ?? "1"),
            categoryName,
          );
        } catch {
          setError(`בדקו את מספר הטלפון ואת כמות המוזמנים של ${row.fullName}.`);
          break;
        }
        let ok = false;
        try {
          ok = await onAddRef.current(guest);
        } catch {
          ok = false;
        }
        if (!mounted.current || scopeRef.current !== startingScope) break;
        if (!ok) {
          setError(`שמירת ${row.fullName} נכשלה. שאר הבחירות נשמרו מקומית וניתן לנסות שוב.`);
          break;
        }
        setSaved((previous) => [...previous, index]);
      }
    } finally {
      saveInFlight.current = false;
      if (mounted.current) setSaving(false);
    }
  };

  const discard = () => {
    if (!saving) onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="בחירת אנשי קשר להזמנה"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      dir="rtl"
    >
      <div className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-border bg-card p-5 shadow-xl sm:rounded-2xl">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl text-foreground">בחירת אנשי קשר להזמנה</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              בוחרים אנשי קשר, מחליטים את מי להזמין, ושומרים רק את מי שסימנתם. אין שליחה ל־WhatsApp
              בשלב הזה.
            </p>
          </div>
          <button
            type="button"
            onClick={discard}
            disabled={saving}
            aria-label="סגור וזרוק בחירות שלא נשמרו"
            className="rounded-full p-2 hover:bg-secondary disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </header>

        <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border p-4 text-center hover:bg-secondary/40">
          <Upload className="mb-2 text-rose" size={20} />
          <span className="text-sm font-medium">בחרו קובץ אנשי קשר XLSX, CSV או VCF</span>
          <span className="mt-1 text-xs text-muted-foreground">
            הקובץ נקרא בדפדפן בלבד · עד 5MB · ב־XLSX נקרא הגיליון הראשון, עד 2,000 שורות
          </span>
          <span className="text-xs text-muted-foreground">
            ב־Excel יש לשמור מספרי טלפון כטקסט כדי לשמר אפס מוביל.
          </span>
          <input
            type="file"
            accept=".xlsx,.xls,.csv,.vcf,text/csv,text/vcard"
            disabled={saving || reading}
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void readFile(file);
              event.target.value = "";
            }}
          />
        </label>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {pickerSupported ? (
            <button
              type="button"
              onClick={() => void pickContacts()}
              disabled={saving || reading || readOnly}
              className="min-h-11 rounded-xl border border-border px-4 text-sm hover:bg-secondary disabled:opacity-50"
            >
              בחרו אנשי קשר מהמכשיר
            </button>
          ) : (
            <p className="rounded-xl bg-secondary/50 p-3 text-xs text-muted-foreground">
              בחירת אנשי קשר מהמכשיר אינה זמינה בדפדפן הזה. אפשר לבחור קובץ או להזין ידנית.
            </p>
          )}
          <div className="grid gap-2 rounded-xl border border-border p-3 sm:col-span-2 sm:grid-cols-[1fr_1fr_auto]">
            <input
              value={manualName}
              onChange={(event) => setManualName(event.target.value)}
              placeholder="שם איש הקשר"
              aria-label="שם איש הקשר להזנה ידנית"
              disabled={saving || reading || readOnly}
              className="min-h-10 rounded-lg border border-border bg-background px-3 text-sm"
            />
            <input
              value={manualPhone}
              onChange={(event) => setManualPhone(event.target.value)}
              placeholder="מספר טלפון"
              aria-label="מספר טלפון להזנה ידנית"
              inputMode="tel"
              dir="ltr"
              disabled={saving || reading || readOnly}
              className="min-h-10 rounded-lg border border-border bg-background px-3 text-sm"
            />
            <button
              type="button"
              onClick={addManualContact}
              disabled={saving || reading || readOnly}
              className="min-h-10 rounded-lg border border-border px-3 text-sm hover:bg-secondary disabled:opacity-50"
            >
              הוסף לבדיקה
            </button>
          </div>
        </div>

        {fileName && <p className="mt-2 text-xs text-muted-foreground">קובץ: {fileName}</p>}
        {reading && (
          <p className="mt-3 flex items-center gap-2 text-sm">
            <Loader2 size={16} className="animate-spin" /> קוראים אנשי קשר…
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="mt-3 rounded-xl bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        )}

        {rows && (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-secondary px-3 py-1">{rows.length} בתצוגה</span>
              <span className="rounded-full bg-secondary px-3 py-1">
                {summary.invited} קבוצות להזמנה
              </span>
              <span className="rounded-full bg-secondary px-3 py-1">
                {summary.declined} לא מוזמנים
              </span>
              <span className="rounded-full bg-secondary px-3 py-1">{summary.maybe} אולי</span>
              <span className="rounded-full bg-secondary px-3 py-1">{summary.skipped} דולגו</span>
              <span className="rounded-full bg-secondary px-3 py-1">
                {summary.blocked} דורשים בדיקה
              </span>
              <span className="rounded-full bg-secondary px-3 py-1">{summary.saved} נשמרו</span>
              <span className="rounded-full bg-secondary px-3 py-1">
                {summary.undecided} טרם נבדקו
              </span>
            </div>
            <div className="space-y-1 text-xs text-muted-foreground">
              <div className="flex justify-between gap-2">
                <span>התקדמות בבחירה</span>
                <span>
                  {summary.decided} מתוך {summary.eligible} · {summary.percent}%
                </span>
              </div>
              <div
                role="progressbar"
                aria-label="התקדמות בבחירת אנשי קשר"
                aria-valuenow={summary.decided}
                aria-valuemin={0}
                aria-valuemax={summary.eligible || 1}
                className="h-2 overflow-hidden rounded-full bg-secondary"
              >
                <div
                  className="h-full rounded-full bg-rose"
                  style={{
                    width: `${summary.percent}%`,
                  }}
                />
              </div>
            </div>

            {invitedByCategory.length > 0 && (
              <div
                className="rounded-xl border border-border bg-background p-3 text-sm"
                aria-label="קבוצות הזמנה לפי קטגוריה"
              >
                <h3 className="font-medium">קבוצות הזמנה לפי קטגוריה</h3>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {invitedByCategory.map((category) => (
                    <li
                      key={category.categoryId ?? "unassigned"}
                      className="flex flex-wrap justify-between gap-2"
                    >
                      <span>{category.name}</span>
                      <span>
                        {category.count} קבוצות · {category.saved} נשמרו · {category.pending}{" "}
                        ממתינות לשמירה
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <details className="rounded-xl border border-border bg-background p-3 text-sm">
              <summary className="cursor-pointer font-medium">
                קטגוריות מותאמות בטיוטה ({categories.length})
              </summary>
              <p className="mt-2 text-xs text-muted-foreground">
                שם הקטגוריה נשלח רק עם מוזמן שנשמר. צבע וסדר משמשים לתצוגה כאן בלבד ואינם נשמרים
                במערכת.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  value={newCategoryName}
                  onChange={(event) => setNewCategoryName(event.target.value)}
                  maxLength={60}
                  disabled={saving || readOnly}
                  placeholder="שם קטגוריה חדשה"
                  aria-label="שם קטגוריה חדשה"
                  className="min-h-10 min-w-36 flex-1 rounded-lg border border-border bg-card px-3"
                />
                <input
                  type="color"
                  value={newCategoryColor}
                  onChange={(event) => setNewCategoryColor(event.target.value)}
                  disabled={saving || readOnly}
                  aria-label="צבע קטגוריה חדשה"
                  className="h-10 w-12 rounded-lg border border-border bg-card p-1"
                />
                <button
                  type="button"
                  onClick={createCategory}
                  disabled={saving || readOnly}
                  className="min-h-10 rounded-lg border border-border px-3 disabled:opacity-50"
                >
                  צור קטגוריה
                </button>
              </div>
              {categories.length > 0 && (
                <div className="mt-3 space-y-2">
                  {categories.map((category, index) => {
                    const usedBySaved = saved.some(
                      (rowIndex) => categoryIds[rowIndex] === category.id,
                    );
                    const assigned = Object.values(categoryIds).filter(
                      (id) => id === category.id,
                    ).length;
                    return (
                      <div
                        key={category.id}
                        className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2"
                      >
                        <input
                          key={`${category.id}:${category.name}`}
                          defaultValue={category.name}
                          disabled={saving || readOnly || usedBySaved}
                          maxLength={60}
                          aria-label={`שם קטגוריה ${category.name}`}
                          onBlur={(event) => {
                            event.target.value = renameCategory(category.id, event.target.value);
                          }}
                          className="min-h-9 min-w-28 flex-1 rounded-md border border-border bg-card px-2"
                        />
                        <input
                          type="color"
                          value={category.color}
                          onChange={(event) =>
                            setCategories((previous) =>
                              previous.map((item) =>
                                item.id === category.id
                                  ? { ...item, color: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          disabled={saving || readOnly}
                          aria-label={`צבע קטגוריה ${category.name}`}
                          className="h-9 w-10 rounded-md border border-border bg-card p-1"
                        />
                        <button
                          type="button"
                          onClick={() => moveCategory(category.id, -1)}
                          disabled={saving || readOnly || index === 0}
                          aria-label={`העבר את ${category.name} למעלה`}
                          className="rounded-md border border-border px-2 py-1 disabled:opacity-40"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveCategory(category.id, 1)}
                          disabled={saving || readOnly || index === categories.length - 1}
                          aria-label={`העבר את ${category.name} למטה`}
                          className="rounded-md border border-border px-2 py-1 disabled:opacity-40"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteCategory(category.id)}
                          disabled={saving || readOnly || usedBySaved}
                          className="rounded-md border border-destructive/30 px-2 py-1 text-destructive disabled:opacity-40"
                        >
                          מחק
                        </button>
                        {usedBySaved && (
                          <span className="w-full text-xs text-muted-foreground">
                            שם הקטגוריה כבר נשמר אצל מוזמן; אי אפשר לשנות או למחוק אותו כאן.
                          </span>
                        )}
                        {pendingDeleteCategoryId === category.id && !usedBySaved && (
                          <div className="flex w-full flex-wrap items-center gap-2 rounded-md bg-gold/10 p-2 text-xs">
                            <span>
                              הקטגוריה משויכת ל־{assigned} טיוטות. לחיצה נוספת על ״מחק״ תסיר את
                              השיוך המקומי.
                            </span>
                            <button
                              type="button"
                              onClick={() => setPendingDeleteCategoryId(null)}
                              className="underline"
                            >
                              ביטול
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </details>

            {summary.eligible > 0 && (
              <div className="relative pb-3">
                {current && (
                  <>
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-6 bottom-0 top-5 rounded-2xl border border-border bg-secondary/60"
                    />
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-3 bottom-1 top-3 rounded-2xl border border-border bg-card"
                    />
                  </>
                )}
                <AnimatePresence mode="wait" initial={false} custom={cardTransition}>
                  {current && (
                    <motion.div
                      key={`${fileName}:${currentIndex}`}
                      custom={cardTransition}
                      variants={reducedMotion ? REDUCED_CARD_VARIANTS : CARD_VARIANTS}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      transition={
                        reducedMotion
                          ? { duration: 0 }
                          : { type: "spring", stiffness: 390, damping: 32, mass: 0.8 }
                      }
                      tabIndex={0}
                      aria-label={`${current.fullName}, ${current.selectedPhone}. החלקה ימינה להזמנה או שמאלה ללא הזמנה. חצים מאפשרים גם אולי ודילוג`}
                      onKeyDown={(event) => {
                        if ((event.target as HTMLElement).closest("button, select, input")) return;
                        const keyboardChoices: Partial<Record<string, ContactDecision>> = {
                          ArrowRight: "invite",
                          ArrowLeft: "decline",
                          ArrowUp: "maybe",
                          ArrowDown: "skip",
                        };
                        const choice = keyboardChoices[event.key];
                        if (!choice) return;
                        event.preventDefault();
                        choose(currentIndex, choice);
                      }}
                      onPointerDown={(event) => {
                        if (
                          (event.target as HTMLElement).closest("button, select, input, label") ||
                          readOnly
                        )
                          return;
                        swipeStart.current = {
                          x: event.clientX,
                          y: event.clientY,
                          pointerId: event.pointerId,
                        };
                      }}
                      onPointerUp={(event) => {
                        const start = swipeStart.current;
                        if (!start || start.pointerId !== event.pointerId) return;
                        swipeStart.current = null;
                        const choice = classifyContactSwipe(
                          event.clientX - start.x,
                          event.clientY - start.y,
                          event.pointerType,
                        );
                        if (choice) choose(currentIndex, choice);
                      }}
                      onPointerCancel={() => {
                        swipeStart.current = null;
                      }}
                      style={{ touchAction: "pan-y" }}
                      className="relative z-10 rounded-2xl border border-border bg-background p-5 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-rose"
                    >
                      <p className="text-xs text-muted-foreground">
                        איש קשר {currentIndex + 1} מתוך {rows.length}
                      </p>
                      <div className="mt-3 flex items-center gap-3">
                        <span
                          aria-hidden="true"
                          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-rose/10 text-base font-semibold text-rose"
                        >
                          {current.fullName
                            .trim()
                            .split(/\s+/u)
                            .slice(0, 2)
                            .map((part) => part[0])
                            .join("")}
                        </span>
                        <h3 className="font-display text-xl">{current.fullName}</h3>
                      </div>
                      {current.normalizedPhones.length > 1 ? (
                        <label className="mt-3 block text-sm">
                          מספר להזמנה
                          <select
                            value={phones[currentIndex] ?? current.selectedPhone ?? ""}
                            onChange={(event) =>
                              setPhones((previous) => ({
                                ...previous,
                                [currentIndex]: event.target.value,
                              }))
                            }
                            className="mt-1 min-h-10 w-full rounded-xl border border-border bg-card px-3"
                            dir="ltr"
                          >
                            {current.normalizedPhones.map((phone) => (
                              <option key={phone} value={phone}>
                                {phone}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <p className="mt-1 text-sm" dir="ltr">
                          {current.selectedPhone}
                        </p>
                      )}
                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        <label className="text-sm">
                          כמות מוזמנים בקבוצה
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={groupSizes[currentIndex] ?? "1"}
                            onChange={(event) =>
                              setGroupSizes((previous) => ({
                                ...previous,
                                [currentIndex]: event.target.value,
                              }))
                            }
                            disabled={saving || readOnly}
                            className="mt-1 min-h-10 w-full rounded-xl border border-border bg-card px-3"
                          />
                        </label>
                        <label className="text-sm">
                          קטגוריה מותאמת
                          <select
                            value={categoryIds[currentIndex] ?? ""}
                            onChange={(event) =>
                              setCategoryIds((previous) => ({
                                ...previous,
                                [currentIndex]: event.target.value,
                              }))
                            }
                            disabled={saving || readOnly}
                            className="mt-1 min-h-10 w-full rounded-xl border border-border bg-card px-3"
                          >
                            <option value="">ללא קטגוריה</option>
                            {categories.map((category) => (
                              <option key={category.id} value={category.id}>
                                {category.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className="mt-5 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => choose(currentIndex, "invite")}
                          disabled={readOnly || saving}
                          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-rose px-3 text-sm font-medium text-white disabled:opacity-50"
                        >
                          <Check size={16} /> להזמין
                        </button>
                        <button
                          type="button"
                          onClick={() => choose(currentIndex, "decline")}
                          disabled={readOnly || saving}
                          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-border px-3 text-sm disabled:opacity-50"
                        >
                          <ArrowLeft size={16} /> לא להזמין
                        </button>
                        <button
                          type="button"
                          onClick={() => choose(currentIndex, "maybe")}
                          disabled={readOnly || saving}
                          className="min-h-11 rounded-xl border border-border px-3 text-sm disabled:opacity-50"
                        >
                          אולי
                        </button>
                        <button
                          type="button"
                          onClick={() => choose(currentIndex, "skip")}
                          disabled={readOnly || saving}
                          className="min-h-11 rounded-xl border border-border px-3 text-sm disabled:opacity-50"
                        >
                          דלג לעת עתה
                        </button>
                      </div>
                      <p className="mt-2 text-center text-xs text-muted-foreground">
                        במגע: החלקה ימינה להזמין או שמאלה לא להזמין. גלילה למעלה ולמטה נשארת זמינה.
                        במקלדת: חצים לארבע ההחלטות.
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {!current && summary.eligible > 0 && (
              <p
                className="rounded-xl border border-border bg-secondary/50 p-3 text-sm"
                role="status"
              >
                כל אנשי הקשר הזמינים סווגו. אפשר לשנות החלטות ברשימה למטה, לשמור את המוזמנים שנבחרו
                או לסגור ולהשליך את הטיוטה.
              </p>
            )}

            <div
              className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-border p-2 text-sm"
              aria-label="סקירת החלטות אנשי קשר"
            >
              {rows.map((row, index) => {
                const isSaved = saved.includes(index);
                return (
                  <div key={`${index}-${row.fullName}`} className="rounded-lg bg-secondary/50 p-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="min-w-0 font-medium">{row.fullName || "ללא שם"}</span>
                      {row.status === "ready" && !isSaved ? (
                        <select
                          aria-label={`החלטה עבור ${row.fullName}`}
                          value={choices[index] ?? ""}
                          onChange={(event) => {
                            if (event.target.value)
                              choose(index, event.target.value as ContactDecision);
                          }}
                          disabled={saving || readOnly}
                          className="min-h-9 rounded-lg border border-border bg-card px-2 text-xs disabled:opacity-50"
                        >
                          <option value="">טרם נבחר</option>
                          {(Object.entries(DECISION_LABELS) as [ContactDecision, string][]).map(
                            ([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ),
                          )}
                        </select>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {isSaved ? "מוזמן נשמר" : STATUS_LABEL[row.status]}
                        </span>
                      )}
                    </div>
                    {row.status === "ready" && choices[index] === "invite" && (
                      <div className="mt-2 grid gap-2 sm:grid-cols-3">
                        {row.normalizedPhones.length > 1 && (
                          <label className="text-xs">
                            מספר להזמנה
                            <select
                              value={phones[index] ?? row.selectedPhone ?? ""}
                              onChange={(event) =>
                                setPhones((previous) => ({
                                  ...previous,
                                  [index]: event.target.value,
                                }))
                              }
                              disabled={saving || readOnly || isSaved}
                              dir="ltr"
                              className="mt-1 min-h-9 w-full rounded-lg border border-border bg-card px-2"
                            >
                              <option value="" disabled>
                                בחרו מספר
                              </option>
                              {row.normalizedPhones.map((phone) => (
                                <option key={phone} value={phone}>
                                  {phone}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                        <label className="text-xs">
                          כמות בקבוצה
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={groupSizes[index] ?? "1"}
                            onChange={(event) =>
                              setGroupSizes((previous) => ({
                                ...previous,
                                [index]: event.target.value,
                              }))
                            }
                            disabled={saving || readOnly || isSaved}
                            className="mt-1 min-h-9 w-full rounded-lg border border-border bg-card px-2"
                          />
                        </label>
                        <label className="text-xs">
                          קטגוריה
                          <select
                            value={categoryIds[index] ?? ""}
                            onChange={(event) =>
                              setCategoryIds((previous) => ({
                                ...previous,
                                [index]: event.target.value,
                              }))
                            }
                            disabled={saving || readOnly || isSaved}
                            className="mt-1 min-h-9 w-full rounded-lg border border-border bg-card px-2"
                          >
                            <option value="">ללא קטגוריה</option>
                            {categories.map((category) => (
                              <option key={category.id} value={category.id}>
                                {category.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={undo}
                disabled={
                  saving || readOnly || !history.some((entry) => !saved.includes(entry.index))
                }
                className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-border px-3 text-sm disabled:opacity-50"
              >
                <RotateCcw size={15} /> בטל בחירה אחרונה
              </button>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={discard}
                  disabled={saving}
                  className="min-h-10 rounded-xl border border-border px-4 text-sm disabled:opacity-50"
                >
                  סגור והשלך טיוטה
                </button>
                <button
                  type="button"
                  onClick={() => void saveInvited()}
                  disabled={saving || readOnly || currentIndex >= 0 || !pending.length}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-rose px-4 text-sm font-medium text-white disabled:opacity-50"
                >
                  {saving && <Loader2 size={16} className="animate-spin" />}
                  שמור {pending.length} מוזמנים שנבחרו
                </button>
              </div>
            </footer>
            {saved.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {saved.length} מוזמנים כבר נשמרו במערכת ויישארו גם לאחר סגירה. יתר הבחירות
                והקטגוריות המקומיות יימחקו.
              </p>
            )}
            {readOnly && (
              <p className="text-sm text-destructive">
                סביבת העבודה במצב צפייה בלבד. שמירת מוזמנים אינה זמינה.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
