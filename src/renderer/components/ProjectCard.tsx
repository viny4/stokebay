// One project on the HUD grid. The card body is a real <button> (opens the detail panel);
// the actions menu and the cold "Pause this?" hint are siblings so buttons never nest.
import { AnimatePresence, motion } from 'framer-motion';
import { memo, useEffect, useRef, useState } from 'react';
import { glowFor } from '../../shared/glow';
import { daysSince, formatRelative } from '../../shared/time';
import type { Id, ProjectSummary, World } from '../../shared/types';
import { guard, useHud } from '../store/useHud';
import { openProjectTerminal } from '../store/useTerminals';
import { StatusBadge, WorldTag } from './ui';

export interface ProjectCardProps {
  project: ProjectSummary;
  worldsById: ReadonlyMap<Id, World>;
  now: number;
  /** Position in the grid; arrow-key navigation finds cards by it. */
  index: number;
}

export const ProjectCard = memo(function ProjectCard({
  project: p,
  worldsById,
  now,
  index,
}: ProjectCardProps) {
  const openProject = useHud((s) => s.openProject);
  const openDialog = useHud((s) => s.openDialog);
  const [menuOpen, setMenuOpen] = useState(false);

  const cold = glowFor(p, now) === 'cold';
  const worlds = p.worldIds.flatMap((id) => worldsById.get(id) ?? []);
  const git = p.git?.lastCommitAt ? p.git : null;
  const pause = p.status === 'paused' ? p.activePause : null;

  return (
    <div
      className={`panel group relative flex h-full flex-col transition-[border-color,box-shadow] hover:border-line-strong ${menuOpen ? 'z-20' : ''}`}
    >
      <button
        type="button"
        data-card-index={index}
        onClick={() => guard(() => openProject(p.id))}
        className={`flex flex-1 flex-col gap-2 rounded-[10px] p-4 pr-11 text-left transition-opacity ${
          cold ? 'opacity-60 group-hover:opacity-90' : ''
        }`}
      >
        <span className="line-clamp-2 text-[15px] leading-snug font-semibold text-ink">
          {p.title}
        </span>

        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted">
          <StatusBadge status={p.status} />
          <span aria-hidden>·</span>
          <span>{formatRelative(p.lastActivityAt, now)}</span>
          {p.path ? <FolderIcon path={p.path} /> : null}
        </span>

        {cold ? (
          <span className="text-xs text-muted">
            Untouched for {daysSince(p.lastActivityAt, now)} days
          </span>
        ) : null}

        {pause ? (
          <span className="flex flex-col gap-0.5 text-xs">
            <span className="text-muted">Paused {formatRelative(pause.pausedAt, now)}</span>
            {pause.whereIStopped ? (
              <span className="truncate text-ink/80">Stopped at: {pause.whereIStopped}</span>
            ) : null}
          </span>
        ) : null}

        {git ? (
          <span className="truncate font-mono text-xs text-muted">
            {git.branch ?? 'detached'} · {git.lastCommitMsg ?? 'no message'}
          </span>
        ) : null}

        {worlds.length > 0 ? (
          <span className="mt-auto flex flex-wrap gap-1.5 pt-2">
            {worlds.map((w) => (
              <WorldTag key={w.id} world={w} />
            ))}
          </span>
        ) : null}
      </button>

      {cold ? (
        <div className="border-t border-line px-2 py-1.5">
          <button
            type="button"
            onClick={() => openDialog({ kind: 'pause', projectId: p.id })}
            className="rounded-md px-2 py-1 text-xs font-medium text-status-paused hover:bg-hover"
          >
            Pause and note where you stopped
          </button>
        </div>
      ) : null}

      <CardMenu project={p} open={menuOpen} setOpen={setMenuOpen} />
    </div>
  );
});

function FolderIcon({ path }: { path: string }) {
  return (
    <span role="img" aria-label="Has a folder on disk" title={path} className="inline-flex">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path
          d="M1.5 3.5a1 1 0 0 1 1-1h3.6l1.5 1.5h5.9a1 1 0 0 1 1 1v7.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z"
          stroke="currentColor"
          strokeWidth="1.3"
        />
      </svg>
    </span>
  );
}

interface MenuItem {
  label: string;
  run: () => void;
}

function CardMenu({
  project: p,
  open,
  setOpen,
}: {
  project: ProjectSummary;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const openDialog = useHud((s) => s.openDialog);
  const resumeProject = useHud((s) => s.resumeProject);
  const archiveProject = useHud((s) => s.archiveProject);
  const showToast = useHud((s) => s.showToast);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const items: MenuItem[] = [
    { label: 'Edit', run: () => openDialog({ kind: 'project', mode: 'edit', projectId: p.id }) },
    ...(p.path ? [{ label: 'Open terminal', run: () => openProjectTerminal(p.id) }] : []),
    ...(p.status === 'active'
      ? [{ label: 'Pause', run: () => openDialog({ kind: 'pause', projectId: p.id }) }]
      : []),
    ...(p.status === 'paused'
      ? [{ label: 'Resume', run: () => guard(() => resumeProject(p.id)) }]
      : []),
    {
      label: 'Archive',
      run: () =>
        guard(async () => {
          await archiveProject(p.id);
          showToast('Archived. Restore it from the Archived list.');
        }),
    },
  ];

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, setOpen]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };

  const onMenuKeyDown = (event: React.KeyboardEvent) => {
    // Stop here so the grid's arrow keys and the app's Escape (close panel) don't also fire.
    if (event.key === 'Escape') {
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key === 'Tab') {
      close(false);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    event.stopPropagation();
    const options = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const at = options.indexOf(document.activeElement as HTMLElement);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    options[(at + step + options.length) % options.length]?.focus();
  };

  return (
    <div ref={root} className="absolute top-2.5 right-2.5">
      <button
        ref={trigger}
        type="button"
        aria-label={`Actions for ${p.title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted opacity-0 transition hover:bg-hover hover:text-ink group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100"
      >
        <span aria-hidden className="text-lg leading-none">
          ⋯
        </span>
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            ref={menu}
            role="menu"
            aria-label={`Actions for ${p.title}`}
            onKeyDown={onMenuKeyDown}
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="absolute top-8 right-0 min-w-36 origin-top-right rounded-lg border border-line bg-raised p-1 shadow-pop"
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => {
                  close(true);
                  item.run();
                }}
                className="block w-full rounded-md px-2.5 py-1.5 text-left text-[13px] text-ink hover:bg-hover focus:bg-hover focus:outline-none"
              >
                {item.label}
              </button>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
