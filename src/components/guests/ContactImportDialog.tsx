import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Loader2, RotateCcw, Upload, X } from "lucide-react";
import type { Guest, NewGuest } from "@/hooks/useGuests";
import {
  fromPickedContacts,
  normalizePhone,
  parseContactCsv,
  parseVCardContacts,
  prepareContactPreview,
  type ContactPreview,
  type ContactPreviewStatus,
  type PickedContact,
  type RawContact,
} from "@/lib/contact-import";
import { readContactSpreadsheet } from "@/lib/excel-files";

type Choice = "invite" | "skip";
type HistoryEntry = { index: number; previous: Choice | undefined };

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
  const [choices, setChoices] = useState<Record<number, Choice>>({});
  const [phones, setPhones] = useState<Record<number, string>>({});
  const [history, setHistory] = useState<HistoryEntry[]>([]);
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
  const swipeStart = useRef<number | null>(null);
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
  const pending = invited.filter((index) => !saved.includes(index));
  const current = currentIndex >= 0 ? rows?.[currentIndex] : null;

  const choose = (index: number, choice: Choice) => {
    if (!rows || rows[index]?.status !== "ready" || saving || readOnly) return;
    setHistory((previous) => [...previous, { index, previous: choices[index] }]);
    setChoices((previous) => ({ ...previous, [index]: choice }));
  };

  const undo = () => {
    if (saving || !history.length) return;
    const last = history[history.length - 1];
    if (saved.includes(last.index)) return;
    setChoices((previous) => {
      const next = { ...previous };
      if (last.previous) next[last.index] = last.previous;
      else delete next[last.index];
      return next;
    });
    setHistory((previous) => previous.slice(0, -1));
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
        if (!phone) {
          setError(`לא נבחר מספר טלפון עבור ${row.fullName}.`);
          break;
        }
        const ok = await onAddRef.current({
          full_name: row.fullName.trim(),
          phone,
          group_size: 1,
          side: "משותף",
        });
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
                {invited.length} נבחרו להזמנה
              </span>
              <span className="rounded-full bg-secondary px-3 py-1">
                {rows.filter((row) => row.status === "existing_guest").length} כבר קיימים
              </span>
              <span className="rounded-full bg-secondary px-3 py-1">{saved.length} נשמרו</span>
            </div>

            {current && (
              <div
                tabIndex={0}
                aria-label={`${current.fullName}, ${current.selectedPhone}. חץ ימינה להזמנה, חץ שמאלה לדילוג`}
                onKeyDown={(event) => {
                  if (event.key === "ArrowRight") {
                    event.preventDefault();
                    choose(currentIndex, "invite");
                  }
                  if (event.key === "ArrowLeft") {
                    event.preventDefault();
                    choose(currentIndex, "skip");
                  }
                }}
                onPointerDown={(event) => {
                  if (!(event.target as HTMLElement).closest("button, select, input, label")) {
                    swipeStart.current = event.clientX;
                  }
                }}
                onPointerUp={(event) => {
                  if (swipeStart.current === null) return;
                  const distance = event.clientX - swipeStart.current;
                  swipeStart.current = null;
                  if (distance > 70) choose(currentIndex, "invite");
                  if (distance < -70) choose(currentIndex, "skip");
                }}
                className="rounded-2xl border border-border bg-background p-5 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-rose"
              >
                <p className="text-xs text-muted-foreground">
                  איש קשר {currentIndex + 1} מתוך {rows.length}
                </p>
                <h3 className="mt-2 font-display text-xl">{current.fullName}</h3>
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
                <div className="mt-5 flex gap-2">
                  <button
                    type="button"
                    onClick={() => choose(currentIndex, "invite")}
                    disabled={readOnly}
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-rose px-3 text-sm font-medium text-white disabled:opacity-50"
                  >
                    <Check size={16} /> להזמין
                  </button>
                  <button
                    type="button"
                    onClick={() => choose(currentIndex, "skip")}
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-border px-3 text-sm"
                  >
                    <ArrowLeft size={16} /> לדלג
                  </button>
                </div>
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  אפשר גם להחליק ימינה להזמנה או שמאלה לדילוג
                </p>
              </div>
            )}

            <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-border p-2 text-sm">
              {rows.map((row, index) => (
                <div
                  key={`${index}-${row.fullName}`}
                  className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 odd:bg-secondary/50"
                >
                  <span className="min-w-0 truncate">{row.fullName || "ללא שם"}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {saved.includes(index)
                      ? "נשמר"
                      : choices[index] === "invite"
                        ? "להזמנה"
                        : choices[index] === "skip"
                          ? "דולג"
                          : STATUS_LABEL[row.status]}
                  </span>
                </div>
              ))}
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={undo}
                disabled={
                  !history.length || saving || saved.includes(history[history.length - 1]?.index)
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
                  סגור והשלך בחירות
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
