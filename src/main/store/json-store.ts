import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  ActivityEvent,
  AppSettings,
  CanvasEdge,
  CanvasNode,
  Entry,
  Id,
  Module,
  Part,
  Pause,
  Project,
  SearchHit,
  World,
} from '../../shared/types';
import { createLogger } from '../logging/logger';
import { newId } from './ids';
import { migrateStoreData } from './migrate';
import {
  STORE_VERSION,
  type NewProject,
  type ProjectChanges,
  type ProjectRepository,
  type RepositoryTx,
  type StoreData,
} from './repository';

const log = createLogger('store');

export const DATA_FILE = 'projects.json';
export const BACKUP_COUNT = 5;

/** A brand-new install: nothing yet, and first-run setup still to do. */
export function emptyStoreData(): StoreData {
  return {
    version: STORE_VERSION,
    settings: {
      onboarded: false,
      backupFolder: null,
      lastExternalBackupAt: null,
      editor: 'vscode',
    },
    worlds: [],
    projects: [],
    pauses: [],
    entries: [],
    events: [],
    modules: [],
    parts: [],
    nodes: [],
    edges: [],
  };
}

type ReadResult = { kind: 'ok'; data: StoreData } | { kind: 'missing' } | { kind: 'corrupt' };

export class JsonStore implements ProjectRepository {
  private data: StoreData;
  private writeChain: Promise<void> = Promise.resolve();
  private readonly tx: RepositoryTx;

  private constructor(
    readonly file: string,
    data: StoreData,
  ) {
    this.data = data;
    this.tx = this.createTx();
  }

  /**
   * Opens (or creates) the data file in `dir`. A corrupt file is set aside, never overwritten,
   * and the newest readable backup is used instead.
   */
  static async open(dir: string, options: { seed?: () => StoreData } = {}): Promise<JsonStore> {
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, DATA_FILE);
    const main = await readStoreFile(file);
    if (main.kind === 'ok') return new JsonStore(file, main.data);

    if (main.kind === 'corrupt') {
      const kept = `${file}.corrupt-${Date.now()}`;
      await fs.rename(file, kept);
      log.warn('data file unreadable; kept it aside', { kept: path.basename(kept) });
      for (let i = 1; i <= BACKUP_COUNT; i++) {
        const backup = await readStoreFile(`${file}.${i}`);
        if (backup.kind === 'ok') {
          log.warn('restored from backup', { backup: i });
          const store = new JsonStore(file, backup.data);
          await store.persist();
          return store;
        }
      }
      log.error('no readable backup; starting fresh');
    }

