import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { HeyGenVideoPlayer, LANDING_VIDEOS } from "@/components/landing/HeyGenVideoPlayer";
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
            <a href="#videos" className="hidden rounded-full px-3 py-1.5 hover:bg-secondary sm:inline-flex">סרטונים</a>
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

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-rose/10 via-background to-gold/10" />
        <div className="absolute -top-20 -end-20 -z-10 size-[500px] rounded-full bg-rose/20 blur-3xl" />
        <div className="absolute -bottom-20 -start-20 -z-10 size-[500px] rounded-full bg-gold/20 blur-3xl" />

        <div className="mx-auto max-w-6xl px-4 py-20 md:px-6 md:py-28">
          <div className="grid items-center gap-12 md:grid-cols-2">
            <div className="text-center md:text-right">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gold/15 px-3 py-1 text-xs font-medium text-foreground ring-1 ring-gold/40">
                <Sparkles size={14} /> חדש בישראל 2025
              </span>
              <h1 className="mt-4 font-display text-4xl leading-tight md:text-6xl">
                תכננו חתונה<br />
                <span className="text-rose">בלי הפתעות בתקציב</span>
              </h1>
              <p className="mt-5 text-base leading-relaxed text-muted-foreground md:text-lg">
                מחשבון תקציב מלא עם מחירי שוק אמיתיים, חישוב עלות לאורח, וה־
                <strong className="text-foreground">"רווח מהמעטפות"</strong> — הפיצ׳ר היחיד בישראל שמראה לכם בזמן אמת
                האם תצאו ברווח או בהפסד מהחתונה שלכם.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row md:justify-start">
                <Link
                  to={ctaTo}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-rose px-6 py-3 text-base font-medium text-primary-foreground shadow-lg shadow-rose/30 transition hover:bg-primary-deep"
                >
                  <Calculator size={18} /> {session ? "פתח מחשבון" : "התחל בחינם — 60 שניות"}
                </Link>
                <a
                  href="#videos"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card px-6 py-3 text-base font-medium hover:bg-secondary"
                >
                  צפו בסרטונים 🎬
                </a>
              </div>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground md:justify-start">
                <span className="inline-flex items-center gap-1"><CheckCircle2 size={14} className="text-success" /> ללא כרטיס אשראי</span>
                <span className="inline-flex items-center gap-1"><CheckCircle2 size={14} className="text-success" /> נתונים בענן</span>
                <span className="inline-flex items-center gap-1"><CheckCircle2 size={14} className="text-success" /> עברית מלאה</span>
              </div>
            </div>

            {/* Hero card preview */}
            <div className="relative">
              <div className="rounded-3xl border border-border bg-card p-6 shadow-2xl shadow-rose/10">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-display text-lg">סיכום חי</h3>
                  <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] text-success">מעודכן</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <StatTile label="סך הוצאות" value="₪ 142,500" tint="bg-cat-venue" />
                  <StatTile label="עלות לאורח" value="₪ 712" tint="bg-cat-photo" />
                  <StatTile label="צפי מעטפות" value="₪ 168,000" tint="bg-cat-rings" />
                  <StatTile label="רווח 💚" value="+ ₪ 25,500" tint="bg-success/15" valueClass="text-success" />
                </div>
                <div className="mt-5 rounded-xl bg-secondary p-4 text-xs text-muted-foreground">
                  💡 הוסיפו 30 אורחים → הרווח עולה ל־ ₪ 38,400
                </div>
              </div>
              <div className="absolute -top-4 -start-4 -z-10 size-full rounded-3xl bg-gradient-to-br from-rose/30 to-gold/30 blur-2xl" />
            </div>
          </div>
        </div>
      </section>

      {/* Videos section — HeyGen avatars */}
      <section id="videos" className="border-t border-border bg-secondary/30 py-20">
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose/15 px-3 py-1 text-xs font-medium ring-1 ring-rose/30">
              🎬 הסבר בוידאו
            </span>
            <h2 className="mt-3 font-display text-3xl md:text-4xl">
              צפו במדריך מהיר בעזרת אווטרים
            </h2>
            <p className="mt-3 text-muted-foreground">
              4 סרטונים קצרים שיסבירו לכם בדיוק איך לתכנן חתונה בלי לבזבז שקל מיותר.
            </p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {LANDING_VIDEOS.map((video) => (
              <HeyGenVideoPlayer key={video.id} video={video} />
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
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

function StatTile({ label, value, tint, valueClass }: { label: string; value: string; tint: string; valueClass?: string }) {
  return (
    <div className={`rounded-xl ${tint} p-4`}>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`mt-1 font-display text-lg ${valueClass ?? "text-foreground"}`}>{value}</div>
    </div>
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
