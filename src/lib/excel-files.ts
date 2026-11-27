import readExcelFile, { type SheetData as ReadSheetData } from "read-excel-file/browser";
import type { SheetData as WriteSheetData } from "write-excel-file/browser";
import { parseContactCsv, type RawContact } from "./contact-import.ts";

export const MAX_EXCEL_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_EXCEL_ROWS = 2_000;
const MAX_GUEST_TEXT_CHARS = 200_000;

function cellText(value: ReadSheetData[number][number]): string {
  if (value === null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

function rowsToCsv(rows: ReadSheetData): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const text = cellText(cell);
          return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
        })
        .join(","),
    )
    .join("\n");
}

async function readSheets(file: Blob & { name: string }) {
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    throw new Error("קובצי Excel ישנים מסוג XLS אינם נתמכים. שמרו אותם כ־XLSX או CSV.");
  }
  if (file.size > MAX_EXCEL_FILE_BYTES) {
    throw new Error("הקובץ גדול מדי. הגודל המרבי הוא 5MB.");
  }
  let sheets;
  try {
    sheets = await readExcelFile(file);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "XLS_FILE_NOT_SUPPORTED"
    ) {
      throw new Error("קובצי XLS ישנים אינם נתמכים. שמרו אותם כ־XLSX או CSV.");
    }
    throw new Error("קובץ ה־XLSX אינו תקין או אינו נתמך.");
  }
  if (sheets.reduce((count, sheet) => count + sheet.data.length, 0) > MAX_EXCEL_ROWS) {
    throw new Error("הקובץ מכיל יותר מדי שורות. ניתן לייבא עד 2,000 שורות.");
  }
  return sheets;
}

/** Keep the existing smart guest import contract: text from every worksheet. */
export async function readGuestSpreadsheetText(file: Blob & { name: string }): Promise<string> {
  const sheets = await readSheets(file);
  const text = sheets.map((sheet) => rowsToCsv(sheet.data)).join("\n");
  if (text.length > MAX_GUEST_TEXT_CHARS) {
    throw new Error("תוכן הקובץ ארוך מדי לניתוח. פצלו את הרשימה לקבצים קטנים יותר.");
  }
  return text;
}

/** Contacts are imported from the first worksheet only, through the existing CSV validation. */
export async function readContactSpreadsheet(file: Blob & { name: string }): Promise<RawContact[]> {
  const sheets = await readSheets(file);
  const first = sheets[0];
  if (!first?.data.length) throw new Error("הגיליון הראשון בקובץ ריק.");
  return parseContactCsv(rowsToCsv(first.data));
}

/** String cells are explicitly typed as text, including values beginning with '='. */
export function toExcelSheetData(
  headers: readonly string[],
  rows: readonly Record<string, string | number>[],
): WriteSheetData {
  return [
    headers.map((header) => ({ value: header, type: String, fontWeight: "bold" })),
    ...rows.map((row) =>
      headers.map((header) => {
        const value = row[header] ?? "";
        return typeof value === "number" ? { value, type: Number } : { value, type: String };
      }),
    ),
  ];
}
