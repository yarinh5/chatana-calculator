export type WeddingTask = {
  id: string;
  templateKey: string | null;
  title: string;
  dueDate: string | null;
  priority: "low" | "medium" | "high";
  status: "todo" | "in_progress" | "done";
  category: string;
  assignee: string | null;
  vendorId: string | null;
  paymentId: string | null;
};

const DAY_MS = 86_400_000;

export function parseDateISO(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toISOString().slice(0, 10) === value ? date : null;
}

export function shiftDateISO(value: string, days: number): string {
  const date = parseDateISO(value);
  if (!date || !Number.isSafeInteger(days)) throw new Error("תאריך יעד לא תקין");
  return new Date(date.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysUntilDate(date: string | null, today: string): number | null {
  if (!date) return null;
  const target = parseDateISO(date);
  const current = parseDateISO(today);
  return target && current ? Math.round((target.getTime() - current.getTime()) / DAY_MS) : null;
}

type ChecklistTemplate = { key: string; title: string; category: string; daysBefore: number };
const CHECKLIST: readonly ChecklistTemplate[] = [
  { key: "venue", title: "לבדוק ולבחור אולם", category: "מקום", daysBefore: 365 },
  { key: "vendors", title: "לתאם ספקים מרכזיים", category: "ספקים", daysBefore: 240 },
  { key: "guests", title: "להכין רשימת מוזמנים", category: "מוזמנים", daysBefore: 180 },
  { key: "invitations", title: "להכין הזמנות ואישורי הגעה", category: "מוזמנים", daysBefore: 90 },
  { key: "payments", title: "לבדוק תשלומים ויתרות לספקים", category: "תקציב", daysBefore: 30 },
  { key: "seating", title: "לגבש סידורי הושבה", category: "הושבה", daysBefore: 21 },
  { key: "final", title: "לאשר פרטים אחרונים מול הספקים", category: "ספקים", daysBefore: 7 },
];

/** Templates have deterministic keys, so repeated application never duplicates a task. */
export function checklistForWedding(
  weddingDate: string,
  existing: readonly WeddingTask[],
): WeddingTask[] {
  if (!parseDateISO(weddingDate)) throw new Error("תאריך החתונה אינו תקין");
  const existingKeys = new Set(existing.map((task) => task.templateKey).filter(Boolean));
  return CHECKLIST.filter((template) => !existingKeys.has(template.key))
    .map<WeddingTask>((template) => ({
      id: `checklist:${template.key}`,
      templateKey: template.key,
      title: template.title,
      dueDate: shiftDateISO(weddingDate, -template.daysBefore),
      priority: "medium",
      status: "todo",
      category: template.category,
      assignee: null,
      vendorId: null,
      paymentId: null,
    }))
    .filter(
      (templateTask) =>
        !existing.some(
          (task) =>
            task.title.trim().toLocaleLowerCase("he-IL") ===
              templateTask.title.toLocaleLowerCase("he-IL") &&
            task.dueDate === templateTask.dueDate,
        ),
    );
}

export function validateTask(task: WeddingTask, existing: readonly WeddingTask[] = []): void {
  if (!task.id || existing.some((item) => item.id === task.id))
    throw new Error("מזהה המשימה כבר קיים");
  if (!task.title.trim() || task.title.trim().length > 200)
    throw new Error("שם המשימה חייב להכיל 1–200 תווים");
  if (task.dueDate && !parseDateISO(task.dueDate)) throw new Error("תאריך היעד אינו תקין");
  if (
    existing.some(
      (item) =>
        item.title.trim().toLocaleLowerCase("he-IL") ===
          task.title.trim().toLocaleLowerCase("he-IL") && item.dueDate === task.dueDate,
    )
  ) {
    throw new Error("כבר קיימת משימה עם אותו שם ותאריך יעד");
  }
}

export function summarizeTasks(tasks: readonly WeddingTask[], today: string) {
  if (!parseDateISO(today)) throw new Error("תאריך היום אינו תקין");
  const open = tasks.filter((task) => task.status !== "done");
  return {
    total: tasks.length,
    open: open.length,
    done: tasks.length - open.length,
    overdue: open.filter((task) => {
      const days = daysUntilDate(task.dueDate, today);
      return days !== null && days < 0;
    }).length,
    dueSoon: open.filter((task) => {
      const days = daysUntilDate(task.dueDate, today);
      return days !== null && days >= 0 && days <= 7;
    }).length,
  };
}
