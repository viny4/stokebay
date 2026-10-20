// New / edit project dialog (prototype step 4).
import { useId, useState, type FormEvent, type KeyboardEvent } from 'react';
import { createWorldInput } from '../../shared/schemas';
import { SETTABLE_STATUSES, type ProjectSummary } from '../../shared/types';
import { errorMessage, useHud, type DialogState } from '../store/useHud';
import {
  initialValues,
  isEmptyPatch,
  toCreateInput,
  toggleId,
  toUpdateInput,
  type FieldErrors,
  type ProjectFormValues,
} from './project-form';
import { Button, Dialog, Field, STATUS_LABEL, inputClass } from './ui';

export function ProjectDialog({ dialog }: { dialog: Extract<DialogState, { kind: 'project' }> }) {
  const closeDialog = useHud((s) => s.closeDialog);
  const editId = dialog.mode === 'edit' ? dialog.projectId : null;
  const project = useHud((s) =>
    editId === null ? null : (s.projects.find((p) => p.id === editId) ?? null),
  );
  const title = dialog.mode === 'create' ? 'New project' : 'Edit project';

  // The project can vanish while the dialog is open (deleted elsewhere); say so instead of
  // showing an empty form that would fail on save.
  if (dialog.mode === 'edit' && !project) {
    return (
      <Dialog
        title={title}
        onClose={closeDialog}
        footer={<Button onClick={closeDialog}>Close</Button>}
      >
        <p className="text-sm text-muted">This project no longer exists.</p>
      </Dialog>
    );
  }

  return <ProjectForm title={title} project={project} onClose={closeDialog} />;
}

