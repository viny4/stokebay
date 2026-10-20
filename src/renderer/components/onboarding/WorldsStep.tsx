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
    <section aria-labelledby="onboarding-worlds-title" className="flex flex-col gap-6 py-10">
      <div className="flex flex-col gap-1.5">
        <h1
          id="onboarding-worlds-title"
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl font-semibold tracking-tight text-ink focus:outline-none"
        >
          What do you make?
        </h1>
        <p className="max-w-xl text-sm leading-relaxed text-muted">
          Pick the kinds of things you work on. Each one becomes a world: a group your projects
          belong to.
        </p>
      </div>

      <div className="panel flex flex-col gap-5 p-5" style={panelStyle}>
        <div role="group" aria-label="Worlds" className="flex flex-wrap gap-2">
          {chipNames(picks).map((name) => {
            const on = isSelected(picks, name);
            return (
              <motion.button
                key={name}
                type="button"
                aria-pressed={on}
                disabled={busy}
                whileTap={{ scale: 0.97 }}
                onClick={() => apply(toggleWorld(picks, name))}
                className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[13px] font-medium transition-colors disabled:opacity-40 ${
                  on
                    ? 'border-accent bg-accent/10 text-ink'
                    : 'border-line text-muted hover:bg-hover hover:text-ink'
                }`}
              >
                {/* A tick as well as colour, so the state doesn't rely on colour alone. */}
                <span
                  aria-hidden
                  className={`grid h-3.5 w-3.5 place-items-center rounded-full border text-[9px] leading-none ${
                    on ? 'border-accent bg-accent text-accent-ink' : 'border-line-strong'
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
          <Field label="Add your own" error={error}>
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

        <p className="text-xs text-muted">
          <span className="font-medium text-ink">
            {count === 0 ? 'None picked' : `${count} picked`}
          </span>
          {' · '}
          {count === 0
            ? 'Picking at least one helps organise your projects, but you can skip this. '
            : ''}
          You can rename, add or remove worlds later.
        </p>
      </div>
    </section>
  );
}
