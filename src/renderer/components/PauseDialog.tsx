import { useId, useState } from 'react';
import { pauseInput } from '../../shared/schemas';
import type { Id } from '../../shared/types';
import { errorMessage, useHud } from '../store/useHud';
import { Button, Dialog, Field, inputClass } from './ui';

/**
 * Asks for "where I stopped" and "next step" while the context is still fresh; this note is
 * what the resume card shows when the user comes back, possibly months later.
 */
export function PauseDialog({ projectId }: { projectId: Id }) {
  const title = useHud((s) => s.projects.find((p) => p.id === projectId)?.title ?? 'this project');
  const pauseProject = useHud((s) => s.pauseProject);
  const closeDialog = useHud((s) => s.closeDialog);
  const showToast = useHud((s) => s.showToast);
  const formId = useId();

  const [whereIStopped, setWhereIStopped] = useState('');
  const [nextStep, setNextStep] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
      closeDialog();
      showToast('Paused. Your note will be waiting when you come back.');
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
        <Field label="Where I stopped">
          {(id) => (
            <textarea
              id={id}
              rows={3}
              value={whereIStopped}
              onChange={(e) => setWhereIStopped(e.target.value)}
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
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
