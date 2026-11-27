export type RawContact = {
  fullName: string;
  phones: string[];
};

export type PickedContact = {
  name?: readonly string[];
  tel?: readonly string[];
};

/** Keep only the fields the person explicitly shared through Contact Picker. */
export function fromPickedContacts(contacts: readonly PickedContact[]): RawContact[] {
  return contacts.map((contact) => ({
    fullName: contact.name?.[0]?.trim() ?? "",
    phones: (contact.tel ?? []).map((phone) => phone.trim()).filter(Boolean),
  }));
}

export type ContactPreviewStatus =
  | "ready"
  | "duplicate_import"
  | "existing_guest"
  | "missing_name"
  | "missing_phone"
  | "invalid_phone";

export type ContactPreview = RawContact & {
  normalizedPhones: string[];
  selectedPhone: string | null;
  status: ContactPreviewStatus;
  existingGuestId?: string;
};

export type ContactDecision = "invite" | "decline" | "maybe" | "skip";
export type ContactDecisionHistoryEntry = {
  index: number;
  previous: ContactDecision | undefined;
};

export function rewindContactDecision(
  choices: Readonly<Record<number, ContactDecision>>,
  history: readonly ContactDecisionHistoryEntry[],
  saved: ReadonlySet<number>,
): { choices: Record<number, ContactDecision>; history: ContactDecisionHistoryEntry[] } | null {
  let position = history.length - 1;
  while (position >= 0 && saved.has(history[position].index)) position -= 1;
  if (position < 0) return null;
  const previousChoice = history[position];
  const nextChoices = { ...choices };
  if (previousChoice.previous) nextChoices[previousChoice.index] = previousChoice.previous;
  else delete nextChoices[previousChoice.index];
  return {
    choices: nextChoices,
    history: history.filter((_, index) => index !== position),
  };
}

/** Touch gestures stay horizontal so native vertical scrolling remains available. */
export function classifyContactSwipe(
  dx: number,
  dy: number,
  pointerType: string,
): ContactDecision | null {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  if (Math.abs(dx) >= 70 && Math.abs(dx) >= Math.abs(dy) * 1.2)
    return dx > 0 ? "invite" : "decline";
  if (pointerType === "mouse" && Math.abs(dy) >= 70 && Math.abs(dy) >= Math.abs(dx) * 1.2)
    return dy < 0 ? "maybe" : "skip";
  return null;
}

export type ContactSwipeSummary = {
  eligible: number;
  decided: number;
  undecided: number;
  percent: number;
  invited: number;
  declined: number;
  maybe: number;
  skipped: number;
  blocked: number;
  saved: number;
};

export function summarizeContactDecisions(
  rows: readonly ContactPreview[],
  choices: Readonly<Record<number, ContactDecision>>,
  saved: ReadonlySet<number>,
): ContactSwipeSummary {
  const summary: ContactSwipeSummary = {
    eligible: 0,
    decided: 0,
    undecided: 0,
    percent: 0,
    invited: 0,
    declined: 0,
    maybe: 0,
    skipped: 0,
    blocked: 0,
    saved: 0,
  };
  rows.forEach((row, index) => {
    if (row.status !== "ready") {
      summary.blocked += 1;
      return;
    }
    summary.eligible += 1;
    const choice = choices[index];
    if (choice) {
      summary.decided += 1;
      if (choice === "invite") summary.invited += 1;
      else if (choice === "decline") summary.declined += 1;
      else if (choice === "maybe") summary.maybe += 1;
      else summary.skipped += 1;
    }
    if (saved.has(index)) summary.saved += 1;
  });
  summary.undecided = summary.eligible - summary.decided;
  summary.percent = summary.eligible ? Math.round((summary.decided / summary.eligible) * 100) : 0;
  return summary;
}

export type InvitedCategorySummary = {
  categoryId: string | null;
  name: string;
  count: number;
  saved: number;
  pending: number;
};

export function summarizeInvitedByCategory(
  rows: readonly ContactPreview[],
  choices: Readonly<Record<number, ContactDecision>>,
  categoryIds: Readonly<Record<number, string>>,
  categories: readonly { id: string; name: string }[],
  saved: ReadonlySet<number>,
): InvitedCategorySummary[] {
  const summary = new Map<string, InvitedCategorySummary>();
  for (const category of categories) {
    summary.set(category.id, {
      categoryId: category.id,
      name: category.name,
      count: 0,
      saved: 0,
      pending: 0,
    });
  }
  const unassigned: InvitedCategorySummary = {
    categoryId: null,
    name: "ללא קטגוריה",
    count: 0,
    saved: 0,
    pending: 0,
  };
  rows.forEach((row, index) => {
    if (row.status !== "ready" || choices[index] !== "invite") return;
    const category = summary.get(categoryIds[index]) ?? unassigned;
    category.count += 1;
    if (saved.has(index)) category.saved += 1;
    else category.pending += 1;
  });
  return [...summary.values(), unassigned].filter((category) => category.count > 0);
}

