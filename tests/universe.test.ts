import { describe, expect, it } from 'vitest';
import { DAY } from '../src/shared/time';
import type { ProjectSummary, World } from '../src/shared/types';
import { layoutUniverse, orbitRadius, UNIVERSE_RADIUS } from '../src/shared/universe';

const NOW = Date.UTC(2026, 9, 20, 12);

const world = (id: string, name: string): World => ({
  id,
  name,
  color: '#38bdf8',
  icon: null,
  sortOrder: 0,
});

function project(id: string, over: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    id,
    title: id,
    path: null,
    status: 'active',
    kind: 'other',
    blueprintId: null,
    partsBin: false,
    color: null,
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

describe('orbitRadius', () => {
  it('moves outward as a project goes cold, staying inside the galaxy', () => {
    expect(orbitRadius(0)).toBeLessThan(orbitRadius(7));
    expect(orbitRadius(7)).toBeLessThan(orbitRadius(30));
    expect(orbitRadius(30)).toBeLessThan(orbitRadius(90));
    expect(orbitRadius(10_000)).toBeLessThan(UNIVERSE_RADIUS);
    expect(orbitRadius(-5)).toBe(orbitRadius(0));
  });
});

describe('layoutUniverse', () => {
  const worlds = [world('w1', 'Coding'), world('w2', 'Music')];

  it('gives each world with projects a slice, plus "No area", covering the full circle', () => {
    const { sectors } = layoutUniverse(
      [project('a', { worldIds: ['w1'] }), project('b', { worldIds: ['w1'] }), project('c')],
      worlds,
      NOW,
    );
    expect(sectors.map((s) => s.name)).toEqual(['Coding', 'No area']);
    const covered = sectors.reduce((sum, s) => sum + (s.endAngle - s.startAngle), 0);
    expect(covered).toBeCloseTo(2 * Math.PI);
  });

  it('places stars inside their own world slice', () => {
    const { sectors, stars } = layoutUniverse(
      [project('a', { worldIds: ['w1'] }), project('b', { worldIds: ['w2'] })],
      worlds,
      NOW,
    );
    for (const star of stars) {
      const sector = sectors.find((s) => s.worldId === star.worldId)!;
      expect(star.angle).toBeGreaterThanOrEqual(sector.startAngle);
      expect(star.angle).toBeLessThanOrEqual(sector.endAngle);
    }
  });

  it('puts cold projects further out than fresh ones', () => {
    const { stars } = layoutUniverse(
      [project('fresh'), project('cold', { lastActivityAt: NOW - 60 * DAY })],
      [],
      NOW,
    );
    const r = (id: string) => stars.find((s) => s.id === id)!.radius;
    expect(r('cold')).toBeGreaterThan(r('fresh'));
    expect(stars.find((s) => s.id === 'cold')?.glow).toBe('cold');
  });

  it('leaves out archived projects and is stable between renders', () => {
    const list = [project('a', { worldIds: ['w1'] }), project('gone', { archivedAt: NOW })];
    const first = layoutUniverse(list, worlds, NOW);
    expect(first.stars.map((s) => s.id)).toEqual(['a']);
    expect(layoutUniverse(list, worlds, NOW)).toEqual(first);
  });

  it('handles an empty universe', () => {
    expect(layoutUniverse([], worlds, NOW)).toMatchObject({ sectors: [], stars: [] });
  });
});
