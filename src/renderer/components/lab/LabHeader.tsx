// The Lab's top bar: back to the projects, the project, and the toolbar that adds objects.
// It doubles as the window's title bar, so it is a drag strip and leaves room for the
// macOS traffic lights on the left.
import { useEffect, useId, useRef, useState, type FormEvent, type RefObject } from 'react';
import type { ProjectSummary } from '../../../shared/types';
import { TerminalToggle } from '../terminal/TerminalPanel';
import { Button, StatusBadge, inputClass } from '../ui';

export interface LabTools {
  addNote(): void;
  addChecklist(): void;
  /** Resolves to an error message to show in the form, or null when added. */
  addLink(title: string, url: string): Promise<string | null>;
  addFiles(): void;
  addZone(): void;
  toggleParts(): void;
  fitView(): void;
}

export function LabHeader({
  project,
  partsOpen,
  tools,
  onBack,
}: {
  project: ProjectSummary | null;
  partsOpen: boolean;
  tools: LabTools | null;
  onBack: () => void;
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  const linkWrap = useRef<HTMLDivElement>(null);

  return (
    <header className="drag relative z-20 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-sidebar pr-4 pl-20">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to projects"
        className="inline-flex h-7 items-center rounded-md px-2 text-[13px] font-medium text-muted hover:bg-hover hover:text-ink"
      >
        ← Projects
      </button>
      <span aria-hidden className="h-4 w-px bg-line" />
      <div className="flex min-w-0 items-center gap-2.5">
        <h1 className="truncate text-[15px] font-semibold text-ink">
          {project?.title ?? 'Loading…'}
        </h1>
        {project ? <StatusBadge status={project.status} /> : null}
      </div>

      {tools && project ? (
        <div role="toolbar" aria-label="Lab tools" className="ml-auto flex items-center gap-1.5">
          <Button onClick={tools.addNote}>+ Note</Button>
          <Button onClick={tools.addChecklist}>+ Checklist</Button>
          <div ref={linkWrap} className="relative">
            <Button
              aria-expanded={linkOpen}
              aria-haspopup="dialog"
              onClick={() => setLinkOpen((o) => !o)}
            >
              + Link
            </Button>
            {linkOpen ? (
              <LinkForm
                boundary={linkWrap}
                onAdd={tools.addLink}
                onClose={() => setLinkOpen(false)}
              />
            ) : null}
          </div>
          <Button onClick={tools.addFiles}>+ File</Button>
          <Button onClick={tools.addZone}>+ Zone</Button>
          <Divider />
          <Button
            aria-pressed={partsOpen}
            onClick={tools.toggleParts}
            className={
              partsOpen
                ? 'border-accent/40 bg-accent/10 text-ink hover:bg-accent/15'
                : project.partsBin
                  ? 'border-line-strong'
                  : ''
            }
          >
            Parts Bin
          </Button>
          <Button onClick={tools.fitView} aria-label="Fit everything in view">
            Fit view
          </Button>
          {project.path ? <TerminalToggle projectId={project.id} /> : null}
        </div>
      ) : null}
    </header>
  );
}

function Divider() {
  return <span aria-hidden className="mx-1 h-4 w-px bg-line" />;
}

function LinkForm({
  boundary,
  onAdd,
  onClose,
}: {
  /** Clicks inside this (the form and its toggle button) don't close the form. */
  boundary: RefObject<HTMLDivElement | null>;
  onAdd: LabTools['addLink'];
  onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const urlRef = useRef<HTMLInputElement>(null);
  const headingId = useId();

  useEffect(() => urlRef.current?.focus(), []);

  // Clicking anywhere else closes the popover, like a menu.
  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!boundary.current?.contains(event.target as Node)) onClose();
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [boundary, onClose]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const message = await onAdd(title, url);
    setBusy(false);
    if (message) setError(message);
    else onClose();
  };

  return (
    <form
      role="dialog"
      aria-labelledby={headingId}
      onSubmit={(e) => void submit(e)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
      className="absolute top-full right-0 z-30 mt-2 flex w-80 flex-col gap-2 rounded-xl border border-line bg-raised p-4 shadow-pop"
    >
      <h2 id={headingId} className="text-[13px] font-semibold text-ink">
        Add a link
      </h2>
      <input
        ref={urlRef}
        value={url}
        onChange={(e) => {
          setUrl(e.target.value);
          setError(null);
        }}
        placeholder="example.com/page"
        aria-label="Web address"
        className={inputClass}
      />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
        aria-label="Link title"
        maxLength={200}
        className={inputClass}
      />
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={busy || url.trim() === ''}>
          Add
        </Button>
      </div>
    </form>
  );
}
