import assert from "node:assert/strict";
import test from "node:test";
import {
  fromPickedContacts,
  normalizePhone,
  parseContactCsv,
  parseVCardContacts,
  prepareContactPreview,
} from "./contact-import.ts";

test("normalizes Israeli and international phone numbers without inventing missing digits", () => {
  assert.equal(normalizePhone("050-123-4567"), "+972501234567");
  assert.equal(normalizePhone("+972 50 123 4567"), "+972501234567");
  assert.equal(normalizePhone("00972 50 123 4567"), "+972501234567");
  assert.equal(normalizePhone("972501234567"), "+972501234567");
  assert.equal(normalizePhone("03-1234567"), "+97231234567");
  assert.equal(normalizePhone("+1 (415) 555-2671"), "+14155552671");
  assert.equal(normalizePhone("12345"), null);
  assert.equal(normalizePhone("0501234567 ext 4"), null);
});

test("parses quoted CSV, Hebrew headers, and multiple phone columns", () => {
  const rows = parseContactCsv('שם,טלפון,Phone 2\n"כהן, דנה",0501234567,+972541234567\nאורי,,');
  assert.deepEqual(rows, [
    { fullName: "כהן, דנה", phones: ["0501234567", "+972541234567"] },
    { fullName: "אורי", phones: [] },
  ]);
});

test("parses Google Contacts CSV and semicolon separated exports", () => {
  assert.deepEqual(
    parseContactCsv(
      "Given Name,Family Name,Phone 1 - Value,Phone 2 - Value\nדנה,כהן,0501234567,0521234567",
    ),
    [{ fullName: "דנה כהן", phones: ["0501234567", "0521234567"] }],
  );
  assert.deepEqual(parseContactCsv("שם;טלפון\nאורי;0501234567"), [
    { fullName: "אורי", phones: ["0501234567"] },
  ]);
});

test("parses folded vCards and N fallback without importing unrelated fields", () => {
  const rows = parseVCardContacts(
    "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:דנה כהן\r\nTEL;TYPE=CELL:050-123-4567\r\nTEL;TYPE=HOME:+972541234567\r\nNOTE:private\r\nEND:VCARD\r\nBEGIN:VCARD\r\nN:לוי;אורי;;;\r\nTEL:0521234567\r\nEND:VCARD",
  );
  assert.deepEqual(rows, [
    { fullName: "דנה כהן", phones: ["050-123-4567", "+972541234567"] },
    { fullName: "אורי לוי", phones: ["0521234567"] },
  ]);
});

test("parses grouped Apple vCard telephone properties", () => {
  assert.deepEqual(
    parseVCardContacts("BEGIN:VCARD\nFN:דנה\nitem1.TEL;TYPE=CELL:0501234567\nEND:VCARD"),
    [{ fullName: "דנה", phones: ["0501234567"] }],
  );
});

test("flags duplicate imported and existing guest numbers before any save", () => {
  const rows = prepareContactPreview(
    [
      { fullName: "דנה כהן", phones: ["0501234567"] },
      { fullName: "דנה אחרת", phones: ["+972501234567"] },
      { fullName: "אורי", phones: ["0521234567"] },
      { fullName: "בלי מספר", phones: [] },
      { fullName: "", phones: ["0531234567"] },
      { fullName: "שגוי", phones: ["12345"] },
    ],
    [{ id: "guest-1", phone: "+972521234567" }],
  );
  assert.deepEqual(
    rows.map((row) => row.status),
    [
      "ready",
      "duplicate_import",
      "existing_guest",
      "missing_phone",
      "missing_name",
      "invalid_phone",
    ],
  );
  assert.equal(rows[2].existingGuestId, "guest-1");
});

test("maps only selected name and telephone data from the browser contact picker", () => {
  assert.deepEqual(
    fromPickedContacts([
      { name: [" דנה כהן "], tel: [" 0501234567 ", ""] },
      { name: [], tel: ["0521234567"] },
    ]),
    [
      { fullName: "דנה כהן", phones: ["0501234567"] },
      { fullName: "", phones: ["0521234567"] },
    ],
  );
});
