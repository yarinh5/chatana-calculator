import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, CheckCheck } from "lucide-react";
import { AppTopBar } from "@/components/AppTopBar";
import { useRsvp } from "@/hooks/useRsvp";
import { useSubscription } from "@/hooks/useSubscription";
import { useWorkspace } from "@/hooks/useWorkspace";
import { createNotices, type NoticeCategory } from "@/lib/notifications";
import { todayISO } from "@/lib/payments";

const CATEGORY_LABELS: Record<NoticeCategory, string> = {
  payment: "תשלומים",
  rsvp: "אישורי הגעה",
  task: "משימות",
  document: "מסמכים",
  wedding: "יום החתונה",
  subscription: "מנוי",
};

export default function Notifications() {
  const workspace = useWorkspace();
  const eventId = workspace.activeEventId;
  const canViewRsvp = !!workspace.activeWorkspace && workspace.can("rsvp_view");
  const rsvp = useRsvp(canViewRsvp ? eventId : null);
  const subscription = useSubscription(eventId, { includeExpenseCount: false });

  if (workspace.loading) return <State title="טוענים סביבת עבודה" />;
  if (workspace.error) return <State title="לא הצלחנו לטעון את סביבת העבודה" />;
  if (!workspace.activeWorkspace || !eventId) return <State title="אין סביבת עבודה פעילה" />;

  return (
    <div dir="rtl" className="min-h-screen bg-background text-foreground">
      <AppTopBar subscription={subscription} />
      <NotificationList
        key={eventId}
        weddingDate={workspace.activeWorkspace.wedding_date}
        subscription={subscription}
        rsvp={rsvp}
        canViewRsvp={canViewRsvp}
      />
    </div>
  );
}

function State({ title }: { title: string }) {
  return (
    <div
      dir="rtl"
      className="flex min-h-screen items-center justify-center bg-background p-4 text-center"
    >
      {title}
    </div>
  );
}

function NotificationList({
  weddingDate,
  subscription,
  rsvp,
  canViewRsvp,
}: {
  weddingDate: string | null;
  subscription: ReturnType<typeof useSubscription>;
  rsvp: ReturnType<typeof useRsvp>;
  canViewRsvp: boolean;
}) {
  const [readIds, setReadIds] = useState<ReadonlySet<string>>(new Set());
  const [filter, setFilter] = useState<NoticeCategory | "all">("all");
  const [showRead, setShowRead] = useState(true);
  const notices = useMemo(() => {
    const rsvpGroups = canViewRsvp && !rsvp.loading && !rsvp.error ? rsvp.rows : null;
    return createNotices({
      today: todayISO(),
      weddingDate,
      subscription:
        !subscription.loading && !subscription.error && subscription.subscription
          ? { status: subscription.status, expiresAt: subscription.expiresAt }
          : null,
      rsvp: rsvpGroups
        ? {
            totalGroups: rsvpGroups.length,
            unansweredGroups: rsvpGroups.filter((row) =>
              ["not_sent", "sent", "awaiting_response"].includes(row.status),
            ).length,
          }
        : null,
    });
  }, [canViewRsvp, rsvp.error, rsvp.loading, rsvp.rows, subscription, weddingDate]);
  const visible = notices.filter(
    (notice) =>
      (filter === "all" || notice.category === filter) && (showRead || !readIds.has(notice.id)),
  );
  const unreadCount = notices.filter((notice) => !readIds.has(notice.id)).length;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 md:px-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-3xl">
            <Bell size={27} aria-hidden /> מרכז התראות
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {unreadCount} פריטים שלא סומנו כנקראו בטיוטה
          </p>
        </div>
        <button
          type="button"
          onClick={() => setReadIds(new Set(notices.map((notice) => notice.id)))}
          disabled={!unreadCount}
          className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm disabled:opacity-40"
        >
          <CheckCheck size={16} /> סמן הכל כנקרא
        </button>
      </div>
      <p role="status" className="mb-5 rounded-xl border border-gold/40 bg-gold/10 p-4 text-sm">
        ההתראות כאן מחושבות מתוך תאריך החתונה, מצב המנוי ואישורי הגעה רק אם יש הרשאת צפייה. סימון
        כנקרא והעדפות תצוגה הם זמניים ויתאפסו ברענון. לא נשלחות הודעות Push, דוא״ל או WhatsApp.
        התראות תשלומים, משימות ומסמכים יחוברו לאחר חיבור מקורות הנתונים והרשאותיהם.
      </p>
      {(subscription.error || (canViewRsvp && rsvp.error)) && (
        <p role="alert" className="mb-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
          חלק ממקורות הנתונים אינם זמינים כרגע; מוצגות רק התראות שניתן לאמת.
        </p>
      )}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <label className="text-sm">
          סוג התראה{" "}
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as NoticeCategory | "all")}
            className="mr-2 rounded-lg border border-border bg-card px-3 py-2"
          >
            <option value="all">הכול</option>
            {(["subscription", "rsvp", "wedding"] as const).map((category) => (
              <option key={category} value={category}>
                {CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showRead}
            onChange={(event) => setShowRead(event.target.checked)}
          />
          הצג גם נקראו
        </label>
      </div>
      {!visible.length ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          אין התראות מאומתות לתצוגה הזו.
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((notice) => (
            <li key={notice.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">
                    {CATEGORY_LABELS[notice.category]}
                  </p>
                  <h2 className="mt-1 font-semibold">{notice.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{notice.detail}</p>
                </div>
                <span className="rounded-full bg-secondary px-3 py-1 text-xs">
                  {notice.severity === "urgent"
                    ? "דחוף"
                    : notice.severity === "soon"
                      ? "בקרוב"
                      : "מידע"}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
                <Link to={notice.path} className="font-medium underline">
                  מעבר למסך
                </Link>
                <button
                  type="button"
                  onClick={() =>
                    setReadIds((current) => {
                      const next = new Set(current);
                      if (next.has(notice.id)) next.delete(notice.id);
                      else next.add(notice.id);
                      return next;
                    })
                  }
                  className="text-muted-foreground underline"
                >
                  {readIds.has(notice.id) ? "סמן כלא נקרא" : "סמן כנקרא"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
