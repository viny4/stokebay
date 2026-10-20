import type { Id, ProjectStatus, ProjectSummary } from './types';

const STATUS_ORDER: Record<ProjectStatus, number> = { active: 0, paused: 1, idea: 2, done: 3 };

/**
 * Projects for the grid: not archived, in the chosen world, title containing the search
 * (case-insensitive) or listed in `searchMatches` (projects whose notes matched the full-text
 * search). Active first, then paused, idea, done; most recent activity first.
 */
export function visibleProjects(
  projects: ProjectSummary[],
  filter: { worldId: Id | null; search: string; searchMatches?: ReadonlySet<Id> },
): ProjectSummary[] {
  const query = filter.search.trim().toLowerCase();
  const matches = (p: ProjectSummary) =>
    query === '' || p.title.toLowerCase().includes(query) || !!filter.searchMatches?.has(p.id);
  return projects
    .filter((p) => p.archivedAt === null)
    .filter((p) => filter.worldId === null || p.worldIds.includes(filter.worldId))
    .filter(matches)
    .sort(
      (a, b) =>
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.lastActivityAt - a.lastActivityAt,
    );
}

/** Archived projects, most recently archived first. */
export function archivedProjects(projects: ProjectSummary[]): ProjectSummary[] {
  return projects
    .filter((p) => p.archivedAt !== null)
    .sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0));
}
