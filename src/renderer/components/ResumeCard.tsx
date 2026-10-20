import { motion } from 'framer-motion';
import { useEffect, useId, useRef, useState } from 'react';
import { formatRelative } from '../../shared/time';
import type { Pause } from '../../shared/types';
import { formatReminder, gitContextFiles, gitContextLine } from './pause-note';
import { Button } from './ui';

/**
 * "Where I stopped / what's next": the reason the app exists. When it's the first thing the
 * user sees on opening a paused project it slides in gently and takes focus, so returning to
 * the project is one keypress. With a folder, that keypress is "Pick up": resume and open
 * everything; "Resume" only changes the status.
 */
export function ResumeCard({
  pause,
  now,
  onResume,
  onPickUp,
  emphasize,
}: {
  pause: Pause;
  now: number;
  onResume: () => Promise<void>;
  /** Only for projects with a folder. */
  onPickUp?: () => Promise<void>;
  emphasize: boolean;
}) {
  // Button doesn't forward refs, so focus goes through its wrapper.
  const actionsRef = useRef<HTMLDivElement>(null);
  const headingId = useId();
  const [busy, setBusy] = useState<'resume' | 'pickUp' | null>(null);

  useEffect(() => {
    if (!emphasize) return;
    const actions = actionsRef.current;
    (
      actions?.querySelector<HTMLButtonElement>('[data-primary]') ??
      actions?.querySelector('button')
    )?.focus();
  }, [emphasize]);

  const run = async (kind: 'resume' | 'pickUp', action: () => Promise<void>) => {
    setBusy(kind);
    try {
      await action();
    } finally {
      setBusy(null);
    }
  };

  const context = pause.gitContext;
  const files = context ? gitContextFiles(context) : null;

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

      {context ? (
        <p className="mt-3 text-xs leading-relaxed text-muted">
          {gitContextLine(context)}
          {files ? (
            <span className="selectable block truncate" title={files}>
              {files}
            </span>
          ) : null}
        </p>
      ) : null}

      <div ref={actionsRef} className="mt-3.5 flex items-center justify-end gap-2">
        {pause.remindAt !== null ? (
          <p className="mr-auto text-xs text-muted">
            Reminder{' '}
            <time dateTime={new Date(pause.remindAt).toISOString()}>
              {formatReminder(pause.remindAt)}
            </time>
          </p>
        ) : null}
        <Button onClick={() => void run('resume', onResume)} disabled={busy !== null}>
          {busy === 'resume' ? 'Resuming…' : 'Resume'}
        </Button>
        {onPickUp ? (
          <Button
            variant="primary"
            data-primary
            onClick={() => void run('pickUp', onPickUp)}
            disabled={busy !== null}
          >
            {busy === 'pickUp' ? 'Opening…' : 'Pick up'}
          </Button>
        ) : null}
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
