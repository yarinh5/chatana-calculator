import { useEffect, useRef } from "react";
import { motion, useScroll, useTransform, MotionValue } from "framer-motion";

interface Props {
  src: string;
  className?: string;
  scale?: [number, number];
  y?: [number, number];
  rotate?: [number, number];
  /** Use parent scroll target instead of self */
  scrollTarget?: React.RefObject<HTMLElement | null>;
}

/**
 * Video that auto-plays muted in view and applies cinematic scroll-driven
 * transforms (scale, parallax, rotate). Use inside a positioned parent.
 */
export function CinematicVideo({
  src,
  className = "",
  scale = [1.15, 1],
  y = [-60, 60],
  rotate = [0, 0],
  scrollTarget,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: scrollTarget ?? containerRef,
    offset: ["start end", "end start"],
  });

  const scaleV = useTransform(scrollYProgress, [0, 1], scale);
  const yV = useTransform(scrollYProgress, [0, 1], y);
  const rotateV = useTransform(scrollYProgress, [0, 1], rotate);
  const opacityV = useTransform(scrollYProgress, [0, 0.15, 0.85, 1], [0.4, 1, 1, 0.5]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) el.play().catch(() => {});
        else el.pause();
      },
      { threshold: 0.2 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <motion.div
      ref={containerRef}
      style={{ scale: scaleV, y: yV, rotate: rotateV, opacity: opacityV }}
      className={`relative overflow-hidden ${className}`}
    >
      <video
        ref={videoRef}
        src={src}
        muted
        playsInline
        loop
        preload="metadata"
        className="h-full w-full object-cover"
      />
    </motion.div>
  );
}

/** Word-by-word reveal driven by scroll */
export function ScrollRevealText({
  text,
  progress,
  className = "",
}: {
  text: string;
  progress: MotionValue<number>;
  className?: string;
}) {
  const words = text.split(" ");
  return (
    <span className={className}>
      {words.map((w, i) => (
        <ScrollWord key={i} word={w} progress={progress} index={i} total={words.length} />
      ))}
    </span>
  );
}

function ScrollWord({
  word,
  progress,
  index,
  total,
}: {
  word: string;
  progress: MotionValue<number>;
  index: number;
  total: number;
}) {
  const start = index / total;
  const end = (index + 1) / total;
  const opacity = useTransform(progress, [start, end], [0.15, 1]);
  return (
    <motion.span style={{ opacity }} className="inline-block">
      {word}&nbsp;
    </motion.span>
  );
}
