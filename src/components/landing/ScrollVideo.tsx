import { useEffect, useRef, useState } from "react";

interface Props {
  src: string;
  poster?: string;
  className?: string;
  /** When true, video plays without controls and loops, like a background reel */
  ambient?: boolean;
}

/**
 * Auto-plays a muted video when scrolled into view; pauses when out of view.
 * Saves bandwidth and feels alive as users scroll through the landing page.
 */
export function ScrollVideo({ src, poster, className = "", ambient = false }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        setVisible(entry.isIntersecting);
        if (entry.isIntersecting) {
          el.play().catch(() => {});
        } else {
          el.pause();
        }
      },
      { threshold: 0.35 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <video
      ref={ref}
      src={src}
      poster={poster}
      muted
      playsInline
      loop
      preload="metadata"
      controls={!ambient}
      className={`h-full w-full object-cover transition-opacity duration-700 ${
        visible ? "opacity-100" : "opacity-90"
      } ${className}`}
    />
  );
}
