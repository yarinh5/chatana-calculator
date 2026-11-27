export const DOCUMENT_CATEGORIES = ["contract", "quote", "invoice", "receipt", "other"] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];
export type DocumentFormat = "pdf" | "jpeg" | "png" | "webp";

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  contract: "חוזה",
  quote: "הצעת מחיר",
  invoice: "חשבונית",
  receipt: "קבלה",
  other: "אחר",
};

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

const FORMAT_BY_EXTENSION: Record<string, DocumentFormat> = {
  pdf: "pdf",
  jpg: "jpeg",
  jpeg: "jpeg",
  png: "png",
  webp: "webp",
};

const MIME_BY_FORMAT: Record<DocumentFormat, string> = {
  pdf: "application/pdf",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export type LocalDocumentMetadata = {
  title: string;
  category: DocumentCategory;
  vendorId: string | null;
  note: string | null;
  fileName: string;
  fileSize: number;
  format: DocumentFormat;
};

function matchesSignature(format: DocumentFormat, bytes: Uint8Array): boolean {
  if (format === "pdf")
    return bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
  if (format === "jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (format === "png")
    return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (byte, index) => bytes[index] === byte,
    );
  return (
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  );
}

/** File content remains in browser memory. Validation does not upload or parse the document. */
export async function validateDocumentFile(file: File): Promise<DocumentFormat> {
  if (file.size === 0) throw new Error("הקובץ ריק.");
  if (file.size > MAX_DOCUMENT_BYTES) throw new Error("הקובץ גדול מדי. הגודל המרבי הוא 10MB.");
  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  const format = FORMAT_BY_EXTENSION[extension];
  if (!format) throw new Error("אפשר לבחור קובצי PDF, JPG, PNG או WEBP בלבד.");
  if (file.type && file.type !== MIME_BY_FORMAT[format]) {
    throw new Error("סוג הקובץ אינו תואם לסיומת שלו.");
  }
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!matchesSignature(format, bytes)) throw new Error("תוכן הקובץ אינו תואם לסוג שנבחר.");
  return format;
}

export function validateDocumentMetadata(
  draft: { title: string; category: string; vendorId: string | null; note: string },
  vendorIds: readonly string[],
): { title: string; category: DocumentCategory; vendorId: string | null; note: string | null } {
  const title = draft.title.trim();
  if (!title || title.length > 160) throw new Error("יש להזין שם מסמך באורך של עד 160 תווים.");
  if (!DOCUMENT_CATEGORIES.includes(draft.category as DocumentCategory)) {
    throw new Error("קטגוריית המסמך אינה תקינה.");
  }
  if (draft.vendorId && !vendorIds.includes(draft.vendorId)) {
    throw new Error("הספק שנבחר אינו זמין בסביבת העבודה הנוכחית.");
  }
  const note = draft.note.trim();
  if (note.length > 2_000) throw new Error("ההערה ארוכה מדי. ניתן להזין עד 2,000 תווים.");
  return {
    title,
    category: draft.category as DocumentCategory,
    vendorId: draft.vendorId || null,
    note: note || null,
  };
}
