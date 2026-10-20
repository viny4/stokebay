// The project grid: every visible project as a card, plus the sample banner and empty states.
// Filtering lives in the store (worldFilter/search) so the toolbar can drive it.
import { AnimatePresence, motion } from 'framer-motion';
import { useDeferredValue, useMemo, useRef, useState } from 'react';
import { visibleProjects } from '../../shared/filter';
import { reviewCandidates, reviewDue } from '../../shared/review';
import type { Id, World } from '../../shared/types';
import { AreaOverview } from '../components/AreaOverview';
import { ProjectCard } from '../components/ProjectCard';
import { Button } from '../components/ui';
import { useHud } from '../store/useHud';
import { columnCount, nextIndex } from './grid-nav';
import { startWeeklyReview } from './WeeklyReview';

/** Cap the stagger so a big grid doesn't take seconds to finish appearing. */
const STAGGER_S = 0.035;
const MAX_STAGGERED = 12;
/** Above this many cards, enter/exit/reflow animations cost more than they add: skip them. */
const MAX_ANIMATED = 60;
/** "Not now" on the review banner lasts until the app restarts, not forever. */
let reviewBannerDismissed = false;

export function HudGrid() {
  const projects = useHud((s) => s.projects);
  const worlds = useHud((s) => s.worlds);
  const now = useHud((s) => s.now);
  const worldFilter = useHud((s) => s.worldFilter);
  // Deferred: the search field updates on every key, the grid catches up when it can.
  const search = useDeferredValue(useHud((s) => s.search));
  const searchMatches = useDeferredValue(useHud((s) => s.searchMatches));
  const grid = useRef<HTMLUListElement>(null);

  const visible = useMemo(
    () => visibleProjects(projects, { worldId: worldFilter, search, searchMatches }),
    [projects, worldFilter, search, searchMatches],
  );
  const worldsById = useMemo(() => new Map<Id, World>(worlds.map((w) => [w.id, w])), [worlds]);
  const live = projects.filter((p) => p.archivedAt === null);
  const hasSamples = live.some((p) => p.isSample);
  const area = worldFilter ? worldsById.get(worldFilter) : undefined;
  const areaProjects = useMemo(
    () => (worldFilter ? projects.filter((p) => p.worldIds.includes(worldFilter)) : []),
    [projects, worldFilter],
  );

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
      {search.trim() === '' ? <ReviewBanner /> : null}
      {area && search.trim() === '' ? <AreaOverview area={area} projects={areaProjects} /> : null}

      {live.length === 0 ? (
        <NoProjects />
      ) : area && visible.length === 0 && search.trim() === '' ? (
        <p className="text-sm text-muted">
          No projects in {area.name} yet. Add one from New project, or pick this area when editing a
          project.
        </p>
      ) : visible.length === 0 ? (
        <NoMatches />
      ) : (
        <ul
          // A different area is a different list: swap it instead of animating cards across.
          key={worldFilter ?? 'all'}
          ref={grid}
          aria-label="Projects"
          onKeyDown={onKeyDown}
          className="relative grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3"
        >
          {visible.length > MAX_ANIMATED ? (
            visible.map((project, i) => (
              <li key={project.id}>
                <ProjectCard project={project} worldsById={worldsById} now={now} index={i} />
              </li>
            ))
          ) : (
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
          )}
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
      className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm text-muted shadow-card"
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

function ReviewBanner() {
  const projects = useHud((s) => s.projects);
  const now = useHud((s) => s.now);
  const lastReviewAt = useHud((s) => s.settings.lastReviewAt);
  const [dismissed, setDismissed] = useState(reviewBannerDismissed);
  const candidates = useMemo(() => reviewCandidates(projects, now), [projects, now]);

  if (dismissed || !reviewDue({ lastReviewAt }, candidates, now)) return null;
  const n = candidates.length;
  return (
    <div
      role="note"
      className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm text-muted shadow-card"
    >
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
      <span>
        {n === 1 ? "1 project hasn't" : `${n} projects haven't`} moved in a while. Weekly review
        takes about two minutes.
      </span>
      <div className="ml-auto flex gap-2">
        <Button
          onClick={() => {
            reviewBannerDismissed = true;
            setDismissed(true);
          }}
        >
          Not now
        </Button>
        <Button variant="primary" onClick={startWeeklyReview}>
          Start
        </Button>
      </div>
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
    <div className="mx-auto mt-16 flex max-w-md flex-col items-center gap-3 panel px-8 py-10 text-center">
      <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
      <p className="text-sm text-muted">{body}</p>
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
      <Button onClick={() => openDialog({ kind: 'scan' })}>Find code projects</Button>
    </EmptyState>
  );
}

function NoMatches() {
  const setSearch = useHud((s) => s.setSearch);
  const setWorldFilter = useHud((s) => s.setWorldFilter);
  return (
    <EmptyState title="No projects match" body="Try a different search or area.">
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
