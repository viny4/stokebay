// "to <project>": shows where the note goes; focus it (Tab or click) and type to pick another.
// Up/Down move, Enter picks, Escape goes back to the text. Opens upwards over the text box,
// since the capture window is short.
import { useId, useState } from 'react';
import type { Id, ProjectSummary } from '../../shared/types';
import { STATUS_COLOR, STATUS_LABEL } from '../components/ui';
import { filterTargets } from './picker';

export function ProjectPicker({
  targets,
  value,
  onChange,
  onCancel,
  onSubmit,
}: {
  targets: ProjectSummary[];
  value: Id | null;
  onChange: (id: Id) => void;
  /** Escape with the list open: back to the text box. */
  onCancel: () => void;
  /** Enter with the list closed saves, same as in the text box. */
  onSubmit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();
  const selected = targets.find((p) => p.id === value) ?? null;
  const shown = open ? filterTargets(targets, query) : [];
  const optionId = (i: number) => `${listId}-${i}`;

  const openList = () => {
    setOpen(true);
    setQuery('');
    setActive(
      Math.max(
        0,
        targets.findIndex((p) => p.id === value),
      ),
    );
  };

  const choose = (project: ProjectSummary) => {
    setOpen(false);
    onChange(project.id);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        openList();
        return;
      }
      if (!shown.length) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + step + shown.length) % shown.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && shown[active]) choose(shown[active]);
      else if (!open) onSubmit();
    } else if (e.key === 'Escape' && open) {
      // Handled here, so the window stays open.
      e.preventDefault();
      setOpen(false);
      onCancel();
    }
  };

  return (
    <div className="relative flex min-w-0 items-center gap-1">
      <span className="shrink-0 text-[13px] text-muted">to</span>
      <input
        type="text"
        role="combobox"
        aria-label="Project"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && shown[active] ? optionId(active) : undefined}
        value={open ? query : (selected?.title ?? '')}
        placeholder={selected?.title ?? 'Pick a project'}
        onFocus={openList}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        spellCheck={false}
        className="h-7 w-60 min-w-0 truncate rounded-md border border-transparent bg-transparent px-2 text-[13px] font-medium text-ink placeholder:text-muted hover:bg-hover focus:border-line focus:bg-surface focus:outline-none"
      />
      {open ? (
        <div
          id={listId}
          role="listbox"
          aria-label="Projects"
          className="absolute bottom-full left-5 z-10 mb-1.5 max-h-[148px] w-80 overflow-y-auto rounded-lg border border-line bg-raised p-1 shadow-pop"
        >
          {shown.length === 0 ? (
            <p className="px-2.5 py-2 text-[13px] text-muted">No project matches “{query}”.</p>
          ) : null}
          {shown.map((project, i) => (
            <div
              key={project.id}
              id={optionId(i)}
              role="option"
              aria-selected={i === active}
              onPointerEnter={() => setActive(i)}
              // pointerdown, not click: the input's blur would otherwise close the list first.
              onPointerDown={(e) => {
                e.preventDefault();
                choose(project);
              }}
              className={`flex cursor-default items-center gap-2 rounded-md px-2.5 py-1.5 ${
                i === active ? 'bg-hover' : ''
              }`}
            >
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: project.color ?? STATUS_COLOR[project.status] }}
              />
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{project.title}</span>
              {project.status !== 'active' ? (
                <span className="shrink-0 text-[11px] text-muted">
                  {STATUS_LABEL[project.status]}
                </span>
              ) : null}
              {project.id === value ? (
                <span className="shrink-0 text-[11px] text-accent">Current</span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
