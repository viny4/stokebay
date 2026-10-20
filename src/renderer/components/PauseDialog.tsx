import { useEffect, useId, useRef, useState } from 'react';
import { pauseInput } from '../../shared/schemas';
import type { Id } from '../../shared/types';
import { errorMessage, useHud } from '../store/useHud';
import {
  formatReminder,
  REMIND_OPTIONS,
  remindTime,
  workStateDraft,
  type RemindChoice,
} from './pause-note';
import { Button, Dialog, Field, inputClass } from './ui';

const selectClass =
  'h-8 rounded-md border border-line bg-surface px-2.5 text-[13px] text-ink focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/15';

/**
 * Asks for "where I stopped" and "next step" while the context is still fresh; this note is
 * what the resume card shows when the user comes back, possibly months later. For projects
 * with a Git folder the first field starts as a draft of what Git shows, so pausing can be
 * as quick as pressing Enter.
 */
export function PauseDialog({ projectId }: { projectId: Id }) {
  const title = useHud((s) => s.projects.find((p) => p.id === projectId)?.title ?? 'this project');
  const hasFolder = useHud((s) => Boolean(s.projects.find((p) => p.id === projectId)?.path));
  const pauseProject = useHud((s) => s.pauseProject);
  const closeDialog = useHud((s) => s.closeDialog);
  const showToast = useHud((s) => s.showToast);
  const formId = useId();

  const [whereIStopped, setWhereIStopped] = useState('');
  const [nextStep, setNextStep] = useState('');
  const [remind, setRemind] = useState<RemindChoice>('none');
  const [drafted, setDrafted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Once the user has typed in the field, a late Git answer must not overwrite it.
  const touched = useRef(false);

  useEffect(() => {
    if (!hasFolder) return;
    let cancelled = false;
    window.api
      .workState(projectId)
      .then((state) => {
        if (cancelled || !state || touched.current) return;
        setWhereIStopped(workStateDraft(state, Date.now()));
        setDrafted(true);
      })
      // Git is only a convenience here; the dialog works the same without it.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [projectId, hasFolder]);

  // The store's clock (ticks each minute) keeps render pure; submit reads the real time.
  const now = useHud((s) => s.now);
  const remindAt = remindTime(remind, now);

  const submit = async () => {
    if (saving) return;
    const parsed = pauseInput.safeParse({
      id: projectId,
      whereIStopped,
      nextStep,
      remindAt: remindTime(remind, Date.now()),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the fields and try again.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await pauseProject(parsed.data);
      closeDialog();
      showToast(
        parsed.data.remindAt
          ? `Paused. You'll get a reminder ${formatReminder(parsed.data.remindAt)}.`
          : 'Paused. Your note will be waiting when you come back.',
      );
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Dialog
      title="Pause project"
      onClose={closeDialog}
      footer={
        <>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button type="submit" form={formId} disabled={saving} variant="primary">
            {saving ? 'Pausing…' : 'Pause project'}
          </Button>
        </>
      }
    >
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
          }
        }}
      >
        <p className="text-sm leading-relaxed text-muted">
          Leave a note for future you on <span className="font-medium text-ink">{title}</span>. It
          shows up first when you open the project again.
        </p>
        {/* Dialog focuses the first field, so "Where I stopped" gets focus on open. */}
        <Field
          label="Where I stopped"
          hint={drafted ? 'Filled in from Git. Change it as you like.' : undefined}
        >
          {(id) => (
            <textarea
              id={id}
              rows={3}
              value={whereIStopped}
              onChange={(e) => {
                touched.current = true;
                setWhereIStopped(e.target.value);
              }}
              placeholder="e.g. Retry logic is half written; the backoff test still fails."
              className={`${inputClass} resize-y`}
            />
          )}
        </Field>
        <Field label="Next step" hint="⌘/Ctrl + Enter to pause">
          {(id) => (
            <textarea
              id={id}
              rows={3}
              value={nextStep}
              onChange={(e) => setNextStep(e.target.value)}
              placeholder="e.g. Add the dead-letter table, then rerun the tests."
              className={`${inputClass} resize-y`}
            />
          )}
        </Field>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <label htmlFor={`${formId}-remind`} className="text-[13px] font-medium text-ink">
            Remind me
          </label>
          <select
            id={`${formId}-remind`}
            value={remind}
            onChange={(e) => setRemind(e.target.value as RemindChoice)}
            className={selectClass}
          >
            {REMIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {remindAt !== null ? (
            <span className="text-xs text-muted">{formatReminder(remindAt)}</span>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
