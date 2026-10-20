// Step 2: "What do you make?" Toggle chips for common interests plus the user's own; each
// picked name becomes a world when setup finishes.
import { motion } from 'framer-motion';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Button, Field, inputClass } from '../ui';
import {
  MAX_WORLD_NAME,
  addCustomWorld,
  chipNames,
  isSelected,
  toggleWorld,
  type PickResult,
  type WorldPicks,
} from './onboarding-form';

export function WorldsStep({
  picks,
  onPicks,
  busy,
  panelStyle,
}: {
  picks: WorldPicks;
  onPicks: (picks: WorldPicks) => void;
  busy: boolean;
  panelStyle: React.CSSProperties;
}) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Moving focus to the new step's heading tells screen readers the step changed and lets
  // Enter carry on to the next step without tabbing.
  useEffect(() => headingRef.current?.focus({ preventScroll: true }), []);

  const apply = (result: PickResult) => {
    if (!result.ok) {
      setError(result.message);
      return false;
    }
    setError(null);
    onPicks(result.picks);
    return true;
  };

  const addDraft = () => {
    if (apply(addCustomWorld(picks, draft))) setDraft('');
  };

  const onDraftKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey) {
      // Enter here adds the world; it must not also advance the setup step.
      event.preventDefault();
      event.stopPropagation();
      if (draft.trim()) addDraft();
    } else if (event.key === 'Escape' && (draft || error)) {
      // First Escape clears the half-typed name; the next one goes back a step.
      event.stopPropagation();
      setDraft('');
      setError(null);
    }
  };

  const count = picks.selected.length;

  return (
    <section aria-labelledby="onboarding-worlds-title" className="flex flex-col gap-6 py-6">
      <div className="flex flex-col gap-2">
        <h1
          id="onboarding-worlds-title"
          ref={headingRef}
          tabIndex={-1}
          className="font-display text-2xl tracking-[0.12em] text-hud-text focus:outline-none sm:text-3xl"
        >
          What do you make?
        </h1>
        <p className="max-w-2xl font-hud text-lg leading-snug tracking-wide text-hud-muted">
          Pick the kinds of things you work on. Each one becomes a <em>world</em>, a branch your
          projects grow from.
        </p>
      </div>

      <div className="hud-frame flex flex-col gap-5 p-6" style={panelStyle}>
        <div role="group" aria-label="Worlds" className="flex flex-wrap gap-2.5">
          {chipNames(picks).map((name) => {
            const on = isSelected(picks, name);
            return (
              <motion.button
                key={name}
                type="button"
                aria-pressed={on}
                disabled={busy}
                whileTap={{ scale: 0.95 }}
                onClick={() => apply(toggleWorld(picks, name))}
                className={`inline-flex items-center gap-2 rounded-md border px-3.5 py-2 font-hud text-base tracking-wide transition-colors disabled:opacity-40 ${
                  on
                    ? 'border-status-active/80 bg-status-active/20 text-status-active shadow-[inset_0_0_12px_rgb(56_214_255/0.25)]'
                    : 'border-hud-line text-hud-muted hover:border-status-active/40 hover:text-hud-text'
                }`}
              >
                {/* A tick as well as colour, so the state doesn't rely on colour alone. */}
                <span
                  aria-hidden
                  className={`grid h-3.5 w-3.5 place-items-center border text-[10px] leading-none ${
                    on ? 'border-status-active bg-status-active text-hud-bg' : 'border-hud-muted/60'
                  }`}
                >
                  {on ? '✓' : ''}
                </span>
                {name}
              </motion.button>
            );
          })}
        </div>

        <div className="max-w-md">
          <Field label="+ Add your own" error={error}>
            {(id) => (
              <div className="flex gap-2">
                <input
                  id={id}
                  value={draft}
                  maxLength={MAX_WORLD_NAME}
                  disabled={busy}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    setError(null);
                  }}
                  onKeyDown={onDraftKey}
                  placeholder="Woodworking, 3D printing…"
                  aria-invalid={error ? true : undefined}
                  className={inputClass}
                />
                <Button disabled={busy || !draft.trim()} onClick={addDraft}>
                  Add
                </Button>
              </div>
            )}
          </Field>
        </div>

        <p className="text-sm text-hud-muted">
          <span className="font-hud tracking-wider text-hud-text uppercase">
            {count === 0 ? 'None picked' : `${count} picked`}
          </span>
          {' · '}
          {count === 0
            ? 'Picking at least one helps organise your HUD, but you can skip this. '
            : ''}
          You can rename, add or remove worlds later.
        </p>
      </div>
    </section>
  );
}
