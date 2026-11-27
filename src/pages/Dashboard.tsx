import { Link } from "react-router-dom";
import { Loader2, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useSubscription } from "@/hooks/useSubscription";
import { useDashboardOverview } from "@/hooks/useDashboardOverview";
import { WeddingCalculator } from "@/components/wedding/WeddingCalculator";
import { AppTopBar } from "@/components/AppTopBar";
import { AdvisorComposer } from "@/components/advisor/AdvisorComposer";
import { daysUntilWedding, israelToday } from "@/lib/dashboard-overview";

export default function Dashboard() {
  const { profile, user } = useAuth();
  const { activeEventId: eventId, activeWorkspace, loading, error, can, refresh } = useWorkspace();
  const subscription = useSubscription(eventId, { includeExpenseCount: can("expenses_view") });
  const canShowOverview = can("budget_view");
  const overview = useDashboardOverview(eventId, user?.id ?? null, {
    guests: canShowOverview && can("guests_view"),
    rsvp: canShowOverview && can("rsvp_view"),
    vendors: canShowOverview && can("vendors_view"),
  });
  const daysLeft = daysUntilWedding(activeWorkspace?.wedding_date ?? null, israelToday());

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-8 animate-spin text-rose" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <AppTopBar />
        <main className="mx-auto max-w-3xl px-4 py-10 text-center">
          <div className="rounded-2xl border border-destructive/20 bg-card p-8 shadow-sm">
            <h1 className="font-display text-2xl text-foreground">שגיאה בטעינת סביבת העבודה</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              לא הצלחנו לטעון את האירועים הזמינים.
            </p>
            <button
              type="button"
              onClick={() => void refresh()}
              className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-xl bg-rose px-4 text-sm font-medium text-white hover:bg-rose/90"
            >
              <RefreshCw size={15} /> נסה שוב
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (!eventId) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <AppTopBar />
        <main className="mx-auto max-w-3xl px-4 py-10 text-center">
          <div className="rounded-2xl border border-dashed border-border bg-card p-8">
            <h1 className="font-display text-2xl text-foreground">אין אירוע להצגה</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              לאחר יצירת אירוע או קבלת הזמנה תוכלו לעבוד כאן.
            </p>
          </div>
        </main>
      </div>
    );
  }

  if (!can("budget_view")) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <AppTopBar subscription={subscription} />
        <main className="mx-auto max-w-3xl px-4 py-10 text-center">
          <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
            <h1 className="font-display text-2xl text-foreground">אין הרשאה לצפייה בתקציב</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              יש לכם גישה לחלקים אחרים של סביבת העבודה.
            </p>
            {can("guests_view") && (
              <Link
                to="/guests"
                className="mt-5 inline-flex min-h-10 items-center rounded-xl bg-rose px-4 text-sm font-medium text-white hover:bg-rose/90"
              >
                מעבר לרשימת המוזמנים
              </Link>
            )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <WeddingCalculator
      key={eventId}
      eventId={eventId}
      subscription={subscription}
      permissions={{
        canViewBudget: can("budget_view"),
        canEditBudget: can("budget_edit"),
        canViewExpenses: can("expenses_view"),
        canEditExpenses: can("expenses_edit"),
        canViewPayments: can("payments_view"),
        canEditPayments: can("payments_edit"),
        canViewVendors: can("vendors_view"),
        canEditVendors: can("vendors_edit"),
      }}
      topBar={
        <>
          <AppTopBar subscription={subscription} />
          <section
            className="border-b border-border bg-background"
            dir="rtl"
            aria-label="סקירת האירוע"
          >
            <div className="mx-auto max-w-6xl px-4 py-4 md:px-6">
              <h2 className="mb-3 font-display text-lg text-foreground">האירוע במבט אחד</h2>
              <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-5">
                <OverviewCard
                  title="חתונה"
                  value={
                    daysLeft === null
                      ? null
                      : daysLeft >= 0
                        ? String(daysLeft)
                        : `חלפו ${-daysLeft}`
                  }
                  detail={
                    daysLeft === null
                      ? activeWorkspace?.wedding_date
                        ? "תאריך החתונה אינו תקין"
                        : "לא הוגדר תאריך חתונה"
                      : daysLeft < 0
                        ? "ימים מאז תאריך החתונה"
                        : "ימים עד החתונה"
                  }
                  permitted
                  loading={false}
                  error={false}
                />
                <OverviewCard
                  title="מוזמנים"
                  value={overview.guests.data ? String(overview.guests.data.invited) : null}
                  detail={
                    overview.guests.data ? `${overview.guests.data.groups} קבוצות הזמנה` : null
                  }
                  permitted={can("guests_view")}
                  loading={overview.guests.isPending}
                  error={!!overview.guests.error}
                  refreshing={overview.guests.isFetching}
                />
                <OverviewCard
                  title="אישורי הגעה"
                  value={
                    overview.rsvp.data
                      ? overview.rsvp.data.groups
                        ? `${overview.rsvp.data.responseRate}%`
                        : "אין קבוצות"
                      : null
                  }
                  detail={
                    overview.rsvp.data && overview.rsvp.data.groups
                      ? `${overview.rsvp.data.respondedGroups} מתוך ${overview.rsvp.data.groups} קבוצות השיבו`
                      : null
                  }
                  permitted={can("rsvp_view")}
                  loading={overview.rsvp.isPending}
                  error={!!overview.rsvp.error}
                  refreshing={overview.rsvp.isFetching}
                />
                <OverviewCard
                  title="ספקים"
                  value={overview.vendors.data ? String(overview.vendors.data.total) : null}
                  detail={
                    overview.vendors.data ? `${overview.vendors.data.booked} ספקים סגורים` : null
                  }
                  permitted={can("vendors_view")}
                  loading={overview.vendors.isPending}
                  error={!!overview.vendors.error}
                  refreshing={overview.vendors.isFetching}
                />
                <OverviewCard
                  title="פריטי הוצאה"
                  value={
                    !subscription.loading && !subscription.error
                      ? String(subscription.currentExpenseCount)
                      : null
                  }
                  detail="מספר פריטים, ללא סכום כספי"
                  permitted={can("expenses_view")}
                  loading={subscription.loading}
                  error={!!subscription.error}
                />
              </div>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                {can("rsvp_view") && overview.rsvp.data && overview.rsvp.data.invited > 0 && (
                  <section
                    className="rounded-xl border border-border bg-card p-4 text-xs"
                    aria-label="התפלגות אישורי הגעה"
                  >
                    <h3 className="mb-2 font-semibold text-foreground">אישורי הגעה · אנשים</h3>
                    <ProgressRow
                      label="אישרו"
                      value={overview.rsvp.data.confirmed}
                      total={overview.rsvp.data.invited}
                      color="bg-emerald-500"
                    />
                    <ProgressRow
                      label="לא מגיעים"
                      value={overview.rsvp.data.declined}
                      total={overview.rsvp.data.invited}
                      color="bg-rose"
                    />
                    <ProgressRow
                      label="ממתינים"
                      value={overview.rsvp.data.awaiting}
                      total={overview.rsvp.data.invited}
                      color="bg-gold"
                    />
                    <p className="mt-2 text-muted-foreground">
                      {overview.rsvp.data.responseRate}% מקבוצות ההזמנה השיבו
                    </p>
                    {overview.rsvp.error && (
                      <p className="mt-1 text-amber-700">
                        הרענון נכשל; מוצגים הנתונים האחרונים שנטענו.
                      </p>
                    )}
                    {!overview.rsvp.error && overview.rsvp.isFetching && (
                      <p className="mt-1 text-muted-foreground">מעדכן נתונים…</p>
                    )}
                  </section>
                )}
                {can("vendors_view") &&
                  overview.vendors.data &&
                  overview.vendors.data.total > 0 && (
                    <section
                      className="rounded-xl border border-border bg-card p-4 text-xs"
                      aria-label="מצב ספקים"
                    >
                      <h3 className="mb-2 font-semibold text-foreground">מצב ספקים</h3>
                      <ProgressRow
                        label="סגורים"
                        value={overview.vendors.data.booked}
                        total={overview.vendors.data.total}
                        color="bg-emerald-500"
                      />
                      <ProgressRow
                        label="בטיפול"
                        value={overview.vendors.data.inProgress}
                        total={overview.vendors.data.total}
                        color="bg-gold"
                      />
                      <ProgressRow
                        label="בוטלו"
                        value={overview.vendors.data.cancelled}
                        total={overview.vendors.data.total}
                        color="bg-rose"
                      />
                      {overview.vendors.error && (
                        <p className="mt-2 text-amber-700">
                          הרענון נכשל; מוצגים הנתונים האחרונים שנטענו.
                        </p>
                      )}
                      {!overview.vendors.error && overview.vendors.isFetching && (
                        <p className="mt-2 text-muted-foreground">מעדכן נתונים…</p>
                      )}
                    </section>
                  )}
              </div>
            </div>
          </section>
          <AdvisorComposer />
        </>
      }
      subtitle={profile?.full_name ? `שלום ${profile.full_name} — בואו נתכנן 💕` : undefined}
    />
  );
}

