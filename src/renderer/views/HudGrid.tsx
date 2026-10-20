// The main HUD: every visible project as a glowing card, plus the sample banner and empty
// states. Filtering lives in the store (worldFilter/search) so the top bar can drive it.
import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useRef } from 'react';
import { visibleProjects } from '../../shared/filter';
import type { Id, World } from '../../shared/types';
import { ProjectCard } from '../components/ProjectCard';
import { Button } from '../components/ui';
import { useHud } from '../store/useHud';
import { columnCount, nextIndex } from './grid-nav';

/** Cap the stagger so a big grid doesn't take seconds to finish appearing. */
const STAGGER_S = 0.035;
const MAX_STAGGERED = 12;

export function HudGrid() {
  const projects = useHud((s) => s.projects);
  const worlds = useHud((s) => s.worlds);
  const now = useHud((s) => s.now);
  const worldFilter = useHud((s) => s.worldFilter);
  const search = useHud((s) => s.search);
  const grid = useRef<HTMLUListElement>(null);

  const visible = useMemo(
    () => visibleProjects(projects, { worldId: worldFilter, search }),
    [projects, worldFilter, search],
  );
  const worldsById = useMemo(() => new Map<Id, World>(worlds.map((w) => [w.id, w])), [worlds]);
  const live = projects.filter((p) => p.archivedAt === null);
  const hasSamples = live.some((p) => p.isSample);

  const onKeyDown = (event: React.KeyboardEvent) => {
    // Only card bodies take part; keys inside menus or the "Pause this?" button pass through.
    const target = event.target as HTMLElement;
    const from = Number(target.dataset.cardIndex);
    if (!grid.current || target.dataset.cardIndex === undefined || Number.isNaN(from)) return;
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const columns = columnCount(getComputedStyle(grid.current).gridTemplateColumns);
    const to = nextIndex(from, event.key, visible.length, columns);
    if (to === null) return;
    event.preventDefault();
    grid.current.querySelector<HTMLElement>(`[data-card-index="${to}"]`)?.focus();
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      {hasSamples ? <SampleBanner /> : null}

      {live.length === 0 ? (
        <NoProjects />
      ) : visible.length === 0 ? (
        <NoMatches />
      ) : (
        <ul
          ref={grid}
          aria-label="Projects"
          onKeyDown={onKeyDown}
          className="relative grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4"
        >
          <AnimatePresence mode="popLayout">
            {visible.map((project, i) => (
              <motion.li
                key={project.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
                transition={{
                  default: { duration: 0.22, delay: Math.min(i, MAX_STAGGERED) * STAGGER_S },
                  layout: { type: 'spring', stiffness: 420, damping: 36 },
                }}
              >
                <ProjectCard project={project} worldsById={worldsById} now={now} index={i} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}

function SampleBanner() {
  const openDialog = useHud((s) => s.openDialog);
  const removeSampleProjects = useHud((s) => s.removeSampleProjects);
  return (
    <div
      role="note"
      className="flex flex-wrap items-center gap-3 rounded-lg border border-status-idea/30 bg-status-idea/10 px-4 py-2.5 text-sm text-hud-text"
    >
      <span>These are sample projects so you can see how cards look.</span>
      <Button
        className="ml-auto"
        onClick={() =>
          openDialog({
            kind: 'confirm',
            title: 'Remove sample projects?',
            message:
              'This deletes the sample projects and their notes for good. Your own projects are not touched.',
            confirmLabel: 'Remove samples',
            danger: true,
            onConfirm: () => removeSampleProjects(),
          })
        }
      >
        Remove samples
      </Button>
    </div>
  );
}

function EmptyState({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto mt-16 flex max-w-md flex-col items-center gap-3 hud-frame hud-frame-sm px-8 py-10 text-center">
      <h2 className="font-display text-sm tracking-[0.2em] text-status-active uppercase">
        {title}
      </h2>
      <p className="text-sm text-hud-muted">{body}</p>
      <div className="mt-2 flex gap-2">{children}</div>
    </div>
  );
}

function NoProjects() {
  const openDialog = useHud((s) => s.openDialog);
  return (
    <EmptyState
      title="Nothing here yet"
      body="Add a project by hand, or scan a folder to find the code projects already on your disk."
    >
      <Button variant="primary" onClick={() => openDialog({ kind: 'ignite' })}>
        New project
      </Button>
      <Button onClick={() => openDialog({ kind: 'scan' })}>Scan a folder</Button>
    </EmptyState>
  );
}

function NoMatches() {
  const setSearch = useHud((s) => s.setSearch);
  const setWorldFilter = useHud((s) => s.setWorldFilter);
  return (
    <EmptyState title="No projects match" body="Try a different search or world.">
      <Button
        onClick={() => {
          setSearch('');
          setWorldFilter(null);
        }}
      >
        Clear filters
      </Button>
    </EmptyState>
  );
}
