import { useRef, useState } from "react";
import { X, Upload, Loader2, AlertTriangle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { SIDES, type GuestSide, type NewGuest } from "@/hooks/useGuests";

type ParsedGuest = {
  full_name: string;
  group_size: number;
  phone: string | null;
  notes: string | null;
  side: GuestSide;
};

async function fileToText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".txt") || name.endsWith(".csv")) return await file.text();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  return wb.SheetNames.map((n) => XLSX.utils.sheet_to_csv(wb.Sheets[n])).join("\n");
}

export function ImportGuestModal({
  open,
  onClose,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  onImport: (list: NewGuest[]) => boolean | void | Promise<boolean | void>;
}) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ParsedGuest[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const reset = () => {
    setText("");
    setFileName(null);
    setRows(null);
    setWarnings([]);
    setLoading(false);
  };

  const handleFile = async (file: File) => {
    try {
      const content = await fileToText(file);
      setFileName(file.name);
      setText(content);
    } catch {
      toast.error("קריאת הקובץ נכשלה");
    }
  };

  const scan = async () => {
    if (!text.trim()) return toast.error("אין טקסט לסריקה");
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("parse-guest-list", {
        body: { rawText: text },
      });
      if (error) throw error;
      const parsed: ParsedGuest[] = (data?.guests ?? []).map((g: Partial<ParsedGuest>) => ({
        full_name: String(g.full_name ?? "").trim(),
        group_size: Number(g.group_size) > 0 ? Number(g.group_size) : 1,
        phone: g.phone ?? null,
        notes: g.notes ?? null,
        side: (SIDES as string[]).includes(String(g.side)) ? (g.side as GuestSide) : "משותף",
      }));
      const clean = parsed.filter((g) => g.full_name);
      if (!clean.length) {
        toast.error("לא זוהו אורחים בטקסט");
      }
      setRows(clean);
      setWarnings(data?.warnings ?? []);
    } catch (e) {
      console.error(e);
      toast.error(importErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const update = (i: number, patch: Partial<ParsedGuest>) =>
    setRows((prev) => (prev ? prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) : prev));

  const field = "min-h-9 w-full rounded-lg border border-border bg-background px-2 text-sm";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl border border-border bg-card p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg text-foreground">ייבא רשימת מוזמנים</h3>
          <button
            onClick={() => {
              reset();
              onClose();
            }}
            aria-label="סגור"
            className="rounded-full p-2 hover:bg-secondary"
          >
            <X size={18} />
          </button>
        </div>

        {!rows ? (
          <div className="space-y-4">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const f = e.dataTransfer.files?.[0];
                if (f) handleFile(f);
              }}
              onClick={() => inputRef.current?.click()}
              className={`cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition ${
                dragging ? "border-rose bg-rose/5" : "border-border"
              }`}
            >
              <Upload className="mx-auto mb-2 text-rose" />
              <div className="text-sm font-medium text-foreground">
                📁 גרור קובץ לכאן או לחץ לבחירה
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Excel (.xlsx, .xls, .csv) · טקסט (.txt)
              </div>
              {fileName && <div className="mt-2 text-xs text-rose">{fileName}</div>}
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls,.csv,.txt"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </div>

            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">או הדבק רשימת שמות:</span>
              <textarea
                rows={7}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={"דני כהן\nרונית לוי 2\nמשפחת אברהם - 4 אנשים\nיוסי ורחל"}
                className="w-full rounded-xl border border-border bg-background p-3 text-sm"
              />
            </label>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  reset();
                  onClose();
                }}
                className="min-h-11 rounded-xl border border-border px-4 text-sm hover:bg-secondary"
              >
                ביטול
              </button>
              <button
                onClick={scan}
                disabled={loading || !text.trim()}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-rose px-4 text-sm font-medium text-white disabled:opacity-50"
              >
                {loading && <Loader2 size={16} className="animate-spin" />}
                סרוק וייבא →
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-sm font-medium text-emerald-700">✅ זוהו {rows.length} אורחים</div>
            {warnings.length > 0 && (
              <div className="flex items-start gap-2 rounded-xl bg-gold/10 p-3 text-xs text-foreground">
                <AlertTriangle size={14} className="mt-0.5 text-gold" />
                <ul className="list-disc pr-4">
                  {warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="max-h-[45vh] space-y-2 overflow-y-auto">
              {rows.map((r, i) => (
                <div
                  key={i}
                  className="grid grid-cols-12 items-center gap-2 rounded-xl border border-border p-2"
                >
                  <input
                    className={`${field} col-span-12 sm:col-span-4`}
                    value={r.full_name}
                    onChange={(e) => update(i, { full_name: e.target.value })}
                  />
                  <input
                    type="number"
                    min={1}
                    className={`${field} col-span-3 sm:col-span-2`}
                    value={r.group_size}
                    onChange={(e) => update(i, { group_size: Number(e.target.value) })}
                  />
                  <select
                    className={`${field} col-span-4 sm:col-span-2`}
                    value={r.side}
                    onChange={(e) => update(i, { side: e.target.value as GuestSide })}
                  >
                    {SIDES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <input
                    placeholder="הערות"
                    className={`${field} col-span-4 sm:col-span-3`}
                    value={r.notes ?? ""}
                    onChange={(e) => update(i, { notes: e.target.value || null })}
                  />
                  <button
                    onClick={() => setRows((prev) => prev!.filter((_, idx) => idx !== i))}
                    aria-label="הסר"
                    className="col-span-1 flex justify-center rounded-lg p-2 text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <button
                onClick={() => setRows(null)}
                className="min-h-11 rounded-xl border border-border px-4 text-sm hover:bg-secondary"
              >
                חזרה
              </button>
              <button
                onClick={async () => {
                  const ok = await onImport(rows.filter((r) => r.full_name.trim()));
                  if (ok === false) return;
                  reset();
                  onClose();
                }}
                className="min-h-11 rounded-xl bg-rose px-4 text-sm font-medium text-white"
              >
                ייבא הכל ✓
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function importErrorMessage(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : "";
  const signal = `${name} ${message}`;
  if (
    signal.includes("FunctionsFetchError") ||
    signal.includes("FunctionsHttpError") ||
    signal.includes("LOVABLE_API_KEY") ||
    signal.includes("not configured") ||
    signal.includes("configuration") ||
    signal.includes("404")
  ) {
    return "ייבוא חכם של רשימת מוזמנים אינו זמין כרגע. ניתן עדיין להוסיף אורחים ידנית.";
  }
  return "ניתוח הרשימה נכשל, נסה שוב";
}