function OverviewCard({
  title,
  value,
  detail,
  permitted,
  loading,
  error,
  refreshing = false,
}: {
  title: string;
  value: string | null;
  detail: string | null;
  permitted: boolean;
  loading: boolean;
  error: boolean;
  refreshing?: boolean;
}) {
  const display = !permitted ? "אין הרשאה" : value !== null ? value : loading ? "טוען…" : "לא זמין";
  const caption = !permitted
    ? "אין גישה לנתון בסביבת העבודה"
    : error
      ? value !== null
        ? "הרענון נכשל · מוצג נתון קודם"
        : "טעינת הנתון נכשלה"
      : detail;
  const captionWithRefresh =
    permitted && value !== null && refreshing && !error ? `${caption ?? ""} · מעדכן…` : caption;

  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-foreground sm:text-xl">
        {display}
      </div>
      {captionWithRefresh && (
        <p className="mt-0.5 text-xs text-muted-foreground">{captionWithRefresh}</p>
      )}
    </div>
  );
}

function ProgressRow({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const percent = total > 0 ? Math.min(100, Math.max(0, (value / total) * 100)) : 0;
  return (
    <div className="mb-2">
      <div className="mb-1 flex justify-between gap-2">
        <span>{label}</span>
        <span className="tabular-nums">
          {value} מתוך {total}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={value}
        className="h-2 overflow-hidden rounded-full bg-secondary"
      >
        <div className={`h-full ${color}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
