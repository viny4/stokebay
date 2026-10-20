import { describe, expect, it } from 'vitest';
import { archivedProjects, visibleProjects } from '../src/shared/filter';
import { glowFor } from '../src/shared/glow';
import { DAY, HOUR } from '../src/shared/time';
import type { ProjectStatus, ProjectSummary } from '../src/shared/types';

const NOW = Date.UTC(2026, 9, 19, 12);

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
    createdAt: NOW,
    updatedAt: NOW,
    lastEventAt: NOW,
    archivedAt: null,
    git: null,
    lastActivityAt: NOW,
    activePause: null,
    ...over,
  };
}

describe('glowFor', () => {
  it.each([
    [0, 'bright'],
    [3 * DAY + 23 * HOUR, 'bright'],
    [4 * DAY, 'medium'],
    [14 * DAY + 23 * HOUR, 'medium'],
    [15 * DAY, 'dim'],
    [29 * DAY + 23 * HOUR, 'dim'],
    [30 * DAY, 'cold'],
    [400 * DAY, 'cold'],
  ])('active project idle for %d ms glows %s', (ago, glow) => {
    expect(glowFor({ status: 'active', lastActivityAt: NOW - ago }, NOW)).toBe(glow);
  });

  it.each(['paused', 'done', 'idea'] as ProjectStatus[])(
    '%s projects never glow or go cold',
    (status) => {
      expect(glowFor({ status, lastActivityAt: NOW - 90 * DAY }, NOW)).toBe('none');
    },
  );
});

describe('visibleProjects', () => {
  const all = [
    project({ title: 'Done thing', status: 'done' }),
    project({ title: 'Old active', lastActivityAt: NOW - 40 * DAY, worldIds: ['music'] }),
    project({ title: 'Fresh active', worldIds: ['coding'] }),
    project({ title: 'Paused one', status: 'paused', worldIds: ['coding'] }),
    project({ title: 'Archived', archivedAt: NOW }),
    project({ title: 'An idea', status: 'idea' }),
  ];

  it('hides archived, orders by status then recency', () => {
    expect(visibleProjects(all, { worldId: null, search: '' }).map((p) => p.title)).toEqual([
      'Fresh active',
      'Old active',
      'Paused one',
      'An idea',
      'Done thing',
    ]);
  });

  it('combines world filter and case-insensitive title search', () => {
    expect(
      visibleProjects(all, { worldId: 'coding', search: 'PAUSED' }).map((p) => p.title),
    ).toEqual(['Paused one']);
    expect(visibleProjects(all, { worldId: 'music', search: '' }).map((p) => p.title)).toEqual([
      'Old active',
    ]);
  });

  it('lists archived projects separately', () => {
    expect(archivedProjects(all).map((p) => p.title)).toEqual(['Archived']);
  });

  it('also shows projects whose notes matched the full-text search', () => {
    expect(
      visibleProjects(all, {
        worldId: null,
        search: 'castling',
        searchMatches: new Set([all[0].id]),
      }).map((p) => p.id),
    ).toEqual([all[0].id]);
  });
});
