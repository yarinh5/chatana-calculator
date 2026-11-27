import { useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Clock3, List, Pencil, Plus, Trash2 } from "lucide-react";
import { AppTopBar } from "@/components/AppTopBar";
import { useSubscription } from "@/hooks/useSubscription";
import { useWorkspace } from "@/hooks/useWorkspace";
import { todayISO } from "@/lib/payments";
import {
  checklistForWedding,
  daysUntilDate,
  summarizeTasks,
  validateTask,
  type WeddingTask,
} from "@/lib/task-domain";

type View = "list" | "calendar" | "timeline";
const PRIORITY = { low: "נמוכה", medium: "רגילה", high: "גבוהה" } as const;
const STATUS = { todo: "לביצוע", in_progress: "בתהליך", done: "הושלמה" } as const;
const EMPTY_FORM = {
  title: "",
  dueDate: "",
  priority: "medium" as WeddingTask["priority"],
  status: "todo" as WeddingTask["status"],
  category: "כללי",
  assignee: "",
  vendorId: "",
  paymentId: "",
};

export default function Tasks() {
  const workspace = useWorkspace();
  const subscription = useSubscription(workspace.activeEventId, { includeExpenseCount: false });
  if (workspace.loading) return <State title="טוענים סביבת עבודה" />;
  if (workspace.error) return <State title="לא הצלחנו לטעון את סביבת העבודה" />;
  if (!workspace.activeWorkspace) return <State title="אין סביבת עבודה פעילה" />;
  return (
    <div dir="rtl" className="min-h-screen bg-background text-foreground">
      <AppTopBar subscription={subscription} />
      <TaskPlanner
        key={workspace.activeEventId}
        weddingDate={workspace.activeWorkspace.wedding_date}
        eventName={workspace.activeWorkspace.event_name}
        canEdit={subscription.canEdit}
        loadingPermission={subscription.loading}
        permissionError={!!subscription.error}
      />
    </div>
  );
}

function State({ title }: { title: string }) {
  return (
    <div
      dir="rtl"
      className="flex min-h-screen items-center justify-center bg-background p-4 text-center text-foreground"
    >
      {title}
    </div>
  );
}

