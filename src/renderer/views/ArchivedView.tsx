// Archived projects (prototype step 4). Archiving is the app's "delete", so this is the only
// place a project can be removed for good, and that always goes through a confirmation.
import { AnimatePresence, motion } from 'framer-motion';
import { memo, useMemo } from 'react';
import { archivedProjects } from '../../shared/filter';
import { formatRelative } from '../../shared/time';
import type { ProjectSummary, World } from '../../shared/types';
import { Button, StatusBadge, WorldTag } from '../components/ui';
import { guard, useHud } from '../store/useHud';

export function ArchivedView() {
  const projects = useHud((s) => s.projects);
  const worlds = useHud((s) => s.worlds);
  const now = useHud((s) => s.now);
  const archived = useMemo(() => archivedProjects(projects), [projects]);
  const worldById = useMemo(() => new Map(worlds.map((w) => [w.id, w])), [worlds]);

  return (
    <section aria-labelledby="archived-heading" className="mx-auto max-w-3xl px-8 py-10">
      <h2 id="archived-heading" className="text-3xl font-semibold tracking-tight text-ink">
        Archive
      </h2>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
        Archived projects are hidden from the grid but keep all their notes, links and history.
        Restore one to bring it back, or delete it permanently.
      </p>

      {archived.length === 0 ? (
        <p className="mt-8 rounded-lg border border-dashed border-line px-6 py-12 text-center text-sm text-muted">
          Nothing archived.
        </p>
      ) : (
        <ul className="panel mt-8 flex flex-col divide-y divide-line overflow-hidden">
          <AnimatePresence initial={false}>
            {archived.map((p) => (
              <ArchivedRow key={p.id} project={p} now={now} worldById={worldById} />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}

const ArchivedRow = memo(function ArchivedRow({
  project,
  now,
  worldById,
}: {
  project: ProjectSummary;
  now: number;
  worldById: Map<string, World>;
}) {
  const restoreProject = useHud((s) => s.restoreProject);
  const deleteProject = useHud((s) => s.deleteProject);
  const showToast = useHud((s) => s.showToast);
  const openDialog = useHud((s) => s.openDialog);
  const titleId = `archived-${project.id}`;
  const projectWorlds = project.worldIds.flatMap((id) => worldById.get(id) ?? []);

  const restore = () =>
    guard(async () => {
      await restoreProject(project.id);
      showToast('Restored to the grid.');
    });

  const confirmDelete = () =>
    openDialog({
      kind: 'confirm',
      title: 'Delete permanently?',
      message: `"${project.title}" and all its notes, links and history will be removed from this computer. This can't be undone.`,
      confirmLabel: 'Delete permanently',
      danger: true,
      onConfirm: () => deleteProject(project.id),
    });

  return (
    <motion.li
      layout
      aria-labelledby={titleId}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -8, transition: { duration: 0.16 } }}
      className="flex flex-wrap items-center gap-4 px-4 py-3"
    >
      <div className="min-w-0 flex-1">
        <h3 id={titleId} className="truncate text-sm font-medium text-ink">
          {project.title}
        </h3>
        <div className="mt-1 flex flex-wrap items-center gap-2.5">
          <StatusBadge status={project.status} />
          {project.archivedAt !== null ? (
            <span className="text-xs text-muted">
              Archived {formatRelative(project.archivedAt, now)}
            </span>
          ) : null}
          {projectWorlds.map((w) => (
            <WorldTag key={w.id} world={w} />
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <Button aria-label={`Restore ${project.title}`} onClick={restore}>
          Restore
        </Button>
        <Button
          variant="danger"
          aria-label={`Delete ${project.title} permanently`}
          onClick={confirmDelete}
        >
          Delete permanently
        </Button>
      </div>
    </motion.li>
  );
});
