import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

export function HeroVideoTreatment() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    // Check for reduced motion preference
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let hideTimer: number | undefined;
    
    // Show splash immediately on mount for a full-screen impact
    setActive(true);
    hideTimer = window.setTimeout(() => setActive(false), 10000);

    // Set up interval to repeat the splash every 30 seconds
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      
      // Clear any existing hide timer before showing again
      if (hideTimer !== undefined) window.clearTimeout(hideTimer);
      
      setActive(true);
      hideTimer = window.setTimeout(() => setActive(false), 10000);
    }, 30000);

    return () => {
      window.clearInterval(interval);
      if (hideTimer !== undefined) window.clearTimeout(hideTimer);
    };
  }, []);

  return (
    <div 
      aria-hidden="true" 
      className="pointer-events-none fixed inset-0 z-[1] overflow-hidden"
    >
      <AnimatePresence initial={false}>
        {active && (
          <>
            {/* Primary colorful wash - full screen */}
            <motion.div
              className="absolute inset-0 mix-blend-screen"
              style={{
                background: [
                  "radial-gradient(ellipse at 16% 26%, rgba(251,146,60,.55), transparent 50%)",
                  "radial-gradient(ellipse at 76% 18%, rgba(217,70,239,.45), transparent 52%)",
                  "radial-gradient(ellipse at 78% 84%, rgba(56,189,248,.45), transparent 54%)",
                  "radial-gradient(ellipse at 24% 76%, rgba(45,212,191,.4), transparent 50%)",
                  "linear-gradient(115deg, rgba(251,146,60,.15), rgba(217,70,239,.25), rgba(56,189,248,.18))",
                ].join(", "),
              }}
              initial={{ opacity: 0, scale: 1 }}
              animate={{ 
                opacity: [0, 0.95, 0.85, 0.9, 0.75, 0],
                scale: [1, 1.04, 1.08, 1.03, 1.06, 1],
                rotate: [0, 1, -1, 0.5, 0],
              }}
              exit={{ opacity: 0, transition: { duration: 0.4, ease: "easeOut" } }}
              transition={{ 
                duration: 10, 
                ease: "easeInOut",
                times: [0, 0.15, 0.35, 0.55, 0.8, 1]
              }}
            />

            {/* Secondary accent wash - full screen with different timing */}
            <motion.div
              className="absolute inset-0 mix-blend-screen"
              style={{
                background: [
                  "radial-gradient(ellipse at 22% 86%, rgba(129,140,248,.45), transparent 52%)",
                  "radial-gradient(ellipse at 86% 44%, rgba(45,212,191,.42), transparent 50%)",
                  "radial-gradient(ellipse at 12% 18%, rgba(251,191,36,.38), transparent 48%)",
                  "radial-gradient(ellipse at 92% 92%, rgba(236,72,153,.4), transparent 50%)",
                  "linear-gradient(30deg, rgba(129,140,248,.12), transparent 46%, rgba(45,212,191,.15))",
                ].join(", "),
              }}
              initial={{ opacity: 0, scale: 1.04 }}
              animate={{ 
                opacity: [0, 0.85, 0.75, 0.88, 0.7, 0],
                scale: [1.06, 1, 1.08, 1.02, 1.05, 1],
                rotate: [0, -0.5, 0.8, -0.3, 0],
              }}
              exit={{ opacity: 0, transition: { duration: 0.4, ease: "easeOut" } }}
              transition={{ 
                duration: 10, 
                ease: "easeInOut",
                times: [0, 0.2, 0.4, 0.6, 0.85, 1]
              }}
            />

            {/* Subtle grain/noise overlay for modern texture */}
            <motion.div
              className="absolute inset-0 opacity-[0.03] mix-blend-overlay"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
                backgroundSize: "200px 200px",
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.04, 0.03, 0.04, 0] }}
              exit={{ opacity: 0, transition: { duration: 0.4 } }}
              transition={{ duration: 10, ease: "easeInOut" }}
            />

            {/* Soft vignette for depth */}
            <motion.div
              className="absolute inset-0"
              style={{
                background: "radial-gradient(circle at center, transparent 40%, rgba(0,0,0,0.15) 100%)",
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.6, 0.5, 0.55, 0] }}
              exit={{ opacity: 0, transition: { duration: 0.4 } }}
              transition={{ duration: 10, ease: "easeInOut" }}
            />
          </>
        )}
      </AnimatePresence>
    </div>
  );
}