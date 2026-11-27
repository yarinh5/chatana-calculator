export type RawContact = {
  fullName: string;
  phones: string[];
};

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
