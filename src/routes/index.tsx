import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef } from "react";
import { motion, useScroll, useTransform, useSpring } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { CinematicVideo, ScrollRevealText } from "@/components/landing/CinematicVideo";
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
  Smartphone,
  CheckCircle2,
  ArrowDown,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Wedding Budget IL — מחשבון תקציב חתונה לישראל 2025" },
      {
        name: "description",
        content:
          "מחשבון תקציב חתונה ישראלי מלא — מחירי שוק 2025, חישוב רווח מהמעטפות, וניהול הוצאות. תכננו חתונה בלי הפתעות.",
      },
      { property: "og:title", content: "Wedding Budget IL — תכנון תקציב חתונה חכם" },
      {
        property: "og:description",
        content: "הדרך הפשוטה לתכנן חתונה בישראל — מחירים אמיתיים וחישוב רווח מהמעטפות בזמן אמת.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { session } = useAuth();
  const ctaTo = session ? "/dashboard" : "/register";

  // Global progress bar
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 100, damping: 30, restDelta: 0.001 });

  return (
    <div dir="rtl" className="bg-background text-foreground">
      {/* Progress bar */}
      <motion.div
        style={{ scaleX }}
        className="fixed inset-x-0 top-0 z-50 h-0.5 origin-right bg-gradient-to-l from-rose via-gold to-rose"
      />

      {/* Nav */}
      <header className="fixed inset-x-0 top-0 z-40 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6">
          <Link to="/" className="font-display text-lg drop-shadow">💍 Wedding Budget IL</Link>
          <nav className="flex items-center gap-2 text-sm">
            {session ? (
              <Link to="/dashboard" className="rounded-full bg-rose px-4 py-1.5 text-primary-foreground shadow-lg shadow-rose/40 hover:bg-primary-deep">למחשבון</Link>
            ) : (
              <>
                <Link to="/login" className="rounded-full px-3 py-1.5 text-foreground/90 hover:bg-card/80">התחבר</Link>
                <Link to="/register" className="rounded-full bg-rose px-4 py-1.5 text-primary-foreground shadow-lg shadow-rose/40 hover:bg-primary-deep">התחל בחינם</Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <HeroPin videoUrl={videoIntro.url} ctaTo={ctaTo} session={!!session} />
      <CinematicScene
        videoUrl={videoMarket.url}
        eyebrow="🛒 שוק ישראלי 2025"
        title="50+ הוצאות מוכנות"
        tag="אולם · צילום · DJ · פרחים"
        body="כל מה שצריך לחתונה ישראלית — מחירי 2025 מעודכנים, מוכנים לייבוא בלחיצה."
      />
      <CinematicScene
        videoUrl={videoEnvelopes.url}
        eyebrow="💸 הפיצ׳ר הסודי"
        title='רווח מהמעטפות'
        tag="חישוב בזמן אמת"
        body="הזינו אורחים ומחיר מעטפה ממוצע — וראו מיד האם תצאו ברווח או בהפסד."
        flip
        accent
      />
      <CinematicScene
        videoUrl={videoAdmin.url}
        eyebrow="👥 למפיקי אירועים"
        title="פאנל ניהול"
        tag="כל הלקוחות במקום אחד"
        body="נהלו תקציבים, משתמשים, והזמנות — הכל מפאנל אחד נקי."
      />

      <FeaturesGrid />
      <FinalCTA ctaTo={ctaTo} session={!!session} videoUrl={videoIntro.url} />

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        <p>💍 Wedding Budget IL · נבנה באהבה לזוגות הישראלים</p>
      </footer>
    </div>
  );
}

/* ---------- Hero with pinned cinematic intro ---------- */
function HeroPin({ videoUrl, ctaTo, session }: { videoUrl: string; ctaTo: string; session: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const scale = useTransform(scrollYProgress, [0, 1], [1, 1.4]);
  const overlayOpacity = useTransform(scrollYProgress, [0, 1], [0.55, 0.95]);
  const y = useTransform(scrollYProgress, [0, 1], [0, -120]);
  const textY = useTransform(scrollYProgress, [0, 1], [0, 200]);
  const textOpacity = useTransform(scrollYProgress, [0, 0.6], [1, 0]);

  return (
    <section ref={ref} className="relative h-[140vh]">
      <div className="sticky top-0 h-screen overflow-hidden">
        <motion.div style={{ scale, y }} className="absolute inset-0">
          <video
            src={videoUrl}
            autoPlay
            muted
            playsInline
            loop
            className="h-full w-full object-cover"
          />
        </motion.div>
        <motion.div
          style={{ opacity: overlayOpacity }}
          className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/70 to-background"
        />

        <motion.div
          style={{ y: textY, opacity: textOpacity }}
          className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center"
        >
          <motion.span
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="inline-flex items-center gap-1.5 rounded-full bg-gold/20 px-4 py-1.5 text-xs font-medium ring-1 ring-gold/40 backdrop-blur"
          >
            <Sparkles size={14} /> חדש בישראל 2025
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.15 }}
            className="mt-6 font-display text-5xl leading-[1.05] md:text-7xl lg:text-8xl"
          >
            תכננו חתונה
            <br />
            <span className="bg-gradient-to-l from-rose via-gold to-rose bg-clip-text text-transparent">
              בלי הפתעות
            </span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.4 }}
            className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground md:text-lg"
          >
            המחשבון היחיד בישראל שמראה לכם בזמן אמת —{" "}
            <strong className="text-foreground">תצאו ברווח, או בהפסד?</strong>
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <Link
              to={ctaTo}
              className="group inline-flex items-center justify-center gap-2 rounded-full bg-rose px-7 py-3.5 text-base font-medium text-primary-foreground shadow-2xl shadow-rose/40 transition-all hover:scale-105 hover:bg-primary-deep"
            >
              <Calculator size={18} /> {session ? "פתח מחשבון" : "התחל בחינם — 60 שניות"}
            </Link>
          </motion.div>
          <motion.div
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute bottom-10 flex flex-col items-center gap-1 text-xs text-muted-foreground"
          >
            גלול לעוד <ArrowDown size={14} />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

