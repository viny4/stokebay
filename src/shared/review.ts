// The weekly review: which projects need a decision, and when to offer the review again.
// Pure functions so the sidebar, the grid banner and the review screen all agree.
import { glowFor } from './glow';
import { DAY, daysSince } from './time';
import type { AppSettings, ProjectSummary } from './types';

/** Offer the review again this long after the last one was finished. */
export const REVIEW_EVERY_DAYS = 7;
/** A pause older than this (with nothing happening since) is worth a second look. */
export const PAUSED_REVIEW_AFTER_DAYS = 30;

/** Whether one project needs a decision right now. */
export function needsReview(project: ProjectSummary, now: number): boolean {
  if (project.archivedAt !== null) return false;
  switch (project.status) {
    case 'active': {
      // 'dim' (two weeks untouched) already counts: the review is most useful before a
      // project is fully cold, and auto-pause may take it out of 'active' at 30 days.
      const glow = glowFor(project, now);
      return glow === 'dim' || glow === 'cold';
    }
    case 'idea':
      // Ideas are allowed to sit longer; only ask once they'd count as cold.
      return glowFor({ status: 'active', lastActivityAt: project.lastActivityAt }, now) === 'cold';
    case 'paused': {
      const pause = project.activePause;
      // A reminder still ahead means the user already chose when to come back.
      if (pause?.remindAt != null && pause.remindAt > now) return false;
      const pausedAt = pause?.pausedAt ?? project.lastActivityAt;
      // Anything since the pause (a note, or "keep" in an earlier review) restarts the clock.
      return (
        daysSince(pausedAt, now) >= PAUSED_REVIEW_AFTER_DAYS &&
        daysSince(project.lastActivityAt, now) >= PAUSED_REVIEW_AFTER_DAYS
      );
    }
    case 'done':
      return false;
  }
}

/** Projects that need a decision, the ones that have waited longest first. */
export function reviewCandidates(projects: ProjectSummary[], now: number): ProjectSummary[] {
  return projects
    .filter((p) => needsReview(p, now))
    .sort((a, b) => a.lastActivityAt - b.lastActivityAt || a.title.localeCompare(b.title));
}

/** Due when something needs a decision and the last review was a week ago or never. */
export function reviewDue(
  settings: Pick<AppSettings, 'lastReviewAt'>,
  candidates: readonly unknown[],
  now: number,
): boolean {
  if (candidates.length === 0) return false;
  return settings.lastReviewAt === null || now - settings.lastReviewAt >= REVIEW_EVERY_DAYS * DAY;
}

export interface ReviewOutcome {
  kept: number;
  paused: number;
  resumed: number;
  done: number;
  letGo: number;
  skipped: number;
}

export const EMPTY_OUTCOME: ReviewOutcome = {
  kept: 0,
  paused: 0,
  resumed: 0,
  done: 0,
  letGo: 0,
  skipped: 0,
};

/** "2 kept, 1 paused, 1 done, 2 let go"; zero counts are left out. */
export function outcomeText(outcome: ReviewOutcome): string {
  const parts: [number, string][] = [
    [outcome.kept, 'kept'],
    [outcome.resumed, 'resumed'],
    [outcome.paused, 'paused'],
    [outcome.done, 'done'],
    [outcome.letGo, 'let go'],
    [outcome.skipped, 'skipped'],
  ];
  const said = parts.filter(([n]) => n > 0).map(([n, word]) => `${n} ${word}`);
  return said.length > 0 ? said.join(', ') : 'Nothing changed';
}