export function assignCategoryToPendingInvites(
  rows: readonly ContactPreview[],
  choices: Readonly<Record<number, ContactDecision>>,
  currentAssignments: Readonly<Record<number, string>>,
  saved: ReadonlySet<number>,
  categoryId: string | null,
  availableCategoryIds: ReadonlySet<string>,
): { assignments: Record<number, string>; count: number } {
  if (categoryId !== null && !availableCategoryIds.has(categoryId))
    throw new Error("Unknown draft category");
  const assignments = { ...currentAssignments };
  let count = 0;
  rows.forEach((row, index) => {
    if (row.status !== "ready" || choices[index] !== "invite" || saved.has(index)) return;
    if (categoryId === null) delete assignments[index];
    else assignments[index] = categoryId;
    count += 1;
  });
  return { assignments, count };
}

export function buildInvitedContactDraft(
  row: ContactPreview,
  phone: string | null,
  groupSize: number,
  categoryName: string | null,
) {
  if (row.status !== "ready" || !row.fullName.trim()) throw new Error("Contact is not eligible");
  if (!phone || !row.normalizedPhones.includes(phone)) throw new Error("Phone was not selected");
  if (!Number.isSafeInteger(groupSize) || groupSize < 1) throw new Error("Invalid group size");
  return {
    full_name: row.fullName.trim(),
    phone,
    group_size: groupSize,
    group_category: categoryName?.trim() || null,
    side: "משותף" as const,
  };
}

export function normalizeDraftCategoryName(
  input: string,
  existingNames: readonly string[],
  previousName?: string,
): string | null {
  const name = input.trim().replace(/\s+/g, " ");
  if (!name || name.length > 60) return null;
  const canonical = name.toLocaleLowerCase("he");
  if (
    existingNames.some(
      (existing) =>
        existing.toLocaleLowerCase("he") === canonical &&
        existing.toLocaleLowerCase("he") !== previousName?.toLocaleLowerCase("he"),
    )
  )
    return null;
  return name;
}

type ExistingGuestPhone = { id: string; phone: string | null | undefined };

/** Return an E.164 number, or null when the input is incomplete or ambiguous. */
export function normalizePhone(input: string): string | null {
  const compact = input.replace(/[\s\u200e\u200f\u202a-\u202e().-]/g, "");
  if (!/^\+?\d+$/.test(compact)) return null;

  let international = compact;
  if (international.startsWith("00")) international = `+${international.slice(2)}`;
  else if (international.startsWith("972")) international = `+${international}`;
  else if (international.startsWith("0")) {
    // Israel's trunk prefix is omitted in E.164. Do not guess a country for
    // numbers without a trunk prefix or an explicit international prefix.
    if (!/^0[2-9]\d{7,8}$/.test(international)) return null;
    international = `+972${international.slice(1)}`;
  }

  if (!/^\+[1-9]\d{6,14}$/.test(international)) return null;
  // +9720... is a common accidental combination of country and trunk prefixes.
  if (international.startsWith("+9720")) return null;
  return international;
}

function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (quoted) throw new Error("קובץ אנשי הקשר מכיל מרכאות שאינן סגורות");
  if (row.length || cell) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function firstRecord(text: string): string {
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '"') {
      if (quoted && text[i + 1] === '"') i += 1;
      else quoted = !quoted;
    } else if (!quoted && (text[i] === "\r" || text[i] === "\n")) {
      return text.slice(0, i);
    }
  }
  return text;
}

const NAME_HEADERS = new Set(["שם", "שם מלא", "name", "full name", "contact name", "display name"]);
const FIRST_NAME_HEADERS = new Set(["שם פרטי", "first name", "given name"]);
const LAST_NAME_HEADERS = new Set(["שם משפחה", "last name", "family name", "surname"]);

function isPhoneHeader(header: string): boolean {
  return (
    /^(טלפון|נייד|סלולרי|מספר טלפון|phone|mobile|cell|telephone|tel)(\s*\d+|\s*[-_ ]\s*(home|work|mobile))?$/.test(
      header,
    ) ||
    /^phone\s*\d+\s*-\s*value$/.test(header) ||
    /^(mobile|home|work) phone$/.test(header)
  );
}

