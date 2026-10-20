// Where everything sits in the Universe view. Pure, so it's tested without a screen.
// Coordinates: the user is at (0, 0); the galaxy fits in a circle of radius UNIVERSE_RADIUS.
// Each world owns an angular slice (sized by how many projects it has); a project's distance
// from the centre grows with time since its last activity, so cold projects drift outward.
import { glowFor, type Glow } from './glow';
import { daysSince } from './time';
import type { Id, ProjectStatus, ProjectSummary, World } from './types';

export const UNIVERSE_RADIUS = 1000;
const CORE = 150;
const EDGE = 950;
const FAR_DAYS = 120;

export interface Sector {
  /** null = projects without a world. */
  worldId: Id | null;
  name: string;
  color: string;
  startAngle: number;
  endAngle: number;
  count: number;
}

export interface Star {
  id: Id;
  title: string;
  status: ProjectStatus;
  glow: Glow;
  days: number;
  x: number;
  y: number;
  angle: number;
  radius: number;
  worldId: Id | null;
}

export interface Orbit {
  days: number;
  label: string;
  radius: number;
}

export interface UniverseLayout {
  sectors: Sector[];
  stars: Star[];
  orbits: Orbit[];
}

/** Distance from the centre for a project idle for `days`: quick at first, then slowing. */
export function orbitRadius(days: number): number {
  const t = Math.min(1, Math.log1p(Math.max(0, days)) / Math.log1p(FAR_DAYS));
  return CORE + (EDGE - CORE) * t;
}

/** Stable 0..1 number from an id, so a star doesn't jump around between renders. */
function hash01(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
}

const UNSORTED_COLOR = '#7f8ea6';

export function layoutUniverse(
  projects: readonly ProjectSummary[],
  worlds: readonly World[],
  now: number,
): UniverseLayout {
  const visible = projects.filter((p) => p.archivedAt === null);
  const known = new Set(worlds.map((w) => w.id));
  // A project with several worlds lives in its first known one.
  const home = (p: ProjectSummary) => p.worldIds.find((id) => known.has(id)) ?? null;

  const groups = new Map<Id | null, ProjectSummary[]>();
  for (const w of worlds) groups.set(w.id, []);
  groups.set(null, []);
  for (const p of visible) groups.get(home(p))!.push(p);

  // Every world with projects gets a slice; tiny worlds still get a readable minimum.
  const used = [...groups].filter(([, list]) => list.length > 0);
  const weights = used.map(([, list]) => Math.max(list.length, Math.max(1, visible.length * 0.08)));
  const total = weights.reduce((a, b) => a + b, 0);

  const sectors: Sector[] = [];
  const stars: Star[] = [];
  let angle = -Math.PI / 2; // first slice starts at the top
  used.forEach(([worldId, list], i) => {
    const span = (2 * Math.PI * weights[i]) / total;
    const world = worlds.find((w) => w.id === worldId);
    sectors.push({
      worldId,
      name: world?.name ?? 'No world',
      color: world?.color ?? UNSORTED_COLOR,
      startAngle: angle,
      endAngle: angle + span,
      count: list.length,
    });

    // Spread the slice's projects evenly, nudged a little so equal ages don't line up.
    const margin = Math.min(0.12, span * 0.1);
    const sorted = [...list].sort((a, b) => a.id.localeCompare(b.id));
    sorted.forEach((p, j) => {
      const slot = (j + 0.5) / sorted.length;
      const jitter = (hash01(p.id) - 0.5) * (0.6 / sorted.length);
      const a = angle + margin + (span - 2 * margin) * Math.min(1, Math.max(0, slot + jitter));
      const days = daysSince(p.lastActivityAt, now);
      const r = orbitRadius(days) + (hash01(`${p.id}r`) - 0.5) * 30;
      stars.push({
        id: p.id,
        title: p.title,
        status: p.status,
        glow: glowFor(p, now),
        days,
        x: Math.cos(a) * r,
        y: Math.sin(a) * r,
        angle: a,
        radius: r,
        worldId,
      });
    });
    angle += span;
  });

  const orbits: Orbit[] = [
    { days: 7, label: '1 week' },
    { days: 30, label: '1 month' },
    { days: 90, label: '3 months' },
  ].map((o) => ({ ...o, radius: orbitRadius(o.days) }));

  return { sectors, stars, orbits };
}
