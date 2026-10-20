// Generic example projects shown on first run, spread across statuses and ages so every
// card style is visible. They're flagged `isSample` and can be removed in one click.
import { DAY, HOUR } from '../../shared/time';
import type { ActivityEvent, Entry, EventType, Pause, Project, World } from '../../shared/types';
import { defaultSettings, STORE_VERSION, type StoreData } from './repository';

export const WORLD_PALETTE = [
  '#5b8fd1',
  '#d2668f',
  '#c9a03a',
  '#5fa77a',
  '#9277cc',
  '#d9733f',
  '#3f9e9a',
  '#c75c5c',
];

export function createSampleData(now: number, newId: () => string): StoreData {
  const worlds: World[] = ['Coding', 'Music', 'Writing', 'Health', 'Learning'].map((name, i) => ({
    id: newId(),
    name,
    color: WORLD_PALETTE[i % WORLD_PALETTE.length],
    icon: null,
    sortOrder: i,
  }));
  const world = (name: string) => worlds.find((w) => w.name === name)!.id;

  const projects: Project[] = [];
  const pauses: Pause[] = [];
  const entries: Entry[] = [];
  const events: ActivityEvent[] = [];

  const event = (projectId: string, type: EventType, at: number, payload = {}) =>
    events.push({ id: newId(), type, projectId, payload, createdAt: at });

  const project = (
    title: string,
    worldName: string,
    status: Project['status'],
    createdAgo: number,
  ): Project => {
    const createdAt = now - createdAgo;
    const p: Project = {
      id: newId(),
      title,
      path: null,
      status,
      kind: 'other',
      blueprintId: null,
      partsBin: false,
      color: null,
      isWork: false,
      isSample: true,
      worldIds: [world(worldName)],
      createdAt,
      updatedAt: createdAt,
      lastEventAt: createdAt,
      archivedAt: null,
      git: null,
    };
    projects.push(p);
    event(p.id, 'project_created', createdAt, { source: 'sample' });
    return p;
  };

  const note = (p: Project, title: string, body: string, ago: number) => {
    const entry: Entry = {
      id: newId(),
      projectId: p.id,
      type: 'note',
      title,
      body,
      url: null,
      checklist: null,
      file: null,
      moduleId: null,
      createdAt: now - ago,
    };
    entries.push(entry);
    event(p.id, 'note_added', entry.createdAt, { entryId: entry.id });
  };

  const link = (p: Project, title: string, url: string, ago: number) => {
    const entry: Entry = {
      id: newId(),
      projectId: p.id,
      type: 'link',
      title,
      body: '',
      url,
      checklist: null,
      file: null,
      moduleId: null,
      createdAt: now - ago,
    };
    entries.push(entry);
    event(p.id, 'link_added', entry.createdAt, { entryId: entry.id });
  };

  const weather = project('Weather dashboard', 'Coding', 'active', 40 * DAY);
  note(
    weather,
    'Data source',
    'Use the hourly forecast endpoint; cache it for 10 minutes.',
    2 * HOUR,
  );

  const portfolio = project('Portfolio website', 'Coding', 'active', 30 * DAY);
  link(portfolio, 'Layout ideas', 'https://example.com/portfolio-layouts', 6 * DAY);

  const marathon = project('Marathon training plan', 'Health', 'active', 60 * DAY);
  note(marathon, 'Week 6', 'Long run moved to Sunday. Add one easy recovery day.', 20 * DAY);

  const album = project('Guitar album', 'Music', 'active', 90 * DAY);
  note(album, 'Track list', 'Four songs demoed. Track 3 still needs a bridge.', 41 * DAY);

  const chess = project('Chess engine', 'Coding', 'paused', 50 * DAY);
  note(chess, 'Move generation', 'Pseudo-legal moves done, legality check next.', 13 * DAY);
  const pausedAt = now - 12 * DAY;
  const pause: Pause = {
    id: newId(),
    projectId: chess.id,
    pausedAt,
    resumedAt: null,
    whereIStopped: 'Move generation works; castling rules are half written.',
    nextStep: 'Finish castling, then add perft tests to check move counts.',
    gitContext: null,
    remindAt: null,
  };
  pauses.push(pause);
  event(chess.id, 'project_paused', pausedAt, { pauseId: pause.id });

  project('Short story collection', 'Writing', 'idea', 9 * DAY);

  const spanish = project('Learn Spanish basics', 'Learning', 'done', 120 * DAY);
  event(spanish.id, 'project_updated', now - 45 * DAY, { fields: ['status'] });

  for (const p of projects) {
    p.lastEventAt = Math.max(...events.filter((e) => e.projectId === p.id).map((e) => e.createdAt));
    p.updatedAt = p.lastEventAt;
  }

  return {
    version: STORE_VERSION,
    settings: defaultSettings(),
    worlds,
    projects,
    pauses,
    entries,
    events,
    modules: [],
    parts: [],
    nodes: [],
    edges: [],
  };
}
