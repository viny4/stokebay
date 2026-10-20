import { motion } from 'framer-motion';
import { useEffect, useId, useRef, useState } from 'react';
import { formatRelative } from '../../shared/time';
import type { Pause } from '../../shared/types';
import { Button } from './ui';

// Filters, not box-shadows, so the glow follows the card's cut corners.
const AMBER_GLOW = 'drop-shadow(0px 0px 16px rgb(251 191 36 / 0.6))';
const RESTING = 'drop-shadow(0px 0px 6px rgb(251 191 36 / 0.3))';
// Trailing `!` wins over Button's ghost colours regardless of stylesheet order.
const AMBER_BUTTON =
  'border-status-paused/60! bg-status-paused/15! text-status-paused! hover:bg-status-paused/25!';

/**
 * "Where I stopped / what's next": the reason the app exists. When it's the first thing the
 * user sees on opening a paused project it pulses once and takes focus, so returning to the
 * project is one keypress.
 */
export function ResumeCard({
  pause,
  now,
  onResume,
  emphasize,
}: {
  pause: Pause;
  now: number;
  onResume: () => Promise<void>;
  emphasize: boolean;
}) {
  // Button doesn't forward refs, so focus goes through its wrapper.
  const actionsRef = useRef<HTMLDivElement>(null);
  const headingId = useId();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (emphasize) actionsRef.current?.querySelector('button')?.focus();
  }, [emphasize]);

  const resume = async () => {
    setBusy(true);
    try {
      await onResume();
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.section
      aria-labelledby={headingId}
      className="hud-frame p-4"
      style={
        {
          '--frame-color': 'rgb(251 191 36 / 0.6)',
          // Opaque: a see-through fill lets the amber border layer tint the whole card.
          '--frame-fill': 'rgb(26 20 9)',
        } as React.CSSProperties
      }
      initial={emphasize ? { opacity: 0, y: -6, filter: RESTING } : false}
      animate={{
        opacity: 1,
        y: 0,
        filter: emphasize ? [RESTING, AMBER_GLOW, RESTING, AMBER_GLOW, RESTING] : RESTING,
      }}
      transition={{ duration: emphasize ? 1.6 : 0.2, ease: 'easeInOut' }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3
          id={headingId}
          className="font-display text-xs tracking-[0.25em] text-status-paused uppercase"
        >
          Resume
        </h3>
        <p className="font-hud text-xs text-hud-muted">
          Paused{' '}
          <time dateTime={new Date(pause.pausedAt).toISOString()}>
            {formatRelative(pause.pausedAt, now)}
          </time>
        </p>
      </div>

      <dl className="mt-3 space-y-3">
        <ResumeLine label="Where I stopped" value={pause.whereIStopped} />
        <ResumeLine label="Next step" value={pause.nextStep} />
      </dl>

      <div ref={actionsRef} className="mt-4 flex justify-end">
        <Button onClick={() => void resume()} disabled={busy} className={AMBER_BUTTON}>
          {busy ? 'Resuming…' : 'Resume'}
        </Button>
      </div>
    </motion.section>
  );
}

function ResumeLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-widest text-hud-muted">{label}</dt>
      <dd
        className={`mt-0.5 text-sm whitespace-pre-wrap ${value.trim() ? 'text-hud-text' : 'italic text-hud-muted'}`}
      >
        {value.trim() || 'No note'}
      </dd>
    </div>
  );
}
