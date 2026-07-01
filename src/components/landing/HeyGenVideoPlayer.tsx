
import { useState } from "react";
import { Play } from "lucide-react";

type Video = {
  id: string;
  title: string;
  description: string;
  emoji: string;
  /** HeyGen video URL — replace with actual avatar video when generated */
  src?: string;
  poster?: string;
};

interface Props {
  video: Video;
}

export function HeyGenVideoPlayer({ video }: Props) {
  const [playing, setPlaying] = useState(false);
  const hasVideo = Boolean(video.src);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
      <div className="relative aspect-video w-full bg-gradient-to-br from-rose/20 via-accent to-gold/20">
        {hasVideo && playing ? (
          <video
            src={video.src}
            poster={video.poster}
            controls
            autoPlay
            className="h-full w-full object-cover"
          />
        ) : (
          <button
            type="button"
            onClick={() => hasVideo && setPlaying(true)}
            className="group relative flex h-full w-full items-center justify-center"
            aria-label={`הפעל סרטון: ${video.title}`}
          >
            {video.poster && (
              <img
                src={video.poster}
                alt=""
                className="absolute inset-0 h-full w-full object-cover opacity-80"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-foreground/40 via-transparent to-transparent" />
            <div className="relative flex flex-col items-center gap-3 text-center">
              <div className="text-6xl drop-shadow-md">{video.emoji}</div>
              <div className="flex size-16 items-center justify-center rounded-full bg-rose text-primary-foreground shadow-xl transition-transform group-hover:scale-110">
                <Play size={28} className="ms-1 fill-current" />
              </div>
              {!hasVideo && (
                <span className="rounded-full bg-card/90 px-3 py-1 text-[11px] font-medium text-muted-foreground ring-1 ring-border">
                  סרטון אווטר בקרוב 🎬
                </span>
              )}
            </div>
          </button>
        )}
      </div>
      <div className="p-5">
        <h3 className="font-display text-lg text-foreground">{video.title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{video.description}</p>
      </div>
    </div>
  );
}

export const LANDING_VIDEOS: Video[] = [
  {
    id: "intro",
    emoji: "💍",
    title: "מה זה Wedding Budget IL?",
    description: "סיור קצר במוצר — איך מתכננים תקציב חתונה חכם בלי הפתעות.",
  },
  {
    id: "market",
    emoji: "🛒",
    title: "הוצאות מהשוק הישראלי 2025",
    description: "ספרייה מלאה של מחירים אמיתיים — אולמות, צילום, DJ, פרחים ועוד.",
  },
  {
    id: "envelopes",
    emoji: "💸",
    title: 'הפיצ׳ר הסודי: "רווח מהמעטפות"',
    description: "מחשבים בזמן אמת כמה תרוויחו (או תפסידו) מהמתנות של האורחים.",
  },
  {
    id: "admin",
    emoji: "👥",
    title: "ניהול משתמשים ואירועים",
    description: "מערכת מלאה למפיקי אירועים — לראות, לערוך ולנהל את כל הלקוחות במקום אחד.",
  },
];
