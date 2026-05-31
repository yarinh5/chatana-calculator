import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { ScrollVideo } from "@/components/landing/ScrollVideo";
import videoIntro from "@/assets/video-intro.mp4.asset.json";
import videoMarket from "@/assets/video-market.mp4.asset.json";
import videoEnvelopes from "@/assets/video-envelopes.mp4.asset.json";
import videoAdmin from "@/assets/video-admin.mp4.asset.json";
import {
  Calculator,
  Sparkles,
  Wallet,
  Users,
  ShieldCheck,
  Clock,
  Smartphone,
  CheckCircle2,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Wedding Budget IL — מחשבון תקציב חתונה לישראל 2025" },
      {
        name: "description",
        content:
          "מחשבון תקציב חתונה ישראלי מלא — מחירי שוק 2025, חישוב רווח מהמעטפות, ניהול הוצאות, וצוות הפקה. התחילו לתכנן בחינם.",
      },
      { property: "og:title", content: "Wedding Budget IL — תכנון תקציב חתונה חכם" },
      {
        property: "og:description",
        content: "הדרך הפשוטה לתכנן חתונה בישראל בלי הפתעות — מחירים אמיתיים וחישוב רווח מהמעטפות.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { session } = useAuth();
  const ctaTo = session ? "/dashboard" : "/register";

  return (
    <div dir="rtl" className="min-h-screen bg-background text-foreground">
      {/* Top nav */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6">
          <Link to="/" className="font-display text-lg">💍 Wedding Budget IL</Link>
          <nav className="flex items-center gap-2 text-sm">
            <a href="#features" className="hidden rounded-full px-3 py-1.5 hover:bg-secondary sm:inline-flex">תכונות</a>
            <a href="#how" className="hidden rounded-full px-3 py-1.5 hover:bg-secondary sm:inline-flex">איך זה עובד</a>
            {session ? (
              <Link to="/dashboard" className="rounded-full bg-rose px-4 py-1.5 text-primary-foreground hover:bg-primary-deep">למחשבון</Link>
            ) : (
              <>
                <Link to="/login" className="rounded-full px-3 py-1.5 hover:bg-secondary">התחבר</Link>
                <Link to="/register" className="rounded-full bg-rose px-4 py-1.5 text-primary-foreground hover:bg-primary-deep">התחל בחינם</Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero with background video */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <ScrollVideo src={videoIntro.url} ambient className="h-full w-full" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/60 to-background" />
        </div>

        <div className="mx-auto max-w-6xl px-4 py-24 md:px-6 md:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gold/20 px-3 py-1 text-xs font-medium ring-1 ring-gold/40 backdrop-blur">
              <Sparkles size={14} /> חדש בישראל 2025
            </span>
            <h1 className="mt-5 font-display text-4xl leading-tight md:text-6xl">
              תכננו חתונה<br />
              <span className="text-rose">בלי הפתעות בתקציב</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
              מחשבון תקציב מלא עם מחירי שוק אמיתיים, חישוב עלות לאורח, וה־
              <strong className="text-foreground">"רווח מהמעטפות"</strong> — הפיצ׳ר היחיד בישראל שמראה לכם בזמן אמת
              האם תצאו ברווח או בהפסד מהחתונה שלכם.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                to={ctaTo}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-rose px-6 py-3 text-base font-medium text-primary-foreground shadow-lg shadow-rose/30 transition hover:bg-primary-deep"
              >
                <Calculator size={18} /> {session ? "פתח מחשבון" : "התחל בחינם — 60 שניות"}
              </Link>
              <a
                href="#market"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card/80 px-6 py-3 text-base font-medium backdrop-blur hover:bg-secondary"
              >
                גלה את המוצר ↓
              </a>
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><CheckCircle2 size={14} className="text-success" /> ללא כרטיס אשראי</span>
              <span className="inline-flex items-center gap-1"><CheckCircle2 size={14} className="text-success" /> נתונים בענן</span>
              <span className="inline-flex items-center gap-1"><CheckCircle2 size={14} className="text-success" /> עברית מלאה</span>
            </div>
          </div>
        </div>
      </section>

      {/* Scene 1 — Market */}
      <VideoStorySection
        id="market"
        eyebrow="🛒 מחירי שוק אמיתיים"
        title="50+ הוצאות מוכנות לייבוא"
        body="אולם, צילום, DJ, פרחים, שמלה, חליפה — כל מה שצריך לחתונה ישראלית טיפוסית עם מחירי 2025 מעודכנים. לוחצים פעם אחת — ויש לכם תקציב התחלתי מלא."
        videoUrl={videoMarket.url}
        align="right"
      />

      {/* Scene 2 — Envelopes (the killer feature) */}
      <VideoStorySection
        id="envelopes"
        eyebrow="💸 הפיצ׳ר הסודי"
        title='"רווח מהמעטפות" — בזמן אמת'
        body="הזינו את מספר האורחים ומחיר מעטפה ממוצע — והמערכת מחשבת בשבילכם האם תצאו ברווח או בהפסד מהחתונה. הוסיפו 30 אורחים? ראו מיד איך הרווח קופץ."
        videoUrl={videoEnvelopes.url}
        align="left"
        accent
      />

      {/* Features grid */}
      <section id="features" className="py-20">
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl md:text-4xl">כל מה שצריך לתכנון חתונה</h2>
            <p className="mt-3 text-muted-foreground">פיצ׳רים שנבנו במיוחד לזוג הישראלי המודרני.</p>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-3">
            <Feature icon={<Wallet />} title="מחירי שוק אמיתיים" desc="מעל 50 הוצאות עם מחירי 2025 — אולם 450₪ למנה, צלם 8,000₪, DJ 7,000₪ ועוד." tint="bg-cat-venue" />
            <Feature icon={<Calculator />} title="חישוב חי" desc="כל שינוי בכל שדה מעדכן את העלות לאורח, הסיכום, והרווח מהמעטפות — מיד." tint="bg-cat-photo" />
            <Feature icon={<Sparkles />} title="רווח מהמעטפות" desc="הפיצ׳ר הייחודי בישראל — מחשב כמה תרוויחו אחרי שכל האורחים נתנו מעטפה." tint="bg-cat-rings" />
            <Feature icon={<Users />} title="ניהול לאדמין" desc="מפיקי אירועים — נהלו את כל הלקוחות שלכם במקום אחד עם פאנל מתקדם." tint="bg-cat-music" />
            <Feature icon={<Smartphone />} title="עובד בכל מכשיר" desc="RTL מלא, מותאם למובייל ולדסקטופ, עם עיצוב נקי ונעים לעין." tint="bg-cat-flowers" />
            <Feature icon={<ShieldCheck />} title="נתונים מאובטחים" desc="כל הנתונים שמורים בענן, מוצפנים, ונגישים רק לכם — לא נאבדים ברענון." tint="bg-cat-attire" />
          </div>
        </div>
      </section>

      {/* Scene 3 — Admin */}
      <VideoStorySection
        id="admin"
        eyebrow="👥 למפיקי אירועים"
        title="פאנל ניהול מלא"
        body="צוות הפקה? נהלו את כל הלקוחות שלכם במקום אחד — צפו בתקציבים, נהלו משתמשים, שלחו הזמנות, והשהו גישה — הכל מפאנל אחד נקי."
        videoUrl={videoAdmin.url}
        align="right"
      />

      {/* How it works */}
      <section id="how" className="border-t border-border bg-secondary/30 py-20">
        <div className="mx-auto max-w-5xl px-4 md:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl md:text-4xl">איך זה עובד?</h2>
            <p className="mt-3 text-muted-foreground">3 צעדים פשוטים — ואתם מוכנים.</p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            <Step n={1} title="הירשמו בחינם" desc="חשבון נפתח בשניות — מייל וסיסמא, וזהו." />
            <Step n={2} title="ייבאו הוצאות מהשוק" desc="בחירו מתוך 50+ הוצאות מוכנות, או הוסיפו משלכם." />
            <Step n={3} title="צפו ברווח גדל" desc="עדכנו אורחים, מחיר מעטפה ממוצע, וראו את הרווח בזמן אמת." />
          </div>

          <div className="mt-12 text-center">
            <Link
              to={ctaTo}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-rose px-8 py-4 text-base font-medium text-primary-foreground shadow-lg shadow-rose/30 hover:bg-primary-deep"
            >
              <Calculator size={18} /> {session ? "המשך למחשבון" : "צרו תקציב עכשיו"}
            </Link>
            <p className="mt-3 text-xs text-muted-foreground">
              <Clock size={12} className="me-1 inline" /> לוקח פחות מ־60 שניות להירשם
            </p>
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        <p>💍 Wedding Budget IL · נבנה באהבה לזוגות הישראלים</p>
      </footer>
    </div>
  );
}

function VideoStorySection({
  id,
  eyebrow,
  title,
  body,
  videoUrl,
  align,
  accent,
}: {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  videoUrl: string;
  align: "left" | "right";
  accent?: boolean;
}) {
  return (
    <section
      id={id}
      className={`relative overflow-hidden border-t border-border py-20 ${
        accent ? "bg-gradient-to-br from-rose/5 via-background to-gold/5" : ""
      }`}
    >
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div
          className={`grid items-center gap-10 md:grid-cols-2 ${
            align === "left" ? "md:[&>*:first-child]:order-2" : ""
          }`}
        >
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-xs font-medium ring-1 ring-border">
              {eyebrow}
            </span>
            <h2 className="mt-4 font-display text-3xl md:text-4xl">{title}</h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">{body}</p>
          </div>
          <div className="relative overflow-hidden rounded-3xl border border-border bg-card shadow-2xl shadow-rose/10">
            <div className="aspect-video w-full">
              <ScrollVideo src={videoUrl} ambient />
            </div>
            <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-foreground/5" />
          </div>
        </div>
      </div>
    </section>
  );
}

function Feature({ icon, title, desc, tint }: { icon: React.ReactNode; title: string; desc: string; tint: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 transition hover:shadow-md">
      <div className={`mb-4 inline-flex size-11 items-center justify-center rounded-xl ${tint} text-foreground`}>
        {icon}
      </div>
      <h3 className="font-display text-lg">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{desc}</p>
    </div>
  );
}

function Step({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <div className="relative rounded-2xl border border-border bg-card p-6">
      <div className="absolute -top-4 end-6 flex size-9 items-center justify-center rounded-full bg-rose font-display text-base text-primary-foreground shadow-md">
        {n}
      </div>
      <h3 className="font-display text-lg">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}
