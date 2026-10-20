// Which projects the capture window offers, which one it picks first, and the type-to-filter.
import type { Id, ProjectSummary } from '../../shared/types';

/** Projects a note can go to (archived ones can't be changed), most recently active first. */
export function captureTargets(projects: ProjectSummary[]): ProjectSummary[] {
  return projects
    .filter((p) => p.archivedAt === null)
    .sort((a, b) => b.lastActivityAt - a.lastActivityAt);
}

/** The project the last capture went to, if it's still there; else the most recently active. */
export function defaultTarget(targets: ProjectSummary[], lastId: Id | null): ProjectSummary | null {
  return targets.find((p) => p.id === lastId) ?? targets[0] ?? null;
}

/**
 * Every typed word must appear in the title. Titles that start with the query come first;
 * otherwise the order (most recent first) is kept.
 */
export function filterTargets(targets: ProjectSummary[], query: string): ProjectSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return targets;
  const words = q.split(/\s+/);
  const matches = targets.filter((p) => {
    const title = p.title.toLowerCase();
    return words.every((w) => title.includes(w));
  });
  const starts = matches.filter((p) => p.title.toLowerCase().startsWith(q));
  return [...starts, ...matches.filter((p) => !starts.includes(p))];
}
