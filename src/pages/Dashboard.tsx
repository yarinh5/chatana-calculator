import { Link } from "react-router-dom";
import { Loader2, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useSubscription } from "@/hooks/useSubscription";
import { WeddingCalculator } from "@/components/wedding/WeddingCalculator";
import { AppTopBar } from "@/components/AppTopBar";

export default function Dashboard() {
  const { profile } = useAuth();
  const { activeEventId: eventId, loading, error, can, refresh } = useWorkspace();
  const subscription = useSubscription(eventId);

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
      eventId={eventId}
      subscription={subscription}
      permissions={{
        canViewBudget: can("budget_view"),
        canEditBudget: can("budget_edit"),
        canViewExpenses: can("expenses_view"),
        canEditExpenses: can("expenses_edit"),
        canViewPayments: can("payments_view"),
        canEditPayments: can("payments_edit"),
      }}
      topBar={<AppTopBar subscription={subscription} />}
      subtitle={profile?.full_name ? `שלום ${profile.full_name} — בואו נתכנן 💕` : undefined}
    />
  );
}
