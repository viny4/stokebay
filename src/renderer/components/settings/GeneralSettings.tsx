// Settings sections for worlds, the editor and the data folder.
import { useState } from 'react';
import { EDITORS, type EditorId } from '../../../shared/editors';
import type { World } from '../../../shared/types';
import { errorMessage, guard, useHud } from '../../store/useHud';
import { Button, inputClass } from '../ui';

const PALETTE = [
  '#38bdf8',
  '#f472b6',
  '#facc15',
  '#4ade80',
  '#c084fc',
  '#fb923c',
  '#2dd4bf',
  '#f87171',
];

export function SectionHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="font-display text-xs tracking-[0.3em] text-status-active uppercase">
      {children}
    </h3>
  );
}

export function WorldsSettings() {
  const worlds = useHud((s) => s.worlds);
  const projects = useHud((s) => s.projects);
  const openDialog = useHud((s) => s.openDialog);
  const deleteWorld = useHud((s) => s.deleteWorld);
  const createWorld = useHud((s) => s.createWorld);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    if (!draft.trim()) return;
    try {
      await createWorld(draft.trim());
      setDraft('');
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <section aria-labelledby="settings-worlds" className="flex flex-col gap-3">
      <SectionHeading id="settings-worlds">Worlds</SectionHeading>
      <p className="text-sm text-hud-muted">
        The groups your projects belong to. Deleting a world keeps its projects; they just lose the
        tag.
      </p>
      <ul className="flex flex-col gap-2">
        {worlds.map((world) => (
          <WorldRow
            key={world.id}
            world={world}
            count={projects.filter((p) => p.worldIds.includes(world.id)).length}
            onDelete={() =>
              openDialog({
                kind: 'confirm',
                title: `Delete "${world.name}"?`,
                message:
                  'The world is removed. Its projects stay on the HUD, just without this tag.',
                confirmLabel: 'Delete world',
                danger: true,
                onConfirm: () => deleteWorld(world.id),
              })
            }
          />
        ))}
        {worlds.length === 0 ? <li className="text-sm text-hud-muted">No worlds yet.</li> : null}
      </ul>
      <div className="flex gap-2">
        <input
          aria-label="New world name"
          placeholder="New world, e.g. Robotics"
          value={draft}
          maxLength={40}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void add();
            }
          }}
          className={`${inputClass} py-1.5`}
        />
        <Button disabled={!draft.trim()} onClick={() => void add()}>
          Add
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function WorldRow({
  world,
  count,
  onDelete,
}: {
  world: World;
  count: number;
  onDelete: () => void;
}) {
  const updateWorld = useHud((s) => s.updateWorld);
  const [name, setName] = useState(world.name);
  const [error, setError] = useState<string | null>(null);

  const save = async (changes: { name?: string; color?: string }) => {
    try {
      await updateWorld({ id: world.id, ...changes });
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
      setName(world.name);
    }
  };

  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <div className="flex gap-1" role="radiogroup" aria-label={`Colour of ${world.name}`}>
          {PALETTE.map((color) => (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={world.color === color}
              aria-label={color}
              onClick={() => void save({ color })}
              className={`h-4 w-4 rounded-full ${world.color === color ? 'ring-2 ring-white/80' : 'opacity-60 hover:opacity-100'}`}
              style={{ background: color }}
            />
          ))}
        </div>
        <input
          aria-label={`Name of ${world.name}`}
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name.trim() && name.trim() !== world.name) void save({ name: name.trim() });
            else setName(world.name);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              e.stopPropagation();
              setName(world.name);
            }
          }}
          className={`${inputClass} py-1`}
        />
        <span className="w-20 shrink-0 text-right font-hud text-xs text-hud-muted">
          {count} project{count === 1 ? '' : 's'}
        </span>
        <Button variant="danger" aria-label={`Delete ${world.name}`} onClick={onDelete}>
          ×
        </Button>
      </div>
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
    </li>
  );
}

export function EditorSettings() {
  const editor = useHud((s) => s.settings.editor);
  const setEditor = useHud((s) => s.setEditor);
  return (
    <section aria-labelledby="settings-editor" className="flex flex-col gap-3">
      <SectionHeading id="settings-editor">Editor</SectionHeading>
      <p className="text-sm text-hud-muted">
        What &ldquo;Open in…&rdquo; uses for projects with a folder.
      </p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Editor">
        {EDITORS.map((e) => (
          <button
            key={e.id}
            type="button"
            role="radio"
            aria-checked={editor === e.id}
            onClick={() => guard(() => setEditor(e.id as EditorId))}
            className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
              editor === e.id
                ? 'border-status-active/70 bg-status-active/15 text-status-active'
                : 'border-hud-line text-hud-muted hover:text-hud-text'
            }`}
          >
            {e.name}
          </button>
        ))}
      </div>
    </section>
  );
}

export function DataSettings() {
  return (
    <section aria-labelledby="settings-data" className="flex flex-col gap-3">
      <SectionHeading id="settings-data">Your data</SectionHeading>
      <p className="text-sm text-hud-muted">
        Everything is stored on this Mac in one data file plus your Lab files. Nothing is sent
        anywhere.
      </p>
      <div>
        <Button onClick={() => guard(() => window.api.revealDataFolder())}>Show data folder</Button>
      </div>
    </section>
  );
}
