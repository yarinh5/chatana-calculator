import { Link } from "react-router-dom";
import { Loader2, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useSubscription } from "@/hooks/useSubscription";
import { useDashboardOverview } from "@/hooks/useDashboardOverview";
import { WeddingCalculator } from "@/components/wedding/WeddingCalculator";
import { AppTopBar } from "@/components/AppTopBar";
import { AdvisorComposer } from "@/components/advisor/AdvisorComposer";

export default function Dashboard() {
  const { profile, user } = useAuth();
  const { activeEventId: eventId, loading, error, can, refresh } = useWorkspace();
  const subscription = useSubscription(eventId, { includeExpenseCount: can("expenses_view") });
  const canShowOverview = can("budget_view");
  const overview = useDashboardOverview(eventId, user?.id ?? null, {
    guests: canShowOverview && can("guests_view"),
    rsvp: canShowOverview && can("rsvp_view"),
    vendors: canShowOverview && can("vendors_view"),
  });

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
              <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
                <OverviewCard
                  title="מוזמנים"
                  value={overview.guests.data ? String(overview.guests.data.invited) : null}
                  detail={
                    overview.guests.data ? `${overview.guests.data.groups} קבוצות הזמנה` : null
                  }
                  permitted={can("guests_view")}
                  loading={overview.guests.isPending}
                  error={!!overview.guests.error}
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
                />
                <OverviewCard
                  title="ספקים"
                  value={overview.vendors.data !== undefined ? String(overview.vendors.data) : null}
                  detail="ספקים ברשימה"
                  permitted={can("vendors_view")}
                  loading={overview.vendors.isPending}
                  error={!!overview.vendors.error}
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
              {can("rsvp_view") && overview.rsvp.data && overview.rsvp.data.groups > 0 && (
                <div className="mt-3 rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
                  <div className="mb-1 flex justify-between gap-2">
                    <span>קבוצות שהשיבו לאישור ההגעה</span>
                    <span className="tabular-nums">{overview.rsvp.data.responseRate}%</span>
                  </div>
                  <div
                    className="h-2 overflow-hidden rounded-full bg-secondary"
                    role="progressbar"
                    aria-valuenow={overview.rsvp.data.responseRate}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="שיעור קבוצות שהשיבו"
                  >
                    <div
                      className="h-full rounded-full bg-rose"
                      style={{ width: `${overview.rsvp.data.responseRate}%` }}
                    />
                  </div>
                  {overview.rsvp.error && (
                    <p className="mt-1">הרענון נכשל; מוצג הנתון האחרון שנטען.</p>
                  )}
                </div>
              )}
            </div>
          </section>
          <section
            className="border-b border-border bg-card/80"
            dir="rtl"
            aria-label="מדד בריאות החתונה"
          >
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm md:px-6">
              <div>
                <h2 className="font-semibold text-foreground">
                  מדד בריאות החתונה · אין מספיק נתונים
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  הציון יופיע רק כשיהיו נתונים מאומתים על מספיק תחומי תכנון. כרגע אין ציון אמין
                  להצגה.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                {can("guests_view") && (
                  <Link
                    to="/guests"
                    className="rounded-full border border-border px-3 py-1.5 hover:bg-secondary"
                  >
                    עיון במוזמנים
                  </Link>
                )}
                {can("rsvp_view") && (
                  <Link
                    to="/rsvp"
                    className="rounded-full border border-border px-3 py-1.5 hover:bg-secondary"
                  >
                    עיון באישורי הגעה
                  </Link>
                )}
                {can("vendors_view") && (
                  <Link
                    to="/vendors"
                    className="rounded-full border border-border px-3 py-1.5 hover:bg-secondary"
                  >
                    עיון בספקים
                  </Link>
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
}: {
  title: string;
  value: string | null;
  detail: string | null;
  permitted: boolean;
  loading: boolean;
  error: boolean;
}) {
  const display = !permitted ? "אין הרשאה" : value !== null ? value : loading ? "טוען…" : "לא זמין";
  const caption = !permitted
    ? "אין גישה לנתון בסביבת העבודה"
    : error
      ? value !== null
        ? "הרענון נכשל · מוצג נתון קודם"
        : "טעינת הנתון נכשלה"
      : detail;

  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-foreground sm:text-xl">
        {display}
      </div>
      {caption && <p className="mt-0.5 text-xs text-muted-foreground">{caption}</p>}
    </div>
  );
}