/** Parse a local CSV export without sending its contents to a server. */
export function parseContactCsv(text: string): RawContact[] {
  const source = text.replace(/^\uFEFF/, "");
  const headerLine = firstRecord(source);
  const delimiters = [",", ";", "\t"];
  const delimiter = delimiters.reduce((best, candidate) =>
    parseDelimited(headerLine, candidate)[0].length > parseDelimited(headerLine, best)[0].length
      ? candidate
      : best,
  );
  const rows = parseDelimited(source, delimiter);
  if (!rows.length) return [];

  const headers = rows[0].map((cell) => cell.trim().toLowerCase());
  const nameColumn = headers.findIndex((header) => NAME_HEADERS.has(header));
  const firstNameColumn = headers.findIndex((header) => FIRST_NAME_HEADERS.has(header));
  const lastNameColumn = headers.findIndex((header) => LAST_NAME_HEADERS.has(header));
  const phoneColumns = headers.flatMap((header, index) => (isPhoneHeader(header) ? [index] : []));
  if ((nameColumn < 0 && firstNameColumn < 0) || !phoneColumns.length) {
    throw new Error("לא נמצאו עמודות שם וטלפון בקובץ אנשי הקשר");
  }

  return rows
    .slice(1)
    .filter((row) => row.some((cell) => cell.trim()))
    .map((row) => ({
      fullName:
        nameColumn >= 0
          ? (row[nameColumn] ?? "").trim()
          : [row[firstNameColumn] ?? "", row[lastNameColumn] ?? ""]
              .map((part) => part.trim())
              .filter(Boolean)
              .join(" "),
      phones: phoneColumns.map((index) => (row[index] ?? "").trim()).filter(Boolean),
    }));
}

function unescapeVCard(value: string): string {
  return value.replace(/\\([nN,;\\])/g, (_match, escaped: string) =>
    escaped.toLowerCase() === "n" ? "\n" : escaped,
  );
}

/** Read the name and phone fields from vCard 3/4 text exports. */
export function parseVCardContacts(text: string): RawContact[] {
  const unfolded = text.replace(/\r\n[ \t]|\n[ \t]|\r[ \t]/g, "");
  const contacts: RawContact[] = [];
  let fields: string[] | null = null;
  for (const line of unfolded.split(/\r\n|\n|\r/)) {
    if (/^BEGIN:VCARD$/i.test(line)) {
      fields = [];
    } else if (/^END:VCARD$/i.test(line)) {
      if (fields) {
        const entries = fields
          .map((field) => {
            const separator = field.indexOf(":");
            return separator < 0
              ? null
              : {
                  key: field.slice(0, separator).split(";")[0].replace(/^.*\./, "").toUpperCase(),
                  value: field.slice(separator + 1),
                };
          })
          .filter((entry): entry is { key: string; value: string } => entry !== null);
        const fullName = entries.find((entry) => entry.key === "FN")?.value;
        const structuredName = entries.find((entry) => entry.key === "N")?.value;
        const fallbackName = structuredName
          ? structuredName
              .split(/(?<!\\);/)
              .slice(0, 2)
              .reverse()
              .map(unescapeVCard)
              .filter(Boolean)
              .join(" ")
          : "";
        contacts.push({
          fullName: unescapeVCard(fullName ?? fallbackName).trim(),
          phones: entries
            .filter((entry) => entry.key === "TEL")
            .map((entry) => entry.value.replace(/^tel:/i, "").trim()),
        });
      }
      fields = null;
    } else if (fields) {
      fields.push(line);
    }
  }
  return contacts;
}

/** Classify local rows against one another and existing guests before any save. */
export function prepareContactPreview(
  contacts: RawContact[],
  existingGuests: ExistingGuestPhone[],
): ContactPreview[] {
  const existing = new Map<string, string>();
  for (const guest of existingGuests) {
    const phone = guest.phone ? normalizePhone(guest.phone) : null;
    if (phone) existing.set(phone, guest.id);
  }
  const seen = new Set<string>();

  return contacts.map((contact) => {
    const normalizedPhones = [
      ...new Set(
        contact.phones.map(normalizePhone).filter((phone): phone is string => Boolean(phone)),
      ),
    ];
    const existingGuestId = normalizedPhones.map((phone) => existing.get(phone)).find(Boolean);
    const importedDuplicate = normalizedPhones.some((phone) => seen.has(phone));
    normalizedPhones.forEach((phone) => seen.add(phone));
    let status: ContactPreviewStatus = "ready";
    if (!contact.fullName.trim()) status = "missing_name";
    else if (!contact.phones.length) status = "missing_phone";
    else if (!normalizedPhones.length) status = "invalid_phone";
    else if (existingGuestId) status = "existing_guest";
    else if (importedDuplicate) status = "duplicate_import";

    return {
      ...contact,
      normalizedPhones,
      selectedPhone: normalizedPhones[0] ?? null,
      status,
      ...(existingGuestId ? { existingGuestId } : {}),
    };
  });
}
