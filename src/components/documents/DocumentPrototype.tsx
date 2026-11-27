import { useEffect, useRef, useState, type FormEvent } from "react";
import { FileText, Image, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_CATEGORY_LABELS,
  validateDocumentFile,
  validateDocumentMetadata,
  type DocumentCategory,
  type LocalDocumentMetadata,
} from "@/lib/document-draft";

export type VendorOption = { id: string; name: string };
type DraftDocument = LocalDocumentMetadata & { id: string; previewUrl: string | null };

/** In-memory prototype. Nothing here calls Storage or persists document metadata. */
export function DocumentPrototype({
  eventName,
  canEdit,
  vendorOptions,
}: {
  eventName: string;
  canEdit: boolean;
  vendorOptions?: VendorOption[];
}) {
  const [documents, setDocuments] = useState<DraftDocument[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<DocumentCategory>("contract");
  const [vendorId, setVendorId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const pendingRef = useRef(false);
  const mountedRef = useRef(true);
  const urlsRef = useRef(new Set<string>());
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const urls = urlsRef.current;
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  const addDraft = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pendingRef.current || !canEdit) return;
    pendingRef.current = true;
    setAdding(true);
    setError(null);
    try {
      if (!file) throw new Error("יש לבחור קובץ לפני הוספה לטיוטה.");
      const metadata = validateDocumentMetadata(
        { title, category, vendorId: vendorId || null, note },
        (vendorOptions ?? []).map((vendor) => vendor.id),
      );
      const format = await validateDocumentFile(file);
      if (!mountedRef.current) return;
      const previewUrl = format === "pdf" ? null : URL.createObjectURL(file);
      if (previewUrl) urlsRef.current.add(previewUrl);
      setDocuments((current) => [
        {
          ...metadata,
          id: crypto.randomUUID(),
          fileName: file.name,
          fileSize: file.size,
          format,
          previewUrl,
        },
        ...current,
      ]);
      setFile(null);
      setTitle("");
      setCategory("contract");
      setVendorId("");
      setNote("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (cause) {
      if (mountedRef.current)
        setError(cause instanceof Error ? cause.message : "לא הצלחנו לבדוק את הקובץ.");
    } finally {
      pendingRef.current = false;
      if (mountedRef.current) setAdding(false);
    }
  };

  const removeDraft = (document: DraftDocument) => {
    if (!canEdit) return;
    if (document.previewUrl) {
      URL.revokeObjectURL(document.previewUrl);
      urlsRef.current.delete(document.previewUrl);
    }
    setDocuments((current) => current.filter((item) => item.id !== document.id));
  };

  return (
    <div className="space-y-5" dir="rtl">
      <header>
        <h1 className="font-display text-2xl text-foreground sm:text-3xl">מסמכים וחוזים</h1>
        <p className="mt-1 text-sm text-muted-foreground">{eventName} · תצוגת טיוטה מקומית</p>
      </header>
      <div
        role="status"
        className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
      >
        <strong>טיוטה מקומית בלבד.</strong> הקבצים ופרטיהם אינם מועלים ואינם נשמרים בשרת. רענון הדף,
        יציאה ממנו או מעבר לסביבת עבודה אחרת ימחקו אותם.
      </div>
      {!canEdit && (
        <p className="rounded-xl border border-border bg-secondary p-3 text-sm text-foreground">
          סביבת העבודה במצב צפייה בלבד או שאין לך הרשאת עריכת מסמכים.
        </p>
      )}
      {canEdit && (
        <form
          onSubmit={(event) => void addDraft(event)}
          className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5"
        >
          <h2 className="text-lg font-semibold">הוספת מסמך לטיוטה</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span>קובץ PDF או תמונה · עד 10MB</span>
              <input
                ref={fileInputRef}
                type="file"
                disabled={adding}
                accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setError(null);
                }}
                className="block w-full rounded-lg border border-input bg-background p-2 text-sm"
                required
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>שם המסמך</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={160}
                required
                className="block w-full rounded-lg border border-input bg-background p-2"
                placeholder="לדוגמה: חוזה עם הצלם"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>קטגוריה</span>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value as DocumentCategory)}
                className="block w-full rounded-lg border border-input bg-background p-2"
              >
                {DOCUMENT_CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {DOCUMENT_CATEGORY_LABELS[item]}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span>
                ספק קשור {vendorOptions ? "(אופציונלי)" : "(זמין לאחר חיבור רשימת ספקים)"}
              </span>
              <select
                value={vendorId}
                onChange={(event) => setVendorId(event.target.value)}
                disabled={!vendorOptions}
                className="block w-full rounded-lg border border-input bg-background p-2 disabled:opacity-60"
              >
                <option value="">ללא ספק</option>
                {vendorOptions?.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block space-y-1 text-sm">
            <span>הערה (אופציונלית)</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={2000}
              rows={2}
              className="block w-full rounded-lg border border-input bg-background p-2"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={adding}>
            <Plus size={16} /> {adding ? "בודק קובץ..." : "הוסף לטיוטה מקומית"}
          </Button>
        </form>
      )}
      <section aria-label="מסמכים בטיוטה" className="space-y-3">
        <h2 className="text-lg font-semibold">מסמכים בטיוטה ({documents.length})</h2>
        {documents.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            אין מסמכים בטיוטה המקומית.
          </p>
        ) : (
          documents.map((document) => (
            <article
              key={document.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center"
            >
              {document.previewUrl ? (
                <img
                  src={document.previewUrl}
                  alt={`תצוגה מקדימה: ${document.title}`}
                  className="h-20 w-20 rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-secondary">
                  <FileText aria-hidden size={30} />
                </div>
              )}
              <div className="min-w-0 flex-1 text-sm">
                <h3 className="break-words font-semibold">{document.title}</h3>
                <p className="break-all text-muted-foreground">
                  {document.fileName} · {DOCUMENT_CATEGORY_LABELS[document.category]} ·{" "}
                  {(document.fileSize / 1024 / 1024).toFixed(2)} MB
                </p>
                {document.vendorId && (
                  <p>
                    ספק:{" "}
                    {vendorOptions?.find((vendor) => vendor.id === document.vendorId)?.name ??
                      "ספק לא זמין"}
                  </p>
                )}
                {document.note && <p className="break-words">{document.note}</p>}
                <p className="font-medium text-amber-700">לא נשמר</p>
              </div>
              {canEdit && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => removeDraft(document)}
                  aria-label={`הסר את ${document.title} מהטיוטה`}
                >
                  <Trash2 size={16} /> הסר
                </Button>
              )}
            </article>
          ))
        )}
      </section>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Image size={14} /> תצוגה מקדימה מוצגת לתמונות בלבד. קובצי PDF אינם נפתחים בתוך הדף.
      </p>
    </div>
  );
}
