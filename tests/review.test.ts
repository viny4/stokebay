import { describe, expect, it } from 'vitest';
import {
  EMPTY_OUTCOME,
  needsReview,
  outcomeText,
  reviewCandidates,
  reviewDue,
} from '../src/shared/review';
import { DAY } from '../src/shared/time';
import type { Pause, ProjectSummary } from '../src/shared/types';

const NOW = Date.UTC(2026, 9, 20, 12);

function project(over: Partial<ProjectSummary> & { title: string }): ProjectSummary {
  return {
    id: over.title,
    path: null,
    status: 'active',
    color: null,
    kind: 'other',
    blueprintId: null,
    partsBin: false,
    isWork: false,
    isSample: false,
    worldIds: [],
    createdAt: NOW - 400 * DAY,
    updatedAt: NOW,
    lastEventAt: NOW,
    archivedAt: null,
    git: null,
    lastActivityAt: NOW,
    activePause: null,
    ...over,
  };
}

function pause(pausedAt: number, remindAt: number | null = null): Pause {
  return {
    id: 'pause',
    projectId: 'p',
    pausedAt,
    resumedAt: null,
    whereIStopped: '',
    nextStep: '',
    gitContext: null,
    remindAt,
  };
}

const ago = (days: number) => NOW - days * DAY;

describe('reviewCandidates', () => {
  it('asks about active projects from two weeks untouched, not fresher ones', () => {
    expect(needsReview(project({ title: 'a', lastActivityAt: ago(14) }), NOW)).toBe(false);
    expect(needsReview(project({ title: 'b', lastActivityAt: ago(15) }), NOW)).toBe(true);
    expect(needsReview(project({ title: 'c', lastActivityAt: ago(90) }), NOW)).toBe(true);
  });

  it('lets ideas sit until they would count as cold', () => {
    const idea = (days: number) =>
      project({ title: 'idea', status: 'idea', lastActivityAt: ago(days) });
    expect(needsReview(idea(29), NOW)).toBe(false);
    expect(needsReview(idea(30), NOW)).toBe(true);
  });

  it('never includes done or archived projects', () => {
    expect(
      needsReview(project({ title: 'd', status: 'done', lastActivityAt: ago(300) }), NOW),
    ).toBe(false);
    expect(
      needsReview(project({ title: 'x', lastActivityAt: ago(300), archivedAt: ago(1) }), NOW),
    ).toBe(false);
  });

  it('includes paused projects only after a month paused and quiet', () => {
    const paused = (pausedDays: number, quietDays = pausedDays, remindAt: number | null = null) =>
      project({
        title: 'p',
        status: 'paused',
        lastActivityAt: ago(quietDays),
        activePause: pause(ago(pausedDays), remindAt),
      });
    expect(needsReview(paused(29), NOW)).toBe(false);
    expect(needsReview(paused(30), NOW)).toBe(true);
    // Kept in an earlier review (or a note added) since the pause: not yet.
    expect(needsReview(paused(60, 3), NOW)).toBe(false);
    // A reminder still ahead: the user already chose when to come back.
    expect(needsReview(paused(60, 60, NOW + DAY), NOW)).toBe(false);
    expect(needsReview(paused(60, 60, ago(1)), NOW)).toBe(true);
  });

  it('orders by oldest activity first', () => {
    const list = reviewCandidates(
      [
        project({ title: 'recent cold', lastActivityAt: ago(20) }),
        project({ title: 'fresh', lastActivityAt: ago(1) }),
        project({ title: 'oldest', status: 'idea', lastActivityAt: ago(200) }),
        project({
          title: 'paused',
          status: 'paused',
          lastActivityAt: ago(45),
          activePause: pause(ago(45)),
        }),
      ],
      NOW,
    );
    expect(list.map((p) => p.title)).toEqual(['oldest', 'paused', 'recent cold']);
  });
});

describe('reviewDue', () => {
  const some = [project({ title: 'cold', lastActivityAt: ago(40) })];

  it('is due when there is something to review and no review yet', () => {
    expect(reviewDue({ lastReviewAt: null }, some, NOW)).toBe(true);
    expect(reviewDue({ lastReviewAt: null }, [], NOW)).toBe(false);
  });

  it('comes back a week after the last review', () => {
    expect(reviewDue({ lastReviewAt: ago(6) }, some, NOW)).toBe(false);
    expect(reviewDue({ lastReviewAt: ago(7) }, some, NOW)).toBe(true);
    expect(reviewDue({ lastReviewAt: ago(30) }, [], NOW)).toBe(false);
  });
});

describe('outcomeText', () => {
  it('lists only what happened', () => {
    expect(outcomeText({ ...EMPTY_OUTCOME, kept: 2, paused: 1, done: 1, letGo: 2 })).toBe(
      '2 kept, 1 paused, 1 done, 2 let go',
    );
    expect(outcomeText(EMPTY_OUTCOME)).toBe('Nothing changed');
  });
});
