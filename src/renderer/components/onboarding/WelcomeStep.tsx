// Step 1: a centred welcome in the style of a setup assistant. A short fade brings the logo,
// title and button in; with the intro finished (or skipped, or reduced motion) everything
// renders in its final state at once.
import { motion, type TargetAndTransition } from 'framer-motion';
import { Button } from '../ui';

/** Total length of the intro fade; after this the intro can no longer be "skipped". */
export const INTRO_MS = 700;

/** A simple flame drawn in the accent colour: the app's mark. */
function FlameMark() {
  return (
    // Same mark as the app icon (scripts/make-icon.cjs).
    <svg aria-hidden viewBox="100 100 824 824" className="h-16 w-16 drop-shadow-sm">
      <rect
        x="102"
        y="102"
        width="820"
        height="820"
        rx="185"
        fill="var(--surface)"
        stroke="var(--line-strong)"
        strokeWidth="4"
      />
      <path
        d="M512 228 C 540 330 700 420 700 572 A 188 188 0 0 1 324 572 C 324 488 370 436 408 396 C 416 448 440 486 478 504 C 470 410 480 300 512 228 Z"
        fill="var(--accent)"
      />
      <path
        d="M520 470 C 538 528 612 560 612 628 A 100 100 0 0 1 412 628 C 412 590 432 566 452 548 C 458 574 470 590 490 598 C 486 552 496 506 520 470 Z"
        fill="#f6a066"
      />
      <rect x="352" y="792" width="320" height="34" rx="17" fill="var(--accent)" opacity="0.4" />
    </svg>
  );
}

export function WelcomeStep({
  introDone,
  reduce,
  onStart,
}: {
  introDone: boolean;
  reduce: boolean;
  onStart: () => void;
}) {
  /** Fade/slide-in props for one intro element, or nothing once the intro is over. */
  const reveal = (delay: number, from: TargetAndTransition = { opacity: 0, y: reduce ? 0 : 6 }) =>
    introDone
      ? { initial: false as const }
      : {
          initial: from,
          animate: { opacity: 1, y: 0 },
          transition: { delay, duration: 0.3, ease: 'easeOut' as const },
        };

  return (
    <section
      aria-labelledby="onboarding-welcome-title"
      className="flex min-h-full flex-col items-center justify-center gap-8 pb-16 text-center"
    >
      <motion.div key={`mark-${introDone}`} {...reveal(0)}>
        <FlameMark />
      </motion.div>

      <div className="flex flex-col items-center gap-3">
        <motion.h1
          key={`title-${introDone}`}
          id="onboarding-welcome-title"
          className="text-3xl font-semibold tracking-tight text-ink"
          {...reveal(0.08)}
        >
          Welcome to Stokebay
        </motion.h1>
        <motion.p
          key={`line-${introDone}`}
          className="max-w-md text-[15px] leading-relaxed text-muted"
          {...reveal(0.16)}
        >
          Keep every project you care about in one place, and pick up where you left off. Everything
          stays on this computer.
        </motion.p>
      </div>

      <motion.div
        key={`cta-${introDone}`}
        className="flex flex-col items-center gap-3"
        {...reveal(0.28)}
      >
        {/* The wrapper remounts when the intro ends, so this focuses the button then. During the
            intro focus stays on the setup screen so the first key press only skips it. */}
        <Button autoFocus={introDone} variant="primary" onClick={onStart} className="min-w-36">
          Get started
        </Button>
        <p className="text-xs text-muted">Three quick steps, under a minute.</p>
      </motion.div>
    </section>
  );
}
