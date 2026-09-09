import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Crown, Loader2 } from "lucide-react";
import { AppTopBar } from "@/components/AppTopBar";
import { useAuth } from "@/hooks/use-auth";
import { useSubscription } from "@/hooks/useSubscription";
import { supabase } from "@/integrations/supabase/client";
import { PLAN_CONFIG, PRICE_LABELS, formatDateHe } from "@/lib/subscription";

export default function Pricing() {
  const { session } = useAuth();
  const [eventId, setEventId] = useState<string | null>(null);
  const subscription = useSubscription(eventId);
  const showExtension = subscription.isPremiumActive || subscription.status === "premium_expired";

  useEffect(() => {
    if (!session?.user) return;
    void supabase
      .from("events")
      .select("id")
      .eq("owner_id", session.user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setEventId(data?.id ?? null));
  }, [session?.user]);

  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl">
      {session ? (
        <AppTopBar subscription={eventId ? subscription : undefined} />
      ) : (
        <PublicPricingTopBar />
      )}
      <main className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-12">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-rose">Wedding Budget IL</p>
          <h1 className="mt-2 font-display text-3xl leading-tight sm:text-4xl">מסלולי גישה</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            שני מסלולים פשוטים: ניסיון חינם לתכנון ראשוני, או Premium לניהול מלא של החתונה.
          </p>
        </div>

        {eventId && subscription.loading && (
          <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-card px-3 py-1.5 text-xs text-muted-foreground ring-1 ring-border">
            <Loader2 size={14} className="animate-spin" /> טוען מצב מנוי
          </div>
        )}

        <section className="mt-8 grid gap-4 md:grid-cols-2">
          <PlanCard
            title="ניסיון חינם"
            price={PRICE_LABELS.trial}
            subtitle={PRICE_LABELS.trialSubtitle}
            items={[
              `עד ${PLAN_CONFIG.trialExpenseLimit} פריטי הוצאה`,
              "ניהול רשימת מוזמנים ללא מגבלת כמות",
              'ללא "מי הגיע"',
              "ללא ניהול תשלומים ומקדמות",
            ]}
            cta={session ? "המסלול הנוכחי נפתח בהרשמה" : "התחל בחינם"}
            to={session ? "/dashboard" : "/register"}
          />
          <PlanCard
            featured
            title="Premium"
            price={PRICE_LABELS.premium}
            subtitle={PRICE_LABELS.premiumSubtitle}
            badge={PRICE_LABELS.launchBadge}
            items={[
              "פריטי הוצאה ללא מגבלת ניסיון",
              "ניהול תשלומים ומקדמות",
              'מצב "מי הגיע" ויום החתונה',
              "גישה מלאה לכל מה שכבר קיים במערכת",
            ]}
            cta="פנו למנהל להפעלת Premium"
            to={session ? "/dashboard" : "/register"}
          />
        </section>

        {showExtension && (
          <section className="mt-5 rounded-2xl bg-card p-5 ring-1 ring-gold/40">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-xl text-foreground">הארכת Premium</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {PLAN_CONFIG.extensionMonths} חודשים נוספים ב-{PRICE_LABELS.extension}
                  {subscription.expiresAt
                    ? ` · תוקף נוכחי: ${formatDateHe(subscription.expiresAt)}`
                    : ""}
                </p>
              </div>
              <Link
                to="/dashboard"
                className="inline-flex min-h-10 items-center justify-center rounded-xl bg-gold/20 px-4 text-sm font-semibold ring-1 ring-gold/40 hover:bg-gold/30"
              >
                פנו למנהל להארכה
              </Link>
            </div>
          </section>
        )}

        <p className="mt-6 text-xs leading-5 text-muted-foreground">
          תשלום אוטומטי עדיין לא מחובר. הפעלת Premium והארכות מתבצעות כרגע ידנית על ידי מנהל.
        </p>
      </main>
    </div>
  );
}

function PublicPricingTopBar() {
  return (
    <div className="border-b border-border bg-card/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6">
        <Link to="/" className="font-display text-lg font-bold text-foreground">
          Wedding Budget IL
        </Link>
        <div className="flex items-center gap-2">
          <Link
            to="/login"
            className="inline-flex min-h-9 items-center justify-center rounded-full border border-border px-3 text-xs font-semibold hover:bg-secondary"
          >
            כניסה
          </Link>
          <Link
            to="/register"
            className="inline-flex min-h-9 items-center justify-center rounded-full bg-rose px-3 text-xs font-semibold text-white hover:bg-rose/90"
          >
            הרשמה
          </Link>
        </div>
      </div>
    </div>
  );
}

function PlanCard({
  title,
  price,
  subtitle,
  items,
  cta,
  to,
  badge,
  featured,
}: {
  title: string;
  price: string;
  subtitle: string;
  items: string[];
  cta: string;
  to: string;
  badge?: string;
  featured?: boolean;
}) {
  return (
    <article
      className={`rounded-2xl bg-card p-5 ring-1 sm:p-6 ${
        featured ? "shadow-xl shadow-rose/10 ring-rose/35" : "ring-border"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-2xl text-foreground">{title}</h2>
        {badge && (
          <span className="inline-flex items-center gap-1 rounded-full bg-gold/15 px-3 py-1 text-xs font-semibold ring-1 ring-gold/40">
            <Crown size={13} /> {badge}
          </span>
        )}
      </div>
      <div className="mt-5 flex items-end gap-2">
        <span className="font-display text-5xl text-foreground">{price}</span>
        <span className="pb-2 text-sm text-muted-foreground">{subtitle}</span>
      </div>
      <ul className="mt-6 space-y-3 text-sm text-foreground">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      <Link
        to={to}
        className={`mt-7 inline-flex min-h-11 w-full items-center justify-center rounded-xl px-4 text-sm font-semibold ${
          featured
            ? "bg-rose text-primary-foreground hover:bg-primary-deep"
            : "border border-border bg-card hover:bg-secondary"
        }`}
      >
        {cta}
      </Link>
    </article>
  );
}
