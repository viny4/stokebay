// Ignite: the full-screen "new project" flow. The user describes what they want to build, a
// blueprint is suggested, its modules and checklist assemble on the right, and Ignite creates
// the project and launches it into the HUD. The plain project dialog stays for editing.
import { motion, useAnimationControls, useIsPresent, useReducedMotion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { AssemblyBay, LAUNCH_MS } from '../components/ignite/AssemblyBay';
import { BlueprintGrid } from '../components/ignite/BlueprintGrid';
import {
  blueprintAssembly,
  buildIgniteInput,
  resolveBlueprint,
  titleFromIdea,
  type Assembly,
  type IgniteField,
} from '../components/ignite/ignite-form';
import { WorldChips } from '../components/ignite/WorldChips';
import { Button, Field, inputClass } from '../components/ui';
import { errorMessage, useHud } from '../store/useHud';
import type { Id } from '../../shared/types';

/** The intro can be skipped (by typing or clicking) only while it is still playing. */
const INTRO_MS = 900;

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

const panelStyle = {
  '--frame-color': 'rgb(56 189 248 / 0.42)',
  '--frame-fill': 'rgb(4 18 38 / 0.88)',
} as React.CSSProperties;

type Phase = 'edit' | 'saving' | 'launching';

export function Ignite() {
  const reduce = useReducedMotion() ?? false;
  const blueprints = useHud((s) => s.blueprints);
  const closeDialog = useHud((s) => s.closeDialog);
  const ignite = useHud((s) => s.ignite);
  const openProject = useHud((s) => s.openProject);
  const showToast = useHud((s) => s.showToast);
  const pickFolder = useHud((s) => s.pickFolder);

  const [idea, setIdea] = useState('');
  /** null while the name still follows the idea; set once the user types their own. */
  const [name, setName] = useState<string | null>(null);
  /** A blueprint the user chose; until then the suggestion drives the selection. */
  const [manualId, setManualId] = useState<string | null>(null);
  /** The user's edits to the selected blueprint's modules / checklist / parts bin. */
  const [edited, setEdited] = useState<Assembly | null>(null);
  const [worldIds, setWorldIds] = useState<Id[]>([]);
  const [path, setPath] = useState<string | null>(null);
  const [error, setError] = useState<{ field: IgniteField | null; message: string } | null>(null);
  const [phase, setPhase] = useState<Phase>('edit');
  const [introDone, setIntroDone] = useState(reduce);
  const [introUntil] = useState(() => Date.now() + INTRO_MS);

  const root = useRef<HTMLDivElement>(null);
  const ideaRef = useRef<HTMLTextAreaElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const launchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const launched = useRef(false);
  const panel = useAnimationControls();
  const isPresent = useIsPresent();
  const presentRef = useRef(isPresent);
  useEffect(() => {
    presentRef.current = isPresent;
  }, [isPresent]);

  const { selected, suggested } = useMemo(
    () => resolveBlueprint(blueprints, idea, manualId),
    [blueprints, idea, manualId],
  );
  const assembly = useMemo(() => {
    if (!selected) return null;
    return edited && edited.blueprintId === selected.id ? edited : blueprintAssembly(selected);
  }, [selected, edited]);
  const title = name ?? titleFromIdea(idea);
  const busy = phase !== 'edit';
  const isMac = typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac');

  // Fade the form in after the grid starts powering up; skipIntro jumps straight to the end.
  useEffect(() => {
    if (introDone) return;
    void panel.start({ opacity: 1, y: 0, transition: { delay: 0.3, duration: 0.35 } });
  }, [introDone, panel]);

  // Keep focus inside the overlay: anything behind it (top bar, detail panel) stays in the DOM
  // and would otherwise be reachable by Tab once focus falls back to the body.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const onFocusIn = (event: FocusEvent) => {
      if (!presentRef.current) return;
      const el = root.current;
      if (el && event.target instanceof Node && !el.contains(event.target)) {
        ideaRef.current?.focus();
      }
    };
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      clearTimeout(launchTimer.current);
      // After a launch the new project's detail panel opens; don't pull focus away from it.
      if (!launched.current) previous?.focus();
    };
  }, []);

  const skipIntro = () => {
    if (introDone || Date.now() > introUntil) return;
    setIntroDone(true);
    panel.stop();
    panel.set({ opacity: 1, y: 0 });
  };

  const pickBlueprint = (id: string) => {
    setManualId(id);
    // Re-pressing the current blueprint only locks it in; it mustn't wipe the user's edits.
    if (id !== selected?.id) setEdited(null);
    clearError();
  };

  const editAssembly = (next: Assembly) => {
    setEdited(next);
    // Once the user shapes the modules, typing more of the idea must not swap the blueprint.
    setManualId(next.blueprintId);
    if (error?.field === 'modules' || error?.field === 'checklist') setError(null);
  };

  const clearError = () => setError(null);

  const chooseFolder = async () => {
    try {
      const folder = await pickFolder();
      if (folder) {
        setPath(folder);
        clearError();
      }
    } catch (err) {
      setError({ field: 'path', message: errorMessage(err) });
    }
  };

  const submit = async () => {
    if (busy) return;
    skipIntro();
    const result = buildIgniteInput({
      title,
      idea,
      blueprintId: selected?.id ?? null,
      worldIds,
      path,
      assembly,
    });
    if (!result.ok) {
      setError({ field: result.field, message: result.message });
      if (result.field === 'title') nameRef.current?.focus();
      else if (result.field === 'idea') ideaRef.current?.focus();
      return;
    }
    setError(null);
    setPhase('saving');
    try {
      const project = await ignite(result.value);
      launched.current = true;
      setPhase('launching');
      launchTimer.current = setTimeout(
        () => {
          closeDialog();
          showToast(`${project.title} ignited.`);
          void openProject(project.id);
        },
        reduce ? 0 : LAUNCH_MS,
      );
    } catch (err) {
      setError({ field: null, message: errorMessage(err) });
      setPhase('edit');
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['Shift', 'Meta', 'Control', 'Alt', 'Tab'].includes(event.key)) skipIntro();
    if (event.key === 'Escape') {
      event.stopPropagation();
      // While saving or launching the project already exists; let the launch finish.
      if (!busy) closeDialog();
      return;
    }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void submit();
      return;
    }
    if (event.key !== 'Tab' || !root.current) return;
    const focusable = [...root.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <motion.div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label="Ignite a new project"
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-[rgb(2_8_20/0.94)] backdrop-blur-sm"
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduce ? undefined : { opacity: 0, transition: { duration: 0.2 } }}
      transition={{ duration: 0.25 }}
      onKeyDown={onKeyDown}
      onPointerDown={skipIntro}
    >
      <BlueprintGrid key={introDone ? 'ready' : 'intro'} animate={!introDone} />

      <header className="relative flex items-center gap-5 px-8 pt-6 pb-4">
        <motion.h2
          key={introDone ? 'ready' : 'intro'}
          className="font-display text-3xl font-bold tracking-[0.4em] text-status-active drop-shadow-[0_0_14px_rgb(56_214_255/0.8)]"
          initial={introDone ? false : { opacity: 0, scale: 1.12 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.45, delay: 0.1, ease: 'easeOut' }}
        >
          IGNITE
        </motion.h2>
        <p aria-hidden className="font-mono text-[11px] tracking-widest text-hud-muted uppercase">
          Blueprint grid online
        </p>
        <button
          type="button"
          aria-label="Close"
          disabled={busy}
          onClick={closeDialog}
          className="ml-auto rounded px-2.5 py-1 text-xl leading-none text-hud-muted hover:text-hud-text disabled:opacity-40"
        >
          ×
        </button>
      </header>

      <motion.div
        className="relative flex min-h-0 flex-1 flex-col"
        initial={introDone ? false : { opacity: 0, y: 12 }}
        animate={panel}
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-6">
          <div className="mx-auto grid max-w-6xl gap-6 min-[860px]:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <section aria-label="Project" className="hud-frame p-5" style={panelStyle}>
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="ignite-idea"
                    className="font-display text-base tracking-[0.12em] text-hud-text"
                  >
                    What do you want to build?
                  </label>
                  <textarea
                    id="ignite-idea"
                    ref={ideaRef}
                    autoFocus
                    rows={2}
                    maxLength={2000}
                    value={idea}
                    disabled={busy}
                    onChange={(e) => {
                      setIdea(e.target.value);
                      if (error?.field === 'idea' || (name === null && error?.field === 'title')) {
                        clearError();
                      }
                    }}
                    placeholder="A weather station that posts the forecast every morning…"
                    aria-invalid={error?.field === 'idea' ? true : undefined}
                    className={`${inputClass} resize-none font-hud text-xl leading-snug tracking-wide`}
                  />
                </div>

                <Field
                  label="Project name"
                  error={error?.field === 'title' ? error.message : null}
                  hint={name === null ? 'Filled in from your idea until you change it.' : undefined}
                >
                  {(id) => (
                    <div className="flex gap-2">
                      <input
                        id={id}
                        ref={nameRef}
                        value={title}
                        maxLength={120}
                        disabled={busy}
                        onChange={(e) => {
                          setName(e.target.value);
                          if (error?.field === 'title') clearError();
                        }}
                        placeholder="Name it"
                        aria-invalid={error?.field === 'title' ? true : undefined}
                        className={inputClass}
                      />
                      {name !== null ? (
                        <Button
                          aria-label="Name it from the idea again"
                          disabled={busy}
                          onClick={() => setName(null)}
                        >
                          Auto
                        </Button>
                      ) : null}
                    </div>
                  )}
                </Field>

                <fieldset className="flex flex-col gap-2" disabled={busy}>
                  <legend className="mb-1.5 font-hud text-xs uppercase tracking-widest text-hud-muted">
                    Blueprint
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {blueprints.map((b) => {
                      const on = selected?.id === b.id;
                      const isSuggested = suggested?.id === b.id;
                      return (
                        <button
                          key={b.id}
                          type="button"
                          aria-pressed={on}
                          aria-description={isSuggested ? 'Suggested for your idea' : undefined}
                          onClick={() => pickBlueprint(b.id)}
                          className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 font-hud text-sm tracking-wide transition-colors ${
                            on
                              ? 'border-status-active/80 bg-status-active/20 text-status-active shadow-[inset_0_0_12px_rgb(56_214_255/0.25)]'
                              : 'border-hud-line text-hud-muted hover:text-hud-text'
                          }`}
                        >
                          {b.name}
                          {isSuggested ? (
                            <motion.span
                              initial={reduce ? false : { scale: 0.6, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              className="border border-status-done/60 bg-status-done/10 px-1.5 py-px font-mono text-[9px] tracking-widest text-status-done uppercase"
                            >
                              suggested
                            </motion.span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                  <p aria-live="polite" className="min-h-5 text-sm text-hud-muted">
                    {selected?.description}
                  </p>
                  {error?.field === 'blueprintId' ? (
                    <p role="alert" className="text-xs text-red-300">
                      {error.message}
                    </p>
                  ) : null}
                </fieldset>

                <WorldChips
                  selected={worldIds}
                  disabled={busy}
                  onChange={(ids) => {
                    setWorldIds(ids);
                    if (error?.field === 'worldIds') clearError();
                  }}
                />

                <Field
                  label="Folder (optional)"
                  error={error?.field === 'path' ? error.message : null}
                  hint="Link a code folder for Git info and Open in editor."
                >
                  {(id) => (
                    // The id goes on the group, not the button, so the button keeps its own name.
                    <div id={id} role="group" aria-label="Folder" className="flex flex-col gap-2">
                      {path ? (
                        <code className="block break-all rounded-md border border-hud-line bg-black/30 px-3 py-2 font-mono text-xs text-hud-text">
                          {path}
                        </code>
                      ) : null}
                      <div className="flex gap-2">
                        <Button disabled={busy} onClick={() => void chooseFolder()}>
                          {path ? 'Change folder…' : 'Choose folder…'}
                        </Button>
                        {path ? (
                          <Button
                            aria-label="Clear folder"
                            disabled={busy}
                            onClick={() => setPath(null)}
                          >
                            Clear
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  )}
                </Field>
              </div>
            </section>

            <section
              aria-label="Assembly bay"
              className="hud-frame self-start p-5"
              style={panelStyle}
            >
              <div className="mb-4 flex items-baseline justify-between gap-3">
                <h3 className="font-display text-xs tracking-[0.25em] text-status-active uppercase">
                  Assembly bay
                </h3>
                <span className="truncate font-mono text-[11px] text-hud-muted">
                  {selected ? selected.name : ''}
                </span>
              </div>
              <AssemblyBay
                assembly={assembly}
                onChange={editAssembly}
                launching={phase === 'launching'}
                launchTitle={title.trim()}
                reduce={reduce}
              />
            </section>
          </div>
        </div>

        <footer className="relative flex items-center gap-3 border-t border-hud-line bg-black/40 px-8 py-3">
          <div className="min-w-0 flex-1">
            {error && !['title', 'path', 'blueprintId'].includes(error.field ?? '') ? (
              <p role="alert" className="truncate text-sm text-red-300">
                {error.message}
              </p>
            ) : (
              <p className="font-mono text-[11px] text-hud-muted">
                {isMac ? '⌘' : 'Ctrl'} + Enter to ignite · Esc to cancel
              </p>
            )}
          </div>
          <Button disabled={busy} onClick={closeDialog}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => void submit()}
            className="px-6 py-2 font-display text-sm tracking-[0.25em] shadow-[0_0_18px_rgb(56_214_255/0.35)]"
          >
            {phase === 'edit' ? 'IGNITE ▸' : 'IGNITING…'}
          </Button>
        </footer>
      </motion.div>
    </motion.div>
  );
}
