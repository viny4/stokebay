// The weekly review: a short walk through the projects that have gone quiet, one at a time,
// with honest choices (keep going, pause with a note, mark done, let it go). The point is to
// finish things or drop them on purpose instead of carrying them around half-alive.
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { pauseInput } from '../../shared/schemas';
import {
  EMPTY_OUTCOME,
  outcomeText,
  reviewCandidates,
  type ReviewOutcome,
} from '../../shared/review';
import { daysSince } from '../../shared/time';
import type { Entry, Id, ProjectSummary, World } from '../../shared/types';
import { Button, Field, inputClass, StatusBadge, WorldTag } from '../components/ui';
import { errorMessage, guard, useHud } from '../store/useHud';

type Phase = 'intro' | 'reviewing' | 'finished';

/** Set by the grid banner's "Start" so the review opens on the first card, not the intro. */
let startOnOpen = false;

export function startWeeklyReview(): void {
  startOnOpen = true;
  useHud.getState().setView('review');
}

export function WeeklyReview() {
  const projects = useHud((s) => s.projects);
  const now = useHud((s) => s.now);
  const candidates = useMemo(() => reviewCandidates(projects, now), [projects, now]);

  const [phase, setPhase] = useState<Phase>(() =>
    startOnOpen && candidates.length > 0 ? 'reviewing' : 'intro',
  );
  // Fixed when the review starts: deciding on a project changes the live candidate list.
  const [queue, setQueue] = useState<Id[]>(() => (startOnOpen ? candidates.map((p) => p.id) : []));
  const [index, setIndex] = useState(0);
  const [outcome, setOutcome] = useState<ReviewOutcome>(EMPTY_OUTCOME);

  const start = () => {
    setQueue(candidates.map((p) => p.id));
    setIndex(0);
    setOutcome(EMPTY_OUTCOME);
    setPhase('reviewing');
  };

  const advance = (choice: keyof ReviewOutcome | null) => {
    if (choice) setOutcome((o) => ({ ...o, [choice]: o[choice] + 1 }));
    if (index + 1 >= queue.length) setPhase('finished');
    else setIndex(index + 1);
  };

  useEffect(() => {
    startOnOpen = false;
  }, []);

  const current = phase === 'reviewing' ? projects.find((p) => p.id === queue[index]) : undefined;
  // Deleted mid-review (e.g. sample projects removed): nothing to decide, move on.
  const gone = phase === 'reviewing' && !current;
  useEffect(() => {
    if (gone) advance(null);
  });

  return (
    <section aria-labelledby="review-heading" className="mx-auto max-w-2xl px-8 py-10">
      {phase === 'intro' ? (
        <Intro count={candidates.length} onStart={start} />
      ) : phase === 'finished' ? (
        <Finished outcome={outcome} />
      ) : current ? (
        <>
          <div className="flex items-center gap-3">
            <h2
              id="review-heading"
              className="text-[13px] font-medium text-muted tabular-nums"
              aria-live="polite"
            >
              {index + 1} of {queue.length}
            </h2>
            <div
              aria-hidden
              className="h-1 flex-1 overflow-hidden rounded-full bg-sunken"
              title={`${index + 1} of ${queue.length}`}
            >
              <div
                className="h-full rounded-full bg-accent/70 transition-[width] duration-300"
                style={{ width: `${((index + 1) / queue.length) * 100}%` }}
              />
            </div>
            <button
              type="button"
              onClick={() => setPhase('finished')}
              className="rounded-md px-2 py-1 text-xs text-muted hover:bg-hover hover:text-ink"
            >
              Finish now
            </button>
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={current.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              <ReviewCard project={current} now={now} onDecided={advance} />
            </motion.div>
          </AnimatePresence>
        </>
      ) : null}
    </section>
  );
}

function Intro({ count, onStart }: { count: number; onStart: () => void }) {
  const lastReviewAt = useHud((s) => s.settings.lastReviewAt);
  const last = lastReviewAt ? (
    <p className="mt-6 text-xs text-muted">Last review: {formatDate(lastReviewAt)}</p>
  ) : null;

  if (count === 0) {
    return (
      <>
        <h2 id="review-heading" className="text-3xl font-semibold tracking-tight text-ink">
          Weekly review
        </h2>
        <p className="mt-8 rounded-lg border border-dashed border-line px-6 py-12 text-center text-sm text-muted">
          Nothing to review. Everything you&apos;re working on is moving.
        </p>
        {last}
      </>
    );
  }

  return (
    <>
      <h2 id="review-heading" className="text-3xl font-semibold tracking-tight text-ink">
        Weekly review
      </h2>
      <div className="panel mt-8 flex flex-col items-start gap-4 p-6">
        <p className="text-[15px] text-ink">
          {count === 1 ? '1 project has' : `${count} projects have`} gone quiet.
        </p>
        <p className="max-w-lg text-sm leading-relaxed text-muted">
          Look at each one and decide what it is now: keep going, pause it with a note, call it
          done, or let it go. Choosing on purpose is lighter than carrying everything. It takes
          about two minutes.
        </p>
        <Button autoFocus variant="primary" onClick={onStart}>
          Start
        </Button>
      </div>
      {last}
    </>
  );
}

type Mode = 'choose' | 'pause';

function ReviewCard({
  project,
  now,
  onDecided,
}: {
  project: ProjectSummary;
  now: number;
  onDecided: (choice: keyof ReviewOutcome) => void;
}) {
  const worlds = useHud((s) => s.worlds);
  const openProject = useHud((s) => s.openProject);
  const reviewKeep = useHud((s) => s.reviewKeep);
  const resumeProject = useHud((s) => s.resumeProject);
  const updateProject = useHud((s) => s.updateProject);
  const archiveProject = useHud((s) => s.archiveProject);
  const showToast = useHud((s) => s.showToast);

  const [mode, setMode] = useState<Mode>('choose');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<Entry | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const paused = project.status === 'paused';
  const canPause = project.status === 'active';
  const projectWorlds = project.worldIds.flatMap((id) => worlds.find((w) => w.id === id) ?? []);
  const days = daysSince(project.lastActivityAt, now);

  // A new card is a new question: move focus to it so keyboard and screen reader users follow.
  useEffect(() => headingRef.current?.focus(), []);

  // The newest note reminds the user what this project was about.
  useEffect(() => {
    if (paused) return;
    let live = true;
    window.api
      .getProjectDetail(project.id)
      .then((d) => live && setNote(d.entries.find((e) => e.type === 'note') ?? null))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [project.id, paused]);

  const run = async (choice: keyof ReviewOutcome, action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      onDecided(choice);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const keep = () => run('kept', () => reviewKeep(project.id));
  const resume = () => run('resumed', () => resumeProject(project.id));
  const markDone = () =>
    run('done', async () => {
      // Status can't change while paused, so a paused project is resumed first.
      if (paused) await resumeProject(project.id);
      await updateProject({ id: project.id, patch: { status: 'done' } });
    });
  const letGo = () =>
    run('letGo', async () => {
      await archiveProject(project.id);
      showToast(`${project.title} is in Archived if you ever want it back.`);
    });
  const skip = () => onDecided('skipped');

  useEffect(() => {
    if (mode !== 'choose') return;
    const onKey = (event: KeyboardEvent) => {
      const state = useHud.getState();
      // Leave the keys alone while a dialog or the project panel is open, or while typing.
      if (state.dialog.kind !== 'none' || state.selectedId !== null) return;
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      // A held key must not decide on the next card too.
      if (event.repeat) return;
      const key = event.key.toLowerCase();
      const action =
        key === 'k'
          ? keep
          : key === 'p' && canPause
            ? () => setMode('pause')
            : key === 'r' && paused
              ? resume
              : key === 'd'
                ? markDone
                : key === 'l'
                  ? letGo
                  : key === 's'
                    ? skip
                    : null;
      if (!action) return;
      event.preventDefault();
      void action();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const pause = project.activePause;

  return (
    <article
      aria-labelledby={`review-${project.id}`}
      className="panel mt-4 flex flex-col gap-5 p-6"
    >
      <header className="flex flex-col gap-2">
        <h3 id={`review-${project.id}`} ref={headingRef} tabIndex={-1}>
          <button
            type="button"
            onClick={() => guard(() => openProject(project.id))}
            className="rounded-md text-left text-xl font-semibold tracking-tight text-ink hover:underline focus-visible:outline-2 focus-visible:outline-accent"
            title="Open project"
          >
            {project.title}
          </button>
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={project.status} />
          {projectWorlds.map((w: World) => (
            <WorldTag key={w.id} world={w} />
          ))}
        </div>
        <p className="text-sm text-muted">{lastActivityText(days)}</p>
      </header>

      {paused ? (
        pause && (pause.whereIStopped || pause.nextStep) ? (
          <dl className="flex flex-col gap-3 rounded-lg bg-sunken px-4 py-3 text-sm">
            {pause.whereIStopped ? (
              <div>
                <dt className="text-xs font-medium text-muted">Where I stopped</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-ink">{pause.whereIStopped}</dd>
              </div>
            ) : null}
            {pause.nextStep ? (
              <div>
                <dt className="text-xs font-medium text-muted">Next step</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-ink">{pause.nextStep}</dd>
              </div>
            ) : null}
          </dl>
        ) : (
          <p className="text-sm text-muted">Paused without a note.</p>
        )
      ) : note ? (
        <div className="rounded-lg bg-sunken px-4 py-3 text-sm">
          <p className="text-xs font-medium text-muted">Latest note</p>
          <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-ink">
            {note.title ? `${note.title}: ` : ''}
            {note.body}
          </p>
        </div>
      ) : null}

      {mode === 'pause' ? (
        <PauseForm
          projectId={project.id}
          onCancel={() => setMode('choose')}
          onPaused={() => onDecided('paused')}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Choice shortcut="K" variant="primary" disabled={busy} onClick={keep}>
              {paused ? 'Keep paused' : 'Keep going'}
            </Choice>
            {canPause ? (
              <Choice shortcut="P" disabled={busy} onClick={() => setMode('pause')}>
                Pause with a note
              </Choice>
            ) : paused ? (
              <Choice shortcut="R" disabled={busy} onClick={resume}>
                Resume
              </Choice>
            ) : null}
            <Choice shortcut="D" disabled={busy} onClick={markDone}>
              Mark done
            </Choice>
            <Choice shortcut="L" disabled={busy} onClick={letGo}>
              Let it go
            </Choice>
          </div>
          {/* Skip sits apart from the four decisions: it's "not now", not a choice. */}
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted">
              Letting go moves it to Archived. Nothing is deleted.
            </p>
            <Choice shortcut="S" variant="ghost" disabled={busy} onClick={skip}>
              Skip
            </Choice>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </article>
  );
}

function Choice({
  shortcut,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { shortcut: string }) {
  return (
    <Button aria-keyshortcuts={shortcut} {...props}>
      {children}
      <kbd className="ml-1 font-sans text-[11px] opacity-60">{shortcut}</kbd>
    </Button>
  );
}

/** Inline version of the pause dialog, so pausing doesn't take the user out of the review. */
function PauseForm({
  projectId,
  onCancel,
  onPaused,
}: {
  projectId: Id;
  onCancel: () => void;
  onPaused: () => void;
}) {
  const pauseProject = useHud((s) => s.pauseProject);
  const formId = useId();
  const firstRef = useRef<HTMLTextAreaElement>(null);
  const [whereIStopped, setWhereIStopped] = useState('');
  const [nextStep, setNextStep] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => firstRef.current?.focus(), []);

  const submit = async () => {
    if (saving) return;
    const parsed = pauseInput.safeParse({ id: projectId, whereIStopped, nextStep });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the fields and try again.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await pauseProject(parsed.data);
      onPaused();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <form
      id={formId}
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          void submit();
        } else if (e.key === 'Escape') {
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      <Field label="Where I stopped">
        {(id) => (
          <textarea
            id={id}
            ref={firstRef}
            rows={2}
            value={whereIStopped}
            onChange={(e) => setWhereIStopped(e.target.value)}
            className={`${inputClass} resize-y`}
          />
        )}
      </Field>
      <Field label="Next step" hint="⌘/Ctrl + Enter to pause, Esc to go back">
        {(id) => (
          <textarea
            id={id}
            rows={2}
            value={nextStep}
            onChange={(e) => setNextStep(e.target.value)}
            className={`${inputClass} resize-y`}
          />
        )}
      </Field>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? 'Pausing…' : 'Pause project'}
        </Button>
        <Button onClick={onCancel}>Back</Button>
      </div>
    </form>
  );
}

function Finished({ outcome }: { outcome: ReviewOutcome }) {
  const finishReview = useHud((s) => s.finishReview);
  const setView = useHud((s) => s.setView);
  const setWorldFilter = useHud((s) => s.setWorldFilter);
  const recorded = useRef(false);

  useEffect(() => {
    // Once per review, even if React runs effects twice in development.
    if (recorded.current) return;
    recorded.current = true;
    guard(() => finishReview());
  }, [finishReview]);

  return (
    <>
      <h2 id="review-heading" className="text-3xl font-semibold tracking-tight text-ink">
        Review done
      </h2>
      <div className="panel mt-8 flex flex-col items-start gap-4 p-6">
        <p className="text-[15px] text-ink">{outcomeText(outcome)}.</p>
        <p className="text-sm leading-relaxed text-muted">
          {outcome.letGo > 0
            ? 'Projects you let go are in Archived if you ever want them back. '
            : ''}
          The next review comes around in a week.
        </p>
        <Button
          autoFocus
          variant="primary"
          onClick={() => {
            setWorldFilter(null);
            setView('grid');
          }}
        >
          Back to All projects
        </Button>
      </div>
    </>
  );
}

function lastActivityText(days: number): string {
  if (days === 0) return 'Last activity today';
  if (days === 1) return 'Last activity 1 day ago';
  return `Last activity ${days} days ago`;
}

function formatDate(at: number): string {
  return new Date(at).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}
