import { motion } from 'framer-motion';
import { useEffect, useId, useRef, useState } from 'react';
import { formatRelative } from '../../shared/time';
import type { Pause } from '../../shared/types';
import { Button } from './ui';

/**
 * "Where I stopped / what's next": the reason the app exists. When it's the first thing the
 * user sees on opening a paused project it slides in gently and takes focus, so returning to
 * the project is one keypress.
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
      className="rounded-lg border-l-[3px] border-status-paused bg-sunken py-3.5 pr-4 pl-4"
      initial={emphasize ? { opacity: 0, y: -6 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 id={headingId} className="text-[13px] font-semibold text-ink">
          Pick up where you left off
        </h3>
        <p className="text-xs text-muted">
          Paused{' '}
          <time dateTime={new Date(pause.pausedAt).toISOString()}>
            {formatRelative(pause.pausedAt, now)}
          </time>
        </p>
      </div>

      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <ResumeLine label="Where you stopped" value={pause.whereIStopped} />
        <ResumeLine label="Next step" value={pause.nextStep} />
      </dl>

      <div ref={actionsRef} className="mt-3.5 flex justify-end">
        <Button onClick={() => void resume()} disabled={busy}>
          {busy ? 'Resuming…' : 'Resume'}
        </Button>
      </div>
    </motion.section>
  );
}

function ResumeLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd
        className={`selectable mt-0.5 text-sm leading-relaxed whitespace-pre-wrap ${value.trim() ? 'text-ink' : 'italic text-muted'}`}
      >
        {value.trim() || 'No note'}
      </dd>
    </div>
  );
}