function TaskPlanner({
  weddingDate,
  eventName,
  canEdit,
  loadingPermission,
  permissionError,
}: {
  weddingDate: string | null;
  eventName: string;
  canEdit: boolean;
  loadingPermission: boolean;
  permissionError: boolean;
}) {
  const [tasks, setTasks] = useState<WeddingTask[]>([]);
  const [view, setView] = useState<View>("list");
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState(() => todayISO().slice(0, 7));
  const today = todayISO();
  const daysToWedding = daysUntilDate(weddingDate, today);
  const summary = summarizeTasks(tasks, today);
  const sorted = useMemo(
    () =>
      [...tasks].sort(
        (a, b) =>
          (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31") ||
          a.title.localeCompare(b.title, "he"),
      ),
    [tasks],
  );

  function saveTask() {
    if (!canEdit) return;
    const next: WeddingTask = {
      id: editingId ?? crypto.randomUUID(),
      templateKey: editingId
        ? (tasks.find((task) => task.id === editingId)?.templateKey ?? null)
        : null,
      title: form.title.trim(),
      dueDate: form.dueDate || null,
      priority: form.priority,
      status: form.status,
      category: form.category.trim() || "כללי",
      assignee: form.assignee.trim() || null,
      vendorId: form.vendorId.trim() || null,
      paymentId: form.paymentId.trim() || null,
    };
    try {
      validateTask(
        next,
        tasks.filter((task) => task.id !== editingId),
      );
      setTasks((current) =>
        editingId
          ? current.map((task) => (task.id === editingId ? next : task))
          : [...current, next],
      );
      setForm(EMPTY_FORM);
      setEditingId(null);
      setFormOpen(false);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "שמירת הטיוטה נכשלה");
    }
  }

  function editTask(task: WeddingTask) {
    if (!canEdit) return;
    setEditingId(task.id);
    setForm({
      title: task.title,
      dueDate: task.dueDate ?? "",
      priority: task.priority,
      status: task.status,
      category: task.category,
      assignee: task.assignee ?? "",
      vendorId: task.vendorId ?? "",
      paymentId: task.paymentId ?? "",
    });
    setFormOpen(true);
    setError(null);
  }

  function removeTask(task: WeddingTask) {
    if (!canEdit || !window.confirm(`למחוק את המשימה המקומית "${task.title}"?`)) return;
    setTasks((current) => current.filter((item) => item.id !== task.id));
    if (editingId === task.id) {
      setEditingId(null);
      setFormOpen(false);
      setForm(EMPTY_FORM);
    }
  }

  function applyChecklist() {
    if (!canEdit || !weddingDate) return;
    try {
      setTasks((current) => [...current, ...checklistForWedding(weddingDate, current)]);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "לא ניתן להוסיף את התבנית");
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 md:px-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{eventName}</p>
          <h1 className="font-display text-3xl">משימות וציר זמן</h1>
        </div>
        <p className="text-sm font-semibold">
          {daysToWedding === null
            ? "הוסיפו תאריך חתונה כדי לראות ספירה לאחור"
            : daysToWedding < 0
              ? "יום החתונה חלף"
              : daysToWedding === 0
                ? "החתונה היום!"
                : `${daysToWedding} ימים לחתונה`}
        </p>
      </div>
      <div role="status" className="mb-5 rounded-2xl border border-gold/40 bg-gold/10 p-4 text-sm">
        אלו משימות בטיוטה מקומית בלבד. הן אינן נשמרות או משותפות, ויימחקו כשתעזבו את העמוד. הרשאות
        משימות ושמירה קבועה יושלמו לאחר חיבור המסד.
      </div>
      {!canEdit && (
        <p role="status" className="mb-4 rounded-xl bg-secondary p-3 text-sm">
          {loadingPermission
            ? "בודקים הרשאת עריכה..."
            : permissionError
              ? "מצב המנוי אינו זמין; העריכה חסומה עד לטעינה תקינה."
              : "המנוי במצב צפייה בלבד; עריכת טיוטת המשימות חסומה."}
        </p>
      )}
      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          ["סך המשימות", summary.total],
          ["פתוחות", summary.open],
          ["הושלמו", summary.done],
          ["באיחור", summary.overdue],
          ["ב־7 ימים הקרובים", summary.dueSoon],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      <div className="mb-5 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!canEdit}
          onClick={() => {
            setForm(EMPTY_FORM);
            setEditingId(null);
            setFormOpen(true);
            setError(null);
          }}
          className="inline-flex items-center gap-1 rounded-full bg-gold/15 px-4 py-2 text-sm ring-1 ring-gold/40 disabled:opacity-40"
        >
          <Plus size={16} /> משימה חדשה
        </button>
        <button
          type="button"
          disabled={!canEdit || !weddingDate}
          onClick={applyChecklist}
          className="rounded-full border border-border px-4 py-2 text-sm disabled:opacity-40"
        >
          הוסף תבנית משימות לפי תאריך החתונה
        </button>
        <div className="mr-auto flex gap-1">
          {(["list", "calendar", "timeline"] as const).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={view === item}
              onClick={() => setView(item)}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-2 text-sm ${view === item ? "bg-primary text-primary-foreground" : "border border-border"}`}
            >
              {item === "list" ? (
                <List size={15} />
              ) : item === "calendar" ? (
                <CalendarDays size={15} />
              ) : (
                <Clock3 size={15} />
              )}
              {item === "list" ? "רשימה" : item === "calendar" ? "לוח שנה" : "ציר זמן"}
            </button>
          ))}
        </div>
      </div>
      {error && (
        <p role="alert" className="mb-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {formOpen && (
        <section className="mb-6 rounded-2xl border border-border bg-card p-4">
          <h2 className="mb-3 font-semibold">{editingId ? "עריכת משימה" : "משימה חדשה"}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm sm:col-span-2">
              שם המשימה
              <input
                value={form.title}
                maxLength={200}
                onChange={(event) =>
                  setForm((current) => ({ ...current, title: event.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
              />
            </label>
            <label className="text-sm">
              תאריך יעד
              <input
                type="date"
                value={form.dueDate}
                onChange={(event) =>
                  setForm((current) => ({ ...current, dueDate: event.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
              />
            </label>
            <label className="text-sm">
              קטגוריה
              <input
                value={form.category}
                onChange={(event) =>
                  setForm((current) => ({ ...current, category: event.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
              />
            </label>
            <label className="text-sm">
              עדיפות
              <select
                value={form.priority}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    priority: event.target.value as WeddingTask["priority"],
                  }))
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
              >
                {Object.entries(PRIORITY).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              מצב
              <select
                value={form.status}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    status: event.target.value as WeddingTask["status"],
                  }))
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
              >
                {Object.entries(STATUS).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              אחראי/ת בטיוטה
              <input
                value={form.assignee}
                onChange={(event) =>
                  setForm((current) => ({ ...current, assignee: event.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
              />
            </label>
            <label className="text-sm">
              מזהה ספק (טיוטה בלבד)
              <input
                value={form.vendorId}
                onChange={(event) =>
                  setForm((current) => ({ ...current, vendorId: event.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
              />
            </label>
            <label className="text-sm">
              מזהה תשלום (טיוטה בלבד)
              <input
                value={form.paymentId}
                onChange={(event) =>
                  setForm((current) => ({ ...current, paymentId: event.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
              />
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={!canEdit}
              onClick={saveTask}
              className="rounded-full bg-gold/20 px-4 py-2 text-sm font-semibold ring-1 ring-gold/40 disabled:opacity-40"
            >
              {editingId ? "עדכן בטיוטה" : "הוסף לטיוטה"}
            </button>
            <button
              type="button"
              onClick={() => {
                setFormOpen(false);
                setEditingId(null);
                setError(null);
              }}
              className="rounded-full border border-border px-4 py-2 text-sm"
            >
              ביטול
            </button>
          </div>
        </section>
      )}
      {!tasks.length ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
          עדיין אין משימות בטיוטה. אפשר להוסיף משימה או להתחיל מתבנית.
        </p>
      ) : view === "calendar" ? (
        <TaskCalendar month={month} setMonth={setMonth} tasks={tasks} onEdit={editTask} />
      ) : (
        <div className={view === "timeline" ? "border-r-2 border-gold/40 pr-4" : "grid gap-3"}>
          {sorted.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              today={today}
              canEdit={canEdit}
              onEdit={() => editTask(task)}
              onRemove={() => removeTask(task)}
              onStatus={(status) =>
                setTasks((current) =>
                  current.map((item) => (item.id === task.id ? { ...item, status } : item)),
                )
              }
            />
          ))}
        </div>
      )}
    </main>
  );
}

function TaskCard({
  task,
  today,
  canEdit,
  onEdit,
  onRemove,
  onStatus,
}: {
  task: WeddingTask;
  today: string;
  canEdit: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onStatus: (status: WeddingTask["status"]) => void;
}) {
  const days = daysUntilDate(task.dueDate, today);
  return (
    <article className="mb-2 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{task.title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {task.category} · {PRIORITY[task.priority]} ·{" "}
            {task.dueDate
              ? new Date(`${task.dueDate}T00:00:00`).toLocaleDateString("he-IL")
              : "ללא תאריך יעד"}
            {task.assignee ? ` · ${task.assignee}` : ""}
          </p>
          {task.vendorId && (
            <p className="text-xs text-muted-foreground">מזהה ספק בטיוטה: {task.vendorId}</p>
          )}
          {task.paymentId && (
            <p className="text-xs text-muted-foreground">מזהה תשלום בטיוטה: {task.paymentId}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-secondary px-2 py-1 text-xs">{STATUS[task.status]}</span>
          {days !== null && task.status !== "done" && days < 0 && (
            <span className="rounded-full bg-destructive/10 px-2 py-1 text-xs text-destructive">
              באיחור
            </span>
          )}
          {days !== null && task.status !== "done" && days >= 0 && days <= 7 && (
            <span className="rounded-full bg-gold/15 px-2 py-1 text-xs">קרוב</span>
          )}
        </div>
      </div>
      {canEdit && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
          <select
            aria-label={`שנה מצב של ${task.title}`}
            value={task.status}
            onChange={(event) => onStatus(event.target.value as WeddingTask["status"])}
            className="rounded border border-border bg-background px-2 py-1 text-xs"
          >
            {Object.entries(STATUS).map(([key, value]) => (
              <option key={key} value={key}>
                {value}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs"
          >
            <Pencil size={13} /> ערוך
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex items-center gap-1 rounded border border-destructive/40 px-2 py-1 text-xs text-destructive"
          >
            <Trash2 size={13} /> מחק
          </button>
        </div>
      )}
    </article>
  );
}

function TaskCalendar({
  month,
  setMonth,
  tasks,
  onEdit,
}: {
  month: string;
  setMonth: (month: string) => void;
  tasks: WeddingTask[];
  onEdit: (task: WeddingTask) => void;
}) {
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  const offset = first.getUTCDay();
  const length = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const days = Array.from({ length: offset + length }, (_, index) =>
    index < offset ? null : index - offset + 1,
  );
  const changeMonth = (delta: number) => {
    const next = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
    setMonth(next.toISOString().slice(0, 7));
  };
  return (
    <section className="rounded-2xl border border-border bg-card p-3">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => changeMonth(-1)}
          className="rounded border border-border px-3 py-1 text-sm"
        >
          החודש הקודם
        </button>
        <h2 className="font-semibold">
          {first.toLocaleDateString("he-IL", { month: "long", year: "numeric", timeZone: "UTC" })}
        </h2>
        <button
          type="button"
          onClick={() => changeMonth(1)}
          className="rounded border border-border px-3 py-1 text-sm"
        >
          החודש הבא
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"].map((label) => (
          <div key={label} className="py-2 font-semibold">
            {label}
          </div>
        ))}
        {days.map((day, index) => {
          const iso = day ? `${month}-${String(day).padStart(2, "0")}` : null;
          const dayTasks = tasks.filter((task) => task.dueDate === iso);
          return (
            <div
              key={index}
              className="min-h-20 rounded border border-border/60 p-1 text-right sm:min-h-24"
            >
              <span className="font-semibold">{day ?? ""}</span>
              {dayTasks.slice(0, 3).map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => onEdit(task)}
                  title={task.title}
                  className="mt-1 block w-full truncate rounded bg-gold/15 px-1 py-0.5 text-right text-[10px]"
                >
                  {task.status === "done" ? <CheckCircle2 size={10} className="inline" /> : null}{" "}
                  {task.title}
                </button>
              ))}
              {dayTasks.length > 3 && (
                <span className="text-[10px]">ועוד {dayTasks.length - 3}</span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
