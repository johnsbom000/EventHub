import { motion, useReducedMotion, type Variants } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";

/* ---------------------------------------------------------------------------
   Shared motion primitives for the free-first landing variants.

   Design intent: "high-end" = restraint. A few slow, soft, well-staged moves
   on a single easing curve — not a page that twitches. Everything here degrades
   to instant/static under `prefers-reduced-motion` (honored via useReducedMotion).

   Currently wired into Direction A only as a prototype; once the timing is
   approved these wrappers move into the shared sections so A–E all inherit them.
--------------------------------------------------------------------------- */

// The "expensive" curve — a soft easeOutExpo. Slow settle, no bounce.
export const EASE = [0.22, 1, 0.36, 1] as const;

// Child of a `stagger` container: rise + fade.
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
};

// Headline variant — adds a subtle blur-in for an editorial feel.
export const fadeUpBlur: Variants = {
  hidden: { opacity: 0, y: 22, filter: "blur(10px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.85, ease: EASE } },
};

// Container that cascades its motion children.
export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};

/**
 * Scroll-triggered reveal. Content fades up as it enters the viewport, once.
 *
 * Deliberately NOT using framer's `whileInView`: for tall full-bleed sections it
 * skips elements on fast/jump scrolls and strands them at opacity 0 forever. This
 * measures the element's live position on mount + on scroll, so nothing is ever
 * left hidden — and it falls back to visible under reduced motion or if the ref
 * never attaches. Once shown, it detaches its listener.
 */
export function Reveal({
  children,
  className,
  y = 20,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  y?: number;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (reduced) {
      setShown(true);
      return;
    }
    const el = ref.current;
    if (!el) {
      setShown(true);
      return;
    }
    // Reveal once any part of the element enters the viewport.
    const check = () => {
      if (el.getBoundingClientRect().top < window.innerHeight) {
        setShown(true);
        return true;
      }
      return false;
    };
    if (check()) return; // already in view on mount (above-the-fold section)
    const onScroll = () => {
      if (check()) cleanup();
    };
    // Safety net: guarantee the content is never left invisible if a fast/jump
    // scroll skips past it before a scroll sample fires. Sections reached later
    // are simply already-visible when the user arrives (they're off-screen, so
    // there's no visible pop).
    const timer = window.setTimeout(() => setShown(true), 1200);
    const cleanup = () => {
      window.removeEventListener("scroll", onScroll);
      window.clearTimeout(timer);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return cleanup;
  }, [reduced]);

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={false}
      animate={{ opacity: shown ? 1 : 0, y: shown || reduced ? 0 : y }}
      transition={reduced ? { duration: 0 } : { duration: 0.7, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}