    const store = new JsonStore(file, options.seed?.() ?? emptyStoreData());
    await store.persist();
    return store;
  }

  getSettings(): AppSettings {
    return { ...this.data.settings };
  }

  listWorlds(): World[] {
    return [...this.data.worlds].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  listProjects(): Project[] {
    return [...this.data.projects];
  }

  getProject(id: Id): Project | undefined {
    return this.data.projects.find((p) => p.id === id);
  }

  activePause(projectId: Id): Pause | undefined {
    return this.data.pauses.find((p) => p.projectId === projectId && p.resumedAt === null);
  }

  listEntries(projectId: Id): Entry[] {
    return newestFirst(this.data.entries.filter((e) => e.projectId === projectId));
  }

  getEntry(id: Id): Entry | undefined {
    return this.data.entries.find((e) => e.id === id);
  }

  listEvents(projectId: Id): ActivityEvent[] {
    return newestFirst(this.data.events.filter((e) => e.projectId === projectId));
  }

  listRecentEvents(projectIds: Id[], since: number, limit: number): ActivityEvent[] {
    const ids = new Set(projectIds);
    return newestFirst(
      this.data.events.filter(
        (e) => e.projectId !== null && ids.has(e.projectId) && e.createdAt >= since,
      ),
    ).slice(0, limit);
  }

  listModules(projectId: Id): Module[] {
    return this.data.modules
      .filter((m) => m.projectId === projectId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  getModule(id: Id): Module | undefined {
    return this.data.modules.find((m) => m.id === id);
  }

  listParts(projectId: Id): Part[] {
    return this.data.parts
      .filter((p) => p.projectId === projectId)
      .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
  }

  getPart(id: Id): Part | undefined {
    return this.data.parts.find((p) => p.id === id);
  }

  listNodes(projectId: Id): CanvasNode[] {
    return this.data.nodes.filter((n) => n.projectId === projectId);
  }

  getNode(id: Id): CanvasNode | undefined {
    return this.data.nodes.find((n) => n.id === id);
  }

  listEdges(projectId: Id): CanvasEdge[] {
    return this.data.edges.filter((e) => e.projectId === projectId);
  }

  /** Plain substring search; the real full-text search lives in SqliteStore. */
  search(query: string, limit = 30): SearchHit[] {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];
    const matches = (text: string) => words.every((w) => text.toLowerCase().includes(w));
    const byId = new Map(this.data.projects.map((p) => [p.id, p]));
    const hits: SearchHit[] = [];
    for (const p of this.data.projects) {
      if (hits.length < limit && matches(p.title)) {
        hits.push({
          kind: 'project',
          projectId: p.id,
          projectTitle: p.title,
          entryId: null,
          entryType: null,
          title: p.title,
          snippet: p.title,
          archived: p.archivedAt !== null,
        });
      }
    }
    let entryHits = 0;
    for (const e of this.data.entries) {
      const project = byId.get(e.projectId);
      if (!project || entryHits >= limit || !matches(`${e.title} ${e.body}`)) continue;
      entryHits++;
      hits.push({
        kind: 'entry',
        projectId: project.id,
        projectTitle: project.title,
        entryId: e.id,
        entryType: e.type,
        title: e.title,
        snippet: e.body.slice(0, 120),
        archived: project.archivedAt !== null,
      });
    }
    return hits;
  }

  /** A deep copy of everything (used to move old data into the database). */
  snapshot(): StoreData {
    return structuredClone(this.data);
  }

  async transaction<T>(fn: (tx: RepositoryTx) => T): Promise<T> {
    const before = structuredClone(this.data);
    let result: T;
    try {
      result = fn(this.tx);
    } catch (err) {
      this.data = before;
      throw err;
    }
    await this.persist();
    return result;
  }

  /** Waits for every queued write to finish (used by tests and on shutdown). */
  async flush(): Promise<void> {
    await this.writeChain;
  }

  private persist(): Promise<void> {
    // Serialise now so the file reflects this exact moment, then queue the write behind any
    // write still in progress. A failed write doesn't block later ones.
    const content = `${JSON.stringify(this.data, null, 2)}\n`;
    const run = this.writeChain.then(() => writeWithBackups(this.file, content));
    this.writeChain = run.catch((err: unknown) => {
      log.error('saving data failed', { error: err instanceof Error ? err.message : String(err) });
    });
    return run;
  }

  private requireProject(id: Id): Project {
    const project = this.getProject(id);
    if (!project) throw new Error(`Project ${id} not found`);
    return project;
  }

  private createTx(): RepositoryTx {
    return {
      updateSettings: (changes) => {
        Object.assign(this.data.settings, changes);
        return { ...this.data.settings };
      },

      importData: (data) => {
        this.data.worlds.push(...data.worlds);
        this.data.projects.push(...data.projects);
        this.data.pauses.push(...data.pauses);
        this.data.entries.push(...data.entries);
        this.data.events.push(...data.events);
      },

      createWorld: ({ name, color }) => {
        const world: World = {
          id: newId(),
          name,
          color,
          icon: null,
          sortOrder: this.data.worlds.reduce((max, w) => Math.max(max, w.sortOrder), -1) + 1,
        };
        this.data.worlds.push(world);
        return world;
      },

      updateWorld: (id, changes) => {
        const world = this.data.worlds.find((w) => w.id === id);
        if (!world) throw new Error(`World ${id} not found`);
        Object.assign(world, changes);
        return world;
      },

      deleteWorld: (id) => {
        this.data.worlds = this.data.worlds.filter((w) => w.id !== id);
        for (const project of this.data.projects) {
          project.worldIds = project.worldIds.filter((w) => w !== id);
        }
      },

      createProject: (input: NewProject) => {
        const project: Project = {
          id: newId(),
          title: input.title,
          path: input.path,
          status: input.status,
          kind: input.kind ?? 'other',
          blueprintId: input.blueprintId ?? null,
          partsBin: input.partsBin ?? false,
          color: null,
          isWork: false,
          isSample: input.isSample ?? false,
          worldIds: [...input.worldIds],
          createdAt: input.createdAt,
          updatedAt: input.createdAt,
          lastEventAt: input.createdAt,
          archivedAt: null,
          git: null,
        };
        this.data.projects.push(project);
        return project;
      },

      updateProject: (id, changes: ProjectChanges, at) => {
        const project = this.requireProject(id);
        Object.assign(project, changes, { updatedAt: at });
        if (changes.worldIds) project.worldIds = [...changes.worldIds];
        return project;
      },

      archiveProject: (id, at) => {
        const project = this.requireProject(id);
        project.archivedAt = at;
        project.updatedAt = at;
        return project;
      },

      restoreProject: (id, at) => {
        const project = this.requireProject(id);
        project.archivedAt = null;
        project.updatedAt = at;
        return project;
      },

      deleteProject: (id) => {
        this.requireProject(id);
        this.data.projects = this.data.projects.filter((p) => p.id !== id);
        this.data.pauses = this.data.pauses.filter((p) => p.projectId !== id);
        this.data.entries = this.data.entries.filter((e) => e.projectId !== id);
        this.data.events = this.data.events.filter((e) => e.projectId !== id);
        this.data.modules = this.data.modules.filter((m) => m.projectId !== id);
        this.data.parts = this.data.parts.filter((p) => p.projectId !== id);
        this.data.nodes = this.data.nodes.filter((n) => n.projectId !== id);
        this.data.edges = this.data.edges.filter((e) => e.projectId !== id);
      },

      setGitInfo: (id, git) => {
        this.requireProject(id).git = git;
      },

      addPause: (input) => {
        this.requireProject(input.projectId);
        const pause: Pause = { ...input, id: newId(), resumedAt: null };
        this.data.pauses.push(pause);
        return pause;
      },

      closePause: (id, resumedAt) => {
        const pause = this.data.pauses.find((p) => p.id === id);
        if (!pause) throw new Error(`Pause ${id} not found`);
        pause.resumedAt = resumedAt;
        return pause;
      },

      addEntry: (input) => {
        this.requireProject(input.projectId);
        const entry: Entry = {
          checklist: null,
          file: null,
          moduleId: null,
          ...input,
          id: newId(),
        };
        this.data.entries.push(entry);
        return entry;
      },

      updateEntry: (id, changes) => {
        const entry = this.data.entries.find((e) => e.id === id);
        if (!entry) throw new Error(`Entry ${id} not found`);
        Object.assign(entry, changes);
        return entry;
      },

      deleteEntry: (id) => {
        this.data.entries = this.data.entries.filter((e) => e.id !== id);
      },

      createModule: (input) => {
        this.requireProject(input.projectId);
        const siblings = this.data.modules.filter((m) => m.projectId === input.projectId);
        const module: Module = {
          ...input,
          id: newId(),
          sortOrder: siblings.reduce((max, m) => Math.max(max, m.sortOrder), -1) + 1,
        };
        this.data.modules.push(module);
        return module;
      },

      updateModule: (id, changes) => {
        const module = this.data.modules.find((m) => m.id === id);
        if (!module) throw new Error(`Module ${id} not found`);
        Object.assign(module, changes);
        return module;
      },

      deleteModule: (id) => {
        this.data.modules = this.data.modules.filter((m) => m.id !== id);
        for (const entry of this.data.entries) if (entry.moduleId === id) entry.moduleId = null;
        for (const part of this.data.parts) if (part.moduleId === id) part.moduleId = null;
      },

      addPart: (input) => {
        this.requireProject(input.projectId);
        const part: Part = { ...input, id: newId() };
        this.data.parts.push(part);
        return part;
      },

      updatePart: (id, changes, at) => {
        const part = this.data.parts.find((p) => p.id === id);
        if (!part) throw new Error(`Part ${id} not found`);
        Object.assign(part, changes, { updatedAt: at });
        return part;
      },

      deletePart: (id) => {
        this.data.parts = this.data.parts.filter((p) => p.id !== id);
      },

      addNode: (input) => {
        this.requireProject(input.projectId);
        const node: CanvasNode = { ...input, id: newId() };
        this.data.nodes.push(node);
        return node;
      },

      updateNode: (id, changes) => {
        const node = this.data.nodes.find((n) => n.id === id);
        if (!node) throw new Error(`Canvas node ${id} not found`);
        Object.assign(node, changes);
        return node;
      },

      deleteNode: (id) => {
        this.data.nodes = this.data.nodes.filter((n) => n.id !== id);
        this.data.edges = this.data.edges.filter((e) => e.fromNodeId !== id && e.toNodeId !== id);
      },

      addEdge: (input) => {
        const edge: CanvasEdge = { ...input, id: newId() };
        this.data.edges.push(edge);
        return edge;
      },

      deleteEdge: (id) => {
        this.data.edges = this.data.edges.filter((e) => e.id !== id);
      },

      addEvent: (input) => {
        const event: ActivityEvent = { ...input, id: newId() };
        this.data.events.push(event);
        if (input.projectId) {
          const project = this.requireProject(input.projectId);
          project.lastEventAt = Math.max(project.lastEventAt, input.createdAt);
        }
        return event;
      },
    };
  }
}

function newestFirst<T extends { createdAt: number; id: string }>(items: T[]): T[] {
  return items.sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1));
}

async function readStoreFile(file: string): Promise<ReadResult> {
  let text: string;
  try {
    text = await fs.readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { kind: 'missing' };
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { kind: 'corrupt' };
  }
  // Older files are upgraded in memory; the next save writes the new format.
  const data = migrateStoreData(parsed);
  return data ? { kind: 'ok', data } : { kind: 'corrupt' };
}

/**
 * Keeps the previous file as `.1` (older ones shift up to `.5`), then writes atomically:
 * temp file, fsync, rename. A crash mid-write leaves the old file intact.
 */
export async function writeWithBackups(file: string, content: string): Promise<void> {
  if (await exists(file)) {
    for (let i = BACKUP_COUNT - 1; i >= 1; i--) {
      await renameIfExists(`${file}.${i}`, `${file}.${i + 1}`);
    }
    await fs.copyFile(file, `${file}.1`);
  }
  const tmp = `${file}.tmp`;
  const handle = await fs.open(tmp, 'w');
  try {
    await handle.writeFile(content, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(tmp, file);
}

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function renameIfExists(from: string, to: string): Promise<void> {
  try {
    await fs.rename(from, to);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}
