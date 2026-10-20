// Settings sections for worlds, the editor and the data folder.
import { useState } from 'react';
import { EDITORS, type EditorId } from '../../../shared/editors';
import type { World } from '../../../shared/types';
import { errorMessage, guard, useHud } from '../../store/useHud';
import { Button, inputClass } from '../ui';

// Muted, mid-tone colours that read on both the light and the dark canvas.
const PALETTE = [
  '#5b8fd1',
  '#d2668f',
  '#c9a03a',
  '#5fa77a',
  '#9277cc',
  '#d9733f',
  '#3f9e9a',
  '#c75c5c',
];

const COLOR_NAMES: Record<string, string> = {
  '#5b8fd1': 'Blue',
  '#d2668f': 'Rose',
  '#c9a03a': 'Ochre',
  '#5fa77a': 'Sage',
  '#9277cc': 'Lavender',
  '#d9733f': 'Orange',
  '#3f9e9a': 'Teal',
  '#c75c5c': 'Red',
};

export function SectionHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="text-[13px] font-semibold text-ink">
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
      <SectionHeading id="settings-worlds">Areas</SectionHeading>
      <p className="-mt-2 text-sm leading-relaxed text-muted">
        The groups your projects belong to. Deleting an area keeps its projects; they just lose the
        tag.
      </p>
      <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
        {worlds.map((world) => (
          <WorldRow
            key={world.id}
            world={world}
            count={projects.filter((p) => p.worldIds.includes(world.id)).length}
            onDelete={() =>
              openDialog({
                kind: 'confirm',
                title: `Delete "${world.name}"?`,
                message: 'The area is removed. Its projects stay, just without this tag.',
                confirmLabel: 'Delete area',
                danger: true,
                onConfirm: () => deleteWorld(world.id),
              })
            }
          />
        ))}
        {worlds.length === 0 ? (
          <li className="px-3 py-2.5 text-sm text-muted">No areas yet.</li>
        ) : null}
      </ul>
      <div className="flex gap-2">
        <input
          aria-label="New area name"
          placeholder="New area, e.g. Robotics"
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
        <p role="alert" className="text-sm text-danger">
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
    <li className="flex flex-col gap-1 px-3 py-2">
      <div className="flex items-center gap-3">
        <div className="flex gap-1.5" role="radiogroup" aria-label={`Colour of ${world.name}`}>
          {PALETTE.map((color) => (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={world.color === color}
              aria-label={COLOR_NAMES[color] ?? color}
              onClick={() => void save({ color })}
              className={`h-3.5 w-3.5 rounded-full transition-shadow ${world.color === color ? 'ring-2 ring-line-strong ring-offset-2 ring-offset-surface' : 'hover:ring-2 hover:ring-line hover:ring-offset-1 hover:ring-offset-surface'}`}
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
          className={`${inputClass} border-transparent bg-transparent py-1 hover:border-line`}
        />
        <span className="w-20 shrink-0 text-right text-xs text-muted">
          {count} project{count === 1 ? '' : 's'}
        </span>
        <button
          type="button"
          aria-label={`Delete ${world.name}`}
          onClick={onDelete}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-lg leading-none text-muted hover:bg-danger/10 hover:text-danger"
        >
          ×
        </button>
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </li>
  );
}

export function EditorSettings() {
  const editor = useHud((s) => s.settings.editor);
  const setEditor = useHud((s) => s.setEditor);
  return (
    <section aria-labelledby="settings-editor" className="flex flex-col gap-3">
      <SectionHeading id="settings-editor">Editor</SectionHeading>
      <p className="-mt-2 text-sm leading-relaxed text-muted">
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
            className={`h-8 rounded-md border px-3 text-[13px] transition-colors ${
              editor === e.id
                ? 'border-accent bg-accent/10 text-ink'
                : 'border-line text-muted hover:bg-hover hover:text-ink'
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
      <p className="-mt-2 text-sm leading-relaxed text-muted">
        Everything is stored on this computer in one data file plus your Lab files. Nothing is sent
        anywhere.
      </p>
      <div>
        <Button onClick={() => guard(() => window.api.revealDataFolder())}>Show data folder</Button>
      </div>
    </section>
  );
}