function ProjectForm({
  title,
  project,
  onClose,
}: {
  title: string;
  project: ProjectSummary | null;
  onClose: () => void;
}) {
  const createProject = useHud((s) => s.createProject);
  const updateProject = useHud((s) => s.updateProject);
  const pickFolder = useHud((s) => s.pickFolder);
  const showToast = useHud((s) => s.showToast);

  // Seeded once: later store updates (e.g. a Git refresh) must not wipe what the user typed.
  const [values, setValues] = useState<ProjectFormValues>(() => initialValues(project));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const formId = useId();
  const isPaused = project?.status === 'paused';

  const set = <K extends keyof ProjectFormValues>(key: K, value: ProjectFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    // Clear a field's error as soon as the user changes it, so stale messages don't linger.
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setServerError(null);

    if (project) {
      const result = toUpdateInput(project, values);
      if (!result.ok) {
        setErrors(result.errors);
        return;
      }
      // Nothing changed: closing quietly beats writing an empty project_updated event.
      if (isEmptyPatch(result.value.patch)) {
        onClose();
        return;
      }
      setSaving(true);
      try {
        await updateProject(result.value);
        onClose();
        showToast('Saved');
      } catch (err) {
        setServerError(errorMessage(err));
        setSaving(false);
      }
      return;
    }

    const result = toCreateInput(values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setSaving(true);
    try {
      await createProject(result.value);
      onClose();
      showToast('Project created');
    } catch (err) {
      setServerError(errorMessage(err));
      setSaving(false);
    }
  };

  const chooseFolder = async () => {
    try {
      const folder = await pickFolder();
      if (folder) set('path', folder);
    } catch (err) {
      setErrors((e) => ({ ...e, path: errorMessage(err) }));
    }
  };

  return (
    <Dialog
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form={formId} variant="primary" disabled={saving}>
            {saving ? 'Saving…' : project ? 'Save' : 'Create project'}
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
        <Field label="Title" error={errors.title}>
          {(id) => (
            <input
              id={id}
              autoFocus
              value={values.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="What are you working on?"
              aria-invalid={errors.title ? true : undefined}
              className={inputClass}
            />
          )}
        </Field>

        <WorldPicker
          selected={values.worldIds}
          onChange={(ids) => set('worldIds', ids)}
          error={errors.worldIds}
        />

        <Field
          label="Status"
          error={errors.status}
          hint={isPaused ? 'Resume the project to change its status.' : undefined}
        >
          {(id) =>
            isPaused ? (
              <select id={id} disabled value="paused" className={`${inputClass} opacity-60`}>
                <option value="paused">{STATUS_LABEL.paused}</option>
              </select>
            ) : (
              <select
                id={id}
                value={values.status}
                onChange={(e) => set('status', e.target.value as ProjectFormValues['status'])}
                className={inputClass}
              >
                {SETTABLE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            )
          }
        </Field>

        <Field
          label="Folder (optional)"
          error={errors.path}
          hint="Linking a folder enables Git info and opening it in your editor."
        >
          {(id) => (
            // The id goes on the group, not the button, so the button keeps its own name.
            <div id={id} role="group" aria-label="Folder" className="flex flex-col gap-2">
              {values.path ? (
                <code className="selectable block break-all rounded-md bg-sunken px-3 py-2 font-mono text-xs text-ink">
                  {values.path}
                </code>
              ) : null}
              <div className="flex gap-2">
                <Button onClick={() => void chooseFolder()}>
                  {values.path ? 'Change folder…' : 'Choose folder…'}
                </Button>
                {values.path ? (
                  <Button aria-label="Clear folder" onClick={() => set('path', null)}>
                    Clear
                  </Button>
                ) : null}
              </div>
            </div>
          )}
        </Field>

        {serverError ? (
          <p role="alert" className="text-sm text-danger">
            {serverError}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}

function WorldPicker({
  selected,
  onChange,
  error,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
  error?: string;
}) {
  const worlds = useHud((s) => s.worlds);
  const createWorld = useHud((s) => s.createWorld);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [worldError, setWorldError] = useState<string | null>(null);
  const legendId = useId();

  const cancelAdd = () => {
    setAdding(false);
    setName('');
    setWorldError(null);
  };

  const addWorld = async () => {
    const parsed = createWorldInput.safeParse({ name });
    if (!parsed.success) {
      setWorldError(parsed.error.issues[0]?.message ?? 'Invalid name.');
      return;
    }
    setBusy(true);
    try {
      const world = await createWorld(parsed.data.name);
      onChange([...selected, world.id]);
      cancelAdd();
    } catch (err) {
      setWorldError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      // Enter here creates the world; it must not submit the whole project form.
      event.preventDefault();
      if (!busy) void addWorld();
    } else if (event.key === 'Escape') {
      // Escape closes this small input only, not the dialog around it.
      event.stopPropagation();
      cancelAdd();
    }
  };

  return (
    <fieldset className="flex flex-col gap-1.5" aria-describedby={error ? legendId : undefined}>
      <legend className="mb-1.5 text-[13px] font-medium text-ink">Areas</legend>
      <div className="flex flex-wrap items-center gap-2">
        {worlds.map((w) => {
          const on = selected.includes(w.id);
          return (
            <button
              key={w.id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(toggleId(selected, w.id))}
              className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors ${
                on
                  ? 'border-accent bg-accent/10 text-ink'
                  : 'border-line text-muted hover:bg-hover hover:text-ink'
              }`}
            >
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: w.color }}
              />
              {w.name}
            </button>
          );
        })}
        {adding ? (
          <input
            autoFocus
            value={name}
            disabled={busy}
            onChange={(e) => {
              setName(e.target.value);
              setWorldError(null);
            }}
            onKeyDown={onKeyDown}
            onBlur={() => {
              if (name.trim() === '' && !busy) cancelAdd();
            }}
            placeholder="Area name, Enter to add"
            aria-label="New area name"
            aria-invalid={worldError ? true : undefined}
            className={`${inputClass} h-7 w-52 rounded-full py-0 text-xs`}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="h-7 rounded-full border border-dashed border-line-strong px-2.5 text-xs text-muted hover:bg-hover hover:text-ink"
          >
            + New area
          </button>
        )}
      </div>
      {worldError ? (
        <p role="alert" className="text-xs text-danger">
          {worldError}
        </p>
      ) : error ? (
        <p id={legendId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : worlds.length === 0 && !adding ? (
        <p className="text-xs text-muted">Areas group your projects, like Coding or Music.</p>
      ) : null}
    </fieldset>
  );
}