/* ---------- Cinematic story scene with pinned video ---------- */
function CinematicScene({
  videoUrl,
  eyebrow,
  title,
  tag,
  body,
  flip,
  accent,
}: {
  videoUrl: string;
  eyebrow: string;
  title: string;
  tag: string;
  body: string;
  flip?: boolean;
  accent?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });

  const videoScale = useTransform(scrollYProgress, [0, 0.5, 1], [0.7, 1, 1.1]);
  const videoY = useTransform(scrollYProgress, [0, 1], [120, -120]);
  const videoRotate = useTransform(scrollYProgress, [0, 1], flip ? [6, -6] : [-6, 6]);

  const textY = useTransform(scrollYProgress, [0, 1], [80, -80]);
  const tagOpacity = useTransform(scrollYProgress, [0.1, 0.4], [0, 1]);
  const textProgress = useTransform(scrollYProgress, [0.2, 0.7], [0, 1]);

  return (
    <section
      ref={ref}
      className={`relative overflow-hidden border-t border-border py-32 md:py-48 ${
        accent ? "bg-gradient-to-br from-rose/10 via-background to-gold/10" : ""
      }`}
    >
      {/* glow */}
      <motion.div
        style={{ opacity: useTransform(scrollYProgress, [0, 0.5, 1], [0, 0.6, 0]) }}
        className="pointer-events-none absolute inset-0 -z-10"
      >
        <div className="absolute left-1/2 top-1/2 size-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-rose/20 blur-3xl" />
      </motion.div>

      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div
          className={`grid items-center gap-12 md:grid-cols-2 ${
            flip ? "md:[&>*:first-child]:order-2" : ""
          }`}
        >
          <motion.div style={{ y: textY }}>
            <motion.span
              style={{ opacity: tagOpacity }}
              className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-xs font-medium ring-1 ring-border"
            >
              {eyebrow}
            </motion.span>
            <h2 className="mt-5 font-display text-4xl leading-tight md:text-6xl">
              <ScrollRevealText text={title} progress={textProgress} />
            </h2>
            <p className="mt-3 text-sm font-medium uppercase tracking-widest text-rose">{tag}</p>
            <p className="mt-6 text-base leading-relaxed text-muted-foreground md:text-lg">{body}</p>
          </motion.div>

          <motion.div
            style={{ scale: videoScale, y: videoY, rotate: videoRotate }}
            className="relative aspect-[4/5] overflow-hidden rounded-[2rem] shadow-[0_30px_80px_-20px_rgba(225,29,72,0.35)] ring-1 ring-foreground/10"
          >
            <CinematicVideo
              src={videoUrl}
              className="absolute inset-0 h-full w-full"
              scale={[1.2, 1]}
              y={[-30, 30]}
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-rose/20 via-transparent to-gold/20" />
            <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/10" />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Features grid with stagger ---------- */
function FeaturesGrid() {
  const items = [
    { icon: <Wallet />, title: "מחירי שוק אמיתיים", desc: "50+ הוצאות עם מחירי 2025." },
    { icon: <Calculator />, title: "חישוב חי", desc: "כל שינוי מעדכן עלות לאורח מיד." },
    { icon: <Sparkles />, title: "רווח מהמעטפות", desc: "הפיצ׳ר הייחודי בישראל." },
    { icon: <Users />, title: "לאדמינים", desc: "פאנל ניהול לקוחות מתקדם." },
    { icon: <Smartphone />, title: "בכל מכשיר", desc: "RTL מלא, מובייל ודסקטופ." },
    { icon: <ShieldCheck />, title: "מאובטח", desc: "נתונים מוצפנים בענן." },
  ];
  return (
    <section className="border-t border-border py-24">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-2xl text-center"
        >
          <h2 className="font-display text-4xl md:text-5xl">כל הכלים. במקום אחד.</h2>
          <p className="mt-3 text-muted-foreground">פיצ׳רים לזוג הישראלי המודרני.</p>
        </motion.div>

        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {items.map((it, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="group relative overflow-hidden rounded-2xl border border-border bg-card p-6 transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-rose/10"
            >
              <div className="absolute -right-10 -top-10 size-32 rounded-full bg-rose/5 transition-all group-hover:bg-rose/15" />
              <div className="relative mb-4 inline-flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-rose/20 to-gold/20 text-foreground ring-1 ring-border">
                {it.icon}
              </div>
              <h3 className="relative font-display text-xl">{it.title}</h3>
              <p className="relative mt-2 text-sm text-muted-foreground">{it.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Final CTA with parallax video ---------- */
function FinalCTA({ ctaTo, session, videoUrl }: { ctaTo: string; session: boolean; videoUrl: string }) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const scale = useTransform(scrollYProgress, [0, 1], [1.2, 0.95]);
  const y = useTransform(scrollYProgress, [0, 1], [60, -60]);

  return (
    <section ref={ref} className="relative overflow-hidden border-t border-border py-32">
      <motion.div style={{ scale, y }} className="absolute inset-0 -z-10">
        <video src={videoUrl} muted autoPlay loop playsInline className="h-full w-full object-cover opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/85 to-background" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
        className="mx-auto max-w-3xl px-4 text-center md:px-6"
      >
        <h2 className="font-display text-5xl leading-tight md:text-7xl">
          התקציב שלכם.
          <br />
          <span className="bg-gradient-to-l from-rose via-gold to-rose bg-clip-text text-transparent">
            השליטה שלכם.
          </span>
        </h2>
        <p className="mt-6 text-lg text-muted-foreground">60 שניות הרשמה. אפס כרטיס אשראי.</p>
        <Link
          to={ctaTo}
          className="mt-10 inline-flex items-center justify-center gap-2 rounded-full bg-rose px-10 py-5 text-lg font-medium text-primary-foreground shadow-2xl shadow-rose/40 transition-all hover:scale-105 hover:bg-primary-deep"
        >
          <Calculator size={20} /> {session ? "פתח את המחשבון" : "התחל עכשיו — בחינם"}
        </Link>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><CheckCircle2 size={14} className="text-success" /> ללא כרטיס אשראי</span>
          <span className="inline-flex items-center gap-1"><CheckCircle2 size={14} className="text-success" /> נתונים בענן</span>
          <span className="inline-flex items-center gap-1"><CheckCircle2 size={14} className="text-success" /> עברית מלאה</span>
        </div>
      </motion.div>
    </section>
  );
}
