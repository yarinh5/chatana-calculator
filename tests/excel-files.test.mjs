import assert from "node:assert/strict";
import test from "node:test";
import readExcelFile from "read-excel-file/browser";
import writeExcelFile from "write-excel-file/browser";
import {
  readContactSpreadsheet,
  readGuestSpreadsheetText,
  toExcelSheetData,
} from "../src/lib/excel-files.ts";

async function workbook(name, sheets) {
  const blob = await writeExcelFile(sheets).toBlob();
  return new File([blob], name, { type: blob.type });
}

test("writes and reads a two-sheet guest workbook with Hebrew and literal formula-looking text", async () => {
  const file = await workbook("guests.xlsx", [
    {
      sheet: "מוזמנים",
      data: toExcelSheetData(
        ["שם מלא", "טלפון"],
        [{ "שם מלא": '=HYPERLINK("https://example.com")', טלפון: "+972501234567" }],
      ),
    },
    {
      sheet: "פירוט אישי",
      data: toExcelSheetData(["שם משתתף", "גיל"], [{ "שם משתתף": "דנה", גיל: "מבוגר" }]),
    },
  ]);
  const sheets = await readExcelFile(file);
  assert.equal(sheets.length, 2);
  assert.equal(sheets[0].sheet, "מוזמנים");
  assert.equal(sheets[1].sheet, "פירוט אישי");
  assert.equal(sheets[0].data[1][0], '=HYPERLINK("https://example.com")');
  const guestText = await readGuestSpreadsheetText(file);
  assert.match(guestText, /שם מלא,טלפון/u);
  assert.match(guestText, /דנה,מבוגר/u);
});

test("reads Excel contacts from first sheet without saving or guessing a missing leading zero", async () => {
  const file = await workbook("contacts.xlsx", [
    {
      sheet: "אנשי קשר",
      data: toExcelSheetData(
        ["שם מלא", "טלפון"],
        [
          { "שם מלא": "דנה כהן", טלפון: "+972501234567" },
          { "שם מלא": "אורי לוי", טלפון: 501234568 },
        ],
      ),
    },
    {
      sheet: "אחר",
      data: toExcelSheetData(
        ["שם מלא", "טלפון"],
        [{ "שם מלא": "לא יובא", טלפון: "+972501234569" }],
      ),
    },
  ]);
  const contacts = await readContactSpreadsheet(file);
  assert.deepEqual(contacts, [
    { fullName: "דנה כהן", phones: ["+972501234567"] },
    { fullName: "אורי לוי", phones: ["501234568"] },
  ]);
});

test("rejects legacy XLS and files above the configured size before parsing", async () => {
  await assert.rejects(readGuestSpreadsheetText(new File(["x"], "legacy.xls")), /XLS/u);
  await assert.rejects(
    readGuestSpreadsheetText(new File([new Uint8Array(5 * 1024 * 1024 + 1)], "huge.xlsx")),
    /5MB/u,
  );
});

test("rejects an XLSX workbook above the row limit", async () => {
  const data = [["שם מלא", "טלפון"]];
  for (let index = 0; index < 2_000; index += 1) {
    data.push([`אורח ${index}`, "+972501234567"]);
  }
  const file = await workbook("too-many.xlsx", [{ sheet: "אנשי קשר", data }]);
  await assert.rejects(readContactSpreadsheet(file), /2,000/u);
});
