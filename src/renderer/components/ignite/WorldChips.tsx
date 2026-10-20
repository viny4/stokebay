// World toggle chips with an inline "+ New world" input, in the Ignite screen's style.
// Same behaviour as the project dialog's picker; kept separate so each screen can be styled
// without touching the other.
import { useState, type KeyboardEvent } from 'react';
import { createWorldInput } from '../../../shared/schemas';
import type { Id } from '../../../shared/types';
import { errorMessage, useHud } from '../../store/useHud';
import { toggleId } from '../project-form';
import { inputClass } from '../ui';

export function WorldChips({
  selected,
  onChange,
  disabled,
}: {
  selected: Id[];
  onChange: (ids: Id[]) => void;
  disabled: boolean;
}) {
  const worlds = useHud((s) => s.worlds);
  const createWorld = useHud((s) => s.createWorld);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancelAdd = () => {
    setAdding(false);
    setName('');
    setError(null);
  };

  const addWorld = async () => {
    const parsed = createWorldInput.safeParse({ name });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid name.');
      return;
    }
    setBusy(true);
    try {
      const world = await createWorld(parsed.data.name);
      onChange([...selected, world.id]);
      cancelAdd();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      if (!busy) void addWorld();
    } else if (event.key === 'Escape') {
      // Escape closes this small input only, not the Ignite screen around it.
      event.stopPropagation();
      cancelAdd();
    }
  };

  return (
    <fieldset className="flex flex-col gap-1.5" disabled={disabled}>
      <legend className="mb-1.5 font-hud text-xs uppercase tracking-widest text-hud-muted">
        Worlds
      </legend>
      <div className="flex flex-wrap items-center gap-2">
        {worlds.map((w) => {
          const on = selected.includes(w.id);
          return (
            <button
              key={w.id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(toggleId(selected, w.id))}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1 text-xs transition-colors ${
                on
                  ? 'border-status-active/70 bg-status-active/15 text-status-active'
                  : 'border-hud-line text-hud-muted hover:text-hud-text'
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
              setError(null);
            }}
            onKeyDown={onKeyDown}
            onBlur={() => {
              if (name.trim() === '' && !busy) cancelAdd();
            }}
            placeholder="World name, Enter to add"
            aria-label="New world name"
            aria-invalid={error ? true : undefined}
            className={`${inputClass} w-52 py-1 text-xs`}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-md border border-dashed border-hud-line px-3 py-1 text-xs text-hud-muted hover:text-hud-text"
          >
            + New world
          </button>
        )}
      </div>
      {error ? (
        <p role="alert" className="text-xs text-red-300">
          {error}
        </p>
      ) : worlds.length === 0 && !adding ? (
        <p className="text-xs text-hud-muted">Worlds group your projects, like Coding or Music.</p>
      ) : null}
    </fieldset>
  );
}
