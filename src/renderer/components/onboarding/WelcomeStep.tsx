// Step 1: the app name powers up over the blueprint grid, a few boot lines report that
// everything is local, then "Get started". With the intro finished (or skipped, or reduced
// motion) every element renders in its final state at once.
import { motion, type TargetAndTransition } from 'framer-motion';
import { Button } from '../ui';

/** Total length of the power-up; after this the intro can no longer be "skipped". */
export const INTRO_MS = 1900;

const BOOT_LINES: { label: string; value: string }[] = [
  { label: 'Local storage', value: 'ready' },
  { label: 'Network', value: 'off' },
  { label: 'Projects', value: 'awaiting input' },
];

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
  const reveal = (delay: number, from: TargetAndTransition = { opacity: 0, y: 8 }) =>
    introDone
      ? { initial: false as const }
      : {
          initial: from,
          animate: { opacity: 1, y: 0, scale: 1, scaleX: 1 },
          transition: { delay, duration: 0.4, ease: 'easeOut' as const },
        };

  // Flicker is an opacity effect, which MotionConfig's reducedMotion doesn't remove, so
  // reduced-motion users get a plain fade instead.
  const titleIntro = introDone
    ? { initial: false as const }
    : {
        initial: { opacity: 0, scale: 1.08 },
        animate: { opacity: reduce ? 1 : [0, 1, 0.3, 1, 0.6, 1], scale: 1 },
        transition: { delay: 0.35, duration: 0.7, ease: 'easeOut' as const },
      };

  return (
    <section
      aria-labelledby="onboarding-welcome-title"
      className="flex min-h-full flex-col items-center justify-center gap-6 py-10 text-center"
    >
      <motion.p
        key={`tag-${introDone}`}
        aria-hidden
        className="font-mono text-[11px] tracking-[0.4em] text-hud-muted uppercase"
        {...reveal(0.2)}
      >
        System boot · First run
      </motion.p>

      <div className="flex flex-col items-center gap-3">
        <motion.h1
          key={`title-${introDone}`}
          id="onboarding-welcome-title"
          className="font-display text-4xl font-bold tracking-[0.35em] text-status-active drop-shadow-[0_0_18px_rgb(56_214_255/0.85)] sm:text-6xl"
          {...titleIntro}
        >
          STOKEBAY
        </motion.h1>
        <motion.span
          key={`rule-${introDone}`}
          aria-hidden
          className="h-px w-full max-w-md origin-center bg-[linear-gradient(90deg,transparent,rgb(56_214_255/0.9),transparent)]"
          {...reveal(0.8, { opacity: 0, scaleX: 0 })}
        />
      </div>

      <motion.p
        key={`line-${introDone}`}
        className="max-w-xl font-hud text-xl leading-snug tracking-wide text-hud-text"
        {...reveal(1.0)}
      >
        Every project you have — code, builds, music, ideas — in one place. Nothing leaves your
        computer.
      </motion.p>

      <ul aria-hidden className="flex flex-col gap-1 font-mono text-xs text-hud-muted">
        {BOOT_LINES.map((line, i) => (
          <motion.li
            key={`${line.label}-${introDone}`}
            className="flex w-72 items-baseline gap-2 text-left"
            {...reveal(1.15 + i * 0.12, { opacity: 0, y: 0 })}
          >
            <span className="text-status-active">▸</span>
            <span>{line.label}</span>
            <span className="flex-1 border-b border-dotted border-hud-line" />
            <span className="text-status-done">{line.value}</span>
          </motion.li>
        ))}
      </ul>

      <motion.div
        key={`cta-${introDone}`}
        className="flex flex-col items-center gap-2"
        {...reveal(1.55)}
      >
        {/* The wrapper remounts when the intro ends, so this focuses the button then. During the
            intro focus stays on the setup screen so the first key press only skips it. */}
        <Button
          autoFocus={introDone}
          variant="primary"
          onClick={onStart}
          className="px-8 py-2.5 font-display text-sm tracking-[0.25em] shadow-[0_0_18px_rgb(56_214_255/0.35)]"
        >
          GET STARTED ▸
        </Button>
        <p className="text-xs text-hud-muted">Three quick steps, under a minute.</p>
      </motion.div>

      {introDone ? null : (
        <p className="absolute bottom-6 font-mono text-[11px] tracking-widest text-hud-muted uppercase">
          Press any key or click to skip
        </p>
      )}
    </section>
  );
}
