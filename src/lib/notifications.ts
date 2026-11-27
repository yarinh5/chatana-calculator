export type NoticeCategory = "payment" | "rsvp" | "task" | "document" | "wedding" | "subscription";

export type Notice = {
  id: string;
  category: NoticeCategory;
  severity: "urgent" | "soon" | "info";
  title: string;
  detail: string;
  path: string;
};

export type NoticeInput = {
  today: string;
  weddingDate?: string | null;
  subscription?: {
    status: "trial_active" | "premium_active" | "trial_expired" | "premium_expired";
    expiresAt: string | null;
  } | null;
  rsvp?: { totalGroups: number; unansweredGroups: number } | null;
  payments?:
    | readonly {
        id: string;
        name: string;
        dueDate: string;
        dueAmount: number;
      }[]
    | null;
  tasks?: readonly { id: string; title: string; dueDate: string; done: boolean }[] | null;
  missingDocuments?: number | null;
};

const DAY_MS = 86_400_000;

function dayOffset(today: string, date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(today) || !/^\d{4}-\d{2}-\d{2}$/u.test(date)) {
    return null;
  }
  const first = Date.parse(`${today}T00:00:00Z`);
  const second = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
  if (new Date(first).toISOString().slice(0, 10) !== today) return null;
  if (new Date(second).toISOString().slice(0, 10) !== date) return null;
  return Math.round((second - first) / DAY_MS);
}

/** A deterministic, in-app projection. It never claims that a message was sent. */
export function createNotices(input: NoticeInput): Notice[] {
  if (dayOffset(input.today, input.today) === null) throw new Error("תאריך היום אינו תקין");
  const notices: Notice[] = [];
  const weddingDays = input.weddingDate ? dayOffset(input.today, input.weddingDate) : null;

  if (input.subscription) {
    const days = input.subscription.expiresAt
      ? dayOffset(input.today, input.subscription.expiresAt.slice(0, 10))
      : null;
    if (
      input.subscription.status === "trial_expired" ||
      input.subscription.status === "premium_expired"
    ) {
      notices.push({
        id: `subscription:${input.subscription.status}`,
        category: "subscription",
        severity: "urgent",
        title: "תוקף המנוי הסתיים",
        detail: "המידע שלכם שמור. אפשר לצפות בו ולהמשיך אחרי חידוש הגישה.",
        path: "/pricing",
      });
    } else if (days !== null && days >= 0 && days <= 7 && input.subscription.expiresAt) {
      notices.push({
        id: `subscription:${input.subscription.status}:${input.subscription.expiresAt.slice(0, 10)}`,
        category: "subscription",
        severity: days <= 2 ? "urgent" : "soon",
        title: "המנוי עומד להסתיים",
        detail: `נותרו ${days} ימים לגישה הפעילה.`,
        path: "/pricing",
      });
    }
  }

  for (const payment of input.payments ?? []) {
    const days = dayOffset(input.today, payment.dueDate);
    if (days === null || !Number.isFinite(payment.dueAmount) || payment.dueAmount <= 0 || days > 7)
      continue;
    notices.push({
      id: `payment:${payment.id}:${payment.dueDate}`,
      category: "payment",
      severity: days < 0 ? "urgent" : "soon",
      title: days < 0 ? "תשלום באיחור" : "תשלום קרוב",
      detail: `${payment.name} · ${payment.dueDate}`,
      path: "/dashboard",
    });
  }

  if (
    input.rsvp &&
    Number.isInteger(input.rsvp.totalGroups) &&
    Number.isInteger(input.rsvp.unansweredGroups) &&
    input.rsvp.totalGroups >= input.rsvp.unansweredGroups &&
    input.rsvp.unansweredGroups > 0 &&
    weddingDays !== null &&
    weddingDays >= 0 &&
    weddingDays <= 60
  ) {
    notices.push({
      id: `rsvp:unanswered:${input.weddingDate}`,
      category: "rsvp",
      severity: weddingDays <= 14 ? "urgent" : "soon",
      title: "ממתינים לאישורי הגעה",
      detail: `${input.rsvp.unansweredGroups} קבוצות עדיין לא השיבו.`,
      path: "/rsvp",
    });
  }

  for (const task of input.tasks ?? []) {
    const days = dayOffset(input.today, task.dueDate);
    if (task.done || days === null || days >= 0) continue;
    notices.push({
      id: `task:${task.id}:${task.dueDate}`,
      category: "task",
      severity: "urgent",
      title: "משימה באיחור",
      detail: task.title,
      path: "/tasks",
    });
  }

  if (Number.isInteger(input.missingDocuments) && Number(input.missingDocuments) > 0) {
    notices.push({
      id: "document:missing",
      category: "document",
      severity: "info",
      title: "מסמכים חסרים",
      detail: `${input.missingDocuments} מסמכים עדיין חסרים.`,
      path: "/documents",
    });
  }

  if (weddingDays !== null && [30, 7, 1, 0].includes(weddingDays)) {
    notices.push({
      id: `wedding:${input.weddingDate}:${weddingDays}`,
      category: "wedding",
      severity: weddingDays <= 1 ? "urgent" : "info",
      title: weddingDays === 0 ? "יום החתונה הגיע" : "החתונה מתקרבת",
      detail: weddingDays === 0 ? "מאחלים לכם יום שמח!" : `נותרו ${weddingDays} ימים לחתונה.`,
      path: "/dashboard",
    });
  }

  const unique = new Map<string, Notice>();
  for (const notice of notices) unique.set(notice.id, notice);
  const rank = { urgent: 0, soon: 1, info: 2 };
  return [...unique.values()].sort(
    (a, b) => rank[a.severity] - rank[b.severity] || a.id.localeCompare(b.id),
  );
}
