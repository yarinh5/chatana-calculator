import assert from "node:assert/strict";
import test from "node:test";
import {
  assignCategoryToPendingInvites,
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

test("classifies horizontal touch swipes without taking over vertical scrolling", () => {
  assert.equal(classifyContactSwipe(90, 8, "touch"), "invite");
  assert.equal(classifyContactSwipe(-90, 8, "touch"), "decline");
  assert.equal(classifyContactSwipe(20, -110, "touch"), null);
  assert.equal(classifyContactSwipe(20, 110, "touch"), null);
  assert.equal(classifyContactSwipe(80, 75, "touch"), null);
  assert.equal(classifyContactSwipe(40, 4, "touch"), null);
  assert.equal(classifyContactSwipe(8, -90, "mouse"), "maybe");
  assert.equal(classifyContactSwipe(8, 90, "mouse"), "skip");
});

test("undo restores the previous decision and skips already saved rows", () => {
  const history = [
    { index: 0, previous: undefined },
    { index: 1, previous: undefined },
    { index: 1, previous: "decline" },
  ];
  assert.deepEqual(rewindContactDecision({ 0: "invite", 1: "maybe" }, history, new Set([0])), {
    choices: { 0: "invite", 1: "decline" },
    history: history.slice(0, 2),
  });
  assert.deepEqual(
    rewindContactDecision({ 0: "invite", 1: "decline" }, history.slice(0, 2), new Set([0])),
    {
      choices: { 0: "invite" },
      history: history.slice(0, 1),
    },
  );
  assert.equal(rewindContactDecision({ 0: "invite" }, history.slice(0, 1), new Set([0])), null);
});

test("summarizes swipe progress while keeping declined and maybe contacts local", () => {
  const rows = prepareContactPreview(
    [
      { fullName: "דנה", phones: ["0501234567"] },
      { fullName: "אורי", phones: ["0521234567"] },
      { fullName: "נועה", phones: ["0541234567"] },
      { fullName: "כפול", phones: ["0501234567"] },
    ],
    [],
  );
  assert.deepEqual(
    summarizeContactDecisions(rows, { 0: "invite", 1: "decline", 2: "maybe" }, new Set([0])),
    {
      eligible: 3,
      decided: 3,
      undecided: 0,
      percent: 100,
      invited: 1,
      declined: 1,
      maybe: 1,
      skipped: 0,
      blocked: 1,
      saved: 1,
    },
  );
});

test("progress handles undecided and zero eligible contacts", () => {
  const rows = prepareContactPreview(
    [
      { fullName: "דנה", phones: ["0501234567"] },
      { fullName: "אורי", phones: ["0521234567"] },
    ],
    [],
  );
  const partial = summarizeContactDecisions(rows, { 0: "invite" }, new Set());
  assert.equal(partial.undecided, 1);
  assert.equal(partial.percent, 50);
  const empty = summarizeContactDecisions([], {}, new Set());
  assert.equal(empty.undecided, 0);
  assert.equal(empty.percent, 0);
});

test("invited category summary follows draft order and separates saved from pending", () => {
  const rows = prepareContactPreview(
    [
      { fullName: "דנה", phones: ["0501234567"] },
      { fullName: "אורי", phones: ["0521234567"] },
      { fullName: "נועה", phones: ["0541234567"] },
      { fullName: "רוני", phones: ["0581234567"] },
    ],
    [],
  );
  assert.deepEqual(
    summarizeInvitedByCategory(
      rows,
      { 0: "invite", 1: "invite", 2: "invite", 3: "decline" },
      { 0: "friends", 1: "family", 2: "deleted" },
      [
        { id: "family", name: "משפחה" },
        { id: "friends", name: "חברים" },
      ],
      new Set([0]),
    ),
    [
      { categoryId: "family", name: "משפחה", count: 1, saved: 0, pending: 1 },
      { categoryId: "friends", name: "חברים", count: 1, saved: 1, pending: 0 },
      { categoryId: null, name: "ללא קטגוריה", count: 1, saved: 0, pending: 1 },
    ],
  );
});

test("bulk category assignment changes only unsaved invited contacts", () => {
  const rows = prepareContactPreview(
    [
      { fullName: "דנה", phones: ["0501234567"] },
      { fullName: "אורי", phones: ["0521234567"] },
      { fullName: "נועה", phones: ["0541234567"] },
      { fullName: "כפול", phones: ["0501234567"] },
    ],
    [],
  );
  const choices = { 0: "invite", 1: "invite", 2: "decline", 3: "invite" };
  const original = { 0: "old", 1: "old", 2: "old", 3: "old" };
  const available = new Set(["new"]);
  assert.deepEqual(
    assignCategoryToPendingInvites(rows, choices, original, new Set([0]), "new", available),
    {
      assignments: { 0: "old", 1: "new", 2: "old", 3: "old" },
      count: 1,
    },
  );
  assert.deepEqual(
    assignCategoryToPendingInvites(rows, choices, original, new Set([0]), null, available),
    {
      assignments: { 0: "old", 2: "old", 3: "old" },
      count: 1,
    },
  );
  assert.deepEqual(
    assignCategoryToPendingInvites(rows, choices, original, new Set([0, 1]), "new", available),
    {
      assignments: original,
      count: 0,
    },
  );
  assert.throws(() =>
    assignCategoryToPendingInvites(rows, choices, original, new Set(), "missing", available),
  );
});

test("builds an invited guest draft with chosen group size and category only", () => {
  const row = prepareContactPreview([{ fullName: " דנה ", phones: ["0501234567"] }], [])[0];
  assert.deepEqual(buildInvitedContactDraft(row, row.selectedPhone, 3, "חברים"), {
    full_name: "דנה",
    phone: "+972501234567",
    group_size: 3,
    group_category: "חברים",
    side: "משותף",
  });
  assert.throws(() => buildInvitedContactDraft(row, "+972541234567", 3, null));
  assert.throws(() => buildInvitedContactDraft(row, row.selectedPhone, 0, null));
});

test("category names reject empty, overlong and duplicate labels", () => {
  assert.equal(normalizeDraftCategoryName("  חברים טובים  ", []), "חברים טובים");
  assert.equal(normalizeDraftCategoryName(" ", []), null);
  assert.equal(normalizeDraftCategoryName("א".repeat(61), []), null);
  assert.equal(normalizeDraftCategoryName("חברים", ["חברים"]), null);
  assert.equal(normalizeDraftCategoryName("חברים", ["חברים"], "חברים"), "חברים");
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
