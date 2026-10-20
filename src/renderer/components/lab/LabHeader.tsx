// The Lab's top bar: back to the HUD, the project, and the toolbar that adds objects.
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type RefObject,
} from 'react';
import type { ProjectSummary } from '../../../shared/types';
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
    <header className="relative z-20 flex items-center gap-4 border-b border-hud-line bg-black/30 px-5 py-2.5 backdrop-blur">
      <Button onClick={onBack} aria-label="Back to the HUD">
        ← HUD
      </Button>
      <div className="flex min-w-0 items-center gap-3">
        <span className="font-hud text-[10px] tracking-[0.35em] text-hud-muted uppercase">Lab</span>
        <h1 className="truncate font-display text-sm font-bold tracking-[0.2em] text-status-active drop-shadow-[0_0_8px_rgb(56_214_255/0.6)]">
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
            variant={project.partsBin ? 'primary' : 'ghost'}
            aria-pressed={partsOpen}
            onClick={tools.toggleParts}
            className={partsOpen ? 'bg-status-active/30' : ''}
          >
            Parts Bin
          </Button>
          <Button onClick={tools.fitView} aria-label="Fit everything in view">
            Fit view
          </Button>
        </div>
      ) : null}
    </header>
  );
}

function Divider() {
  return <span aria-hidden className="mx-1 h-5 w-px bg-hud-line" />;
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
      className="hud-frame hud-frame-sm absolute top-full right-0 z-30 mt-2 flex w-80 flex-col gap-2 p-4 drop-shadow-[0_0_18px_rgb(56_189_248/0.35)]"
      style={{ '--frame-fill': 'var(--color-hud-raised)' } as CSSProperties}
    >
      <h2
        id={headingId}
        className="font-hud text-xs tracking-[0.25em] text-status-active uppercase"
      >
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
        <p role="alert" className="text-xs text-red-300">
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
