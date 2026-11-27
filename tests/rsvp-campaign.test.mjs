import assert from "node:assert/strict";
import { test } from "node:test";
import { prepareCampaignPreview } from "../src/lib/rsvp-campaign.ts";

const candidate = (overrides = {}) => ({
  guestId: "g1",
  fullName: "דנה כהן",
  phone: "0501234567",
  category: "משפחה",
  side: "כלה",
  rsvpStatus: "awaiting",
  lastInvitationSentAt: null,
  rsvpLink: "https://example.test/rsvp/one",
  ...overrides,
});
const variables = { coupleNames: "דנה ואורי", weddingDate: "12/06/2027", venueName: "גן האירועים" };

test("renders every supported placeholder for a real recipient preview", () => {
  const [row] = prepareCampaignPreview(
    [candidate()],
    { kind: "all" },
    "היי $שם_פרטי, $שמות_הזוג מזמינים אותך ב־$תאריך_החתונה אל $שם_האולם: $קישור",
    variables,
  );
  assert.equal(row.normalizedPhone, "+972501234567");
  assert.deepEqual(row.problems, []);
  assert.equal(
    row.message,
    "היי דנה, דנה ואורי מזמינים אותך ב־12/06/2027 אל גן האירועים: https://example.test/rsvp/one",
  );
});

test("filters unanswered and manually selected invitation groups", () => {
  const rows = [
    candidate(),
    candidate({ guestId: "g2", rsvpStatus: "confirmed", phone: "0521234567" }),
  ];
  assert.deepEqual(
    prepareCampaignPreview(rows, { kind: "unanswered" }, "היי $שם_פרטי $קישור", variables).map(
      (row) => row.guestId,
    ),
    ["g1"],
  );
  assert.deepEqual(
    prepareCampaignPreview(
      rows,
      { kind: "manual", guestIds: new Set(["g2"]) },
      "היי $שם_פרטי $קישור",
      variables,
    ).map((row) => row.guestId),
    ["g2"],
  );
});

test("blocks duplicate phone, invalid phone, and absent RSVP link", () => {
  const rows = prepareCampaignPreview(
    [
      candidate(),
      candidate({ guestId: "g2", phone: "+972501234567" }),
      candidate({ guestId: "g3", phone: "123", rsvpLink: null }),
    ],
    { kind: "all" },
    "שלום $שם_פרטי $קישור",
    variables,
  );
  assert.deepEqual(rows[0].problems, ["duplicate_phone"]);
  assert.equal(rows[0].message, null);
  assert.deepEqual(rows[1].problems, ["duplicate_phone"]);
  assert.equal(rows[1].message, null);
  assert.deepEqual(rows[2].problems, ["invalid_phone", "missing_link"]);
});

test("checks duplicate numbers only among the selected recipients", () => {
  const rows = prepareCampaignPreview(
    [
      candidate(),
      candidate({ guestId: "g2", phone: "+972501234567", lastInvitationSentAt: "2026-01-01" }),
    ],
    { kind: "not_sent" },
    "שלום $שם_פרטי $קישור",
    variables,
  );
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].problems, []);
});

test("rejects unknown variables and duplicate group IDs", () => {
  assert.throws(
    () => prepareCampaignPreview([candidate()], { kind: "all" }, "היי $שגוי", variables),
    /לא מוכר/,
  );
  assert.throws(
    () =>
      prepareCampaignPreview(
        [candidate(), candidate()],
        { kind: "all" },
        "היי $שם_פרטי",
        variables,
      ),
    /כפולה/,
  );
});
