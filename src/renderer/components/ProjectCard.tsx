// One project on the HUD grid. The card body is a real <button> (opens the detail panel);
// the actions menu and the cold "Pause this?" hint are siblings so buttons never nest.
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { memo, useEffect, useRef, useState, type CSSProperties } from 'react';
import { glowFor, type Glow } from '../../shared/glow';
import { daysSince, formatRelative } from '../../shared/time';
import type { Id, ProjectSummary, World } from '../../shared/types';
import { guard, useHud } from '../store/useHud';
import { STATUS_HEX, StatusBadge, WorldTag, withAlpha } from './ui';

const halo = (hex: string, blur: number, alpha: number) =>
  `drop-shadow(0px 0px ${blur}px ${withAlpha(hex, alpha)})`;

/**
 * Frame colour and halo per glow level. The halo is a drop-shadow filter (not box-shadow)
 * so it follows the cut corners. Non-active statuses use `none`: a steady, modest edge.
 */
function glowStyle(glow: Glow, hex: string): { frame: string; filter: string } {
  switch (glow) {
    case 'bright':
      return { frame: withAlpha(hex, 0.9), filter: halo(hex, 9, 0.55) };
    case 'medium':
      return { frame: withAlpha(hex, 0.6), filter: halo(hex, 6, 0.32) };
    case 'dim':
      return { frame: withAlpha(hex, 0.38), filter: halo(hex, 3, 0.18) };
    case 'cold':
      return { frame: 'var(--color-hud-line)', filter: 'none' };
    case 'none':
      return { frame: withAlpha(hex, 0.55), filter: halo(hex, 4, 0.22) };
  }
}

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
  // MotionConfig only skips transform/layout animations; the breathing glow is an opacity
  // loop, so it checks the OS setting itself.
  const reduceMotion = useReducedMotion();

  const glow = glowFor(p, now);
  const hex = STATUS_HEX[p.status];
  const look = glowStyle(glow, hex);
  const breathe = glow === 'bright' && !reduceMotion;
  const cold = glow === 'cold';
  const worlds = p.worldIds.flatMap((id) => worldsById.get(id) ?? []);
  const git = p.git?.lastCommitAt ? p.git : null;
  const pause = p.status === 'paused' ? p.activePause : null;

  return (
    <motion.div
      whileHover={{ y: -3 }}
      style={{ '--frame-color': look.frame, filter: look.filter } as CSSProperties}
      animate={
        breathe ? { filter: [halo(hex, 6, 0.35), halo(hex, 14, 0.75), halo(hex, 6, 0.35)] } : {}
      }
      transition={
        breathe ? { filter: { duration: 4, repeat: Infinity, ease: 'easeInOut' } } : undefined
      }
      className={`hud-frame group relative flex h-full flex-col ${menuOpen ? 'z-20' : ''}`}
    >
      <button
        type="button"
        data-card-index={index}
        onClick={() => guard(() => openProject(p.id))}
        className={`flex flex-1 flex-col gap-2.5 rounded-xl p-4 pr-11 text-left transition-[opacity,filter] ${
          cold ? 'opacity-70 grayscale-[0.7] group-hover:opacity-90' : ''
        }`}
      >
        <span className="line-clamp-2 font-display text-[15px] leading-snug font-medium tracking-wide text-hud-text">
          {p.title}
        </span>

        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <StatusBadge status={p.status} />
          {cold ? (
            <span className="font-hud text-xs tracking-wider text-hud-muted uppercase">
              Cold · {daysSince(p.lastActivityAt, now)}d
            </span>
          ) : null}
          <span className="ml-auto flex items-center gap-2 text-xs text-hud-muted">
            {p.path ? <FolderIcon path={p.path} /> : null}
            <span>{formatRelative(p.lastActivityAt, now)}</span>
          </span>
        </span>

        {pause ? (
          <span className="flex flex-col gap-0.5 text-xs">
            <span className="text-status-paused">Paused {formatRelative(pause.pausedAt, now)}</span>
            {pause.whereIStopped ? (
              <span className="truncate text-hud-muted">Stopped at: {pause.whereIStopped}</span>
            ) : null}
          </span>
        ) : null}

        {git ? (
          <span className="truncate font-mono text-xs text-hud-muted">
            {git.branch ?? 'detached'} · {git.lastCommitMsg ?? 'no message'}
          </span>
        ) : null}

        {worlds.length > 0 ? (
          <span className="mt-auto flex flex-wrap gap-1.5 pt-1">
            {worlds.map((w) => (
              <WorldTag key={w.id} world={w} />
            ))}
          </span>
        ) : null}
      </button>

      {cold ? (
        <div className="flex justify-end px-4 pb-3">
          <button
            type="button"
            onClick={() => openDialog({ kind: 'pause', projectId: p.id })}
            className="rounded-md border border-status-paused/40 px-2.5 py-1 text-xs text-status-paused hover:bg-status-paused/10"
          >
            Pause this?
          </button>
        </div>
      ) : null}

      <CardMenu project={p} open={menuOpen} setOpen={setMenuOpen} />
    </motion.div>
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
        className="flex h-7 w-7 items-center justify-center rounded-md text-hud-muted transition-colors hover:bg-white/[0.08] hover:text-hud-text"
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
            className="absolute top-8 right-0 min-w-36 origin-top-right rounded-lg border border-hud-line bg-hud-raised py-1 shadow-xl shadow-black/50"
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
                className="block w-full px-3 py-1.5 text-left text-sm text-hud-text hover:bg-white/[0.08] focus:bg-white/[0.08]"
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
