// The SQLite implementation of the storage boundary. It uses Node's built-in `node:sqlite`
// (bundled with Electron), so there is no native module to rebuild and tests run the very same
// engine as the app. Every write happens inside one SQL transaction: all or nothing.
import fs from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import {
  SNIPPET_CLOSE,
  SNIPPET_OPEN,
  type ActivityEvent,
  type AppSettings,
  type CanvasEdge,
  type CanvasNode,
  type Entry,
  type GitInfo,
  type GitWorkState,
  type Id,
  type Module,
  type Part,
  type Pause,
  type Project,
  type SearchHit,
  type World,
} from '../../shared/types';
import { createLogger } from '../logging/logger';
import { newId } from './ids';
import { DATA_FILE, JsonStore, emptyStoreData } from './json-store';
import { migrateStoreData } from './migrate';
import {
  STORE_VERSION,
  type ImportableData,
  type ProjectRepository,
  type RepositoryTx,
  type StoreData,
} from './repository';
import { MIGRATIONS } from './schema';

const log = createLogger('store');

export const DB_FILE = 'stokebay.db';
/** A backup waiting to be restored: written by restore, applied on the next start. */
export const RESTORE_FILE = 'restore.json';

type Row = Record<string, unknown>;

const DEFAULT_SETTINGS: AppSettings = emptyStoreData().settings;

export class SqliteStore implements ProjectRepository {
  private readonly tx: RepositoryTx;
  private readonly stmts = new Map<string, StatementSync>();

  private constructor(
    private readonly db: DatabaseSync,
    readonly file: string,
  ) {
    this.tx = this.createTx();
  }

  /**
   * Opens (or creates) the database in `dir`. On first run after upgrading, the old
   * `projects.json` is imported once and kept, renamed, as a safety copy. A pending restore
   * (see RESTORE_FILE) replaces the data before anything else reads it.
   */
  static async open(dir: string, options: { seed?: () => StoreData } = {}): Promise<SqliteStore> {
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, DB_FILE);
    const isNew = !(await exists(file));
    const store = new SqliteStore(openDatabase(file), file);

    if (isNew) {
      const jsonFile = path.join(dir, DATA_FILE);
      if (await exists(jsonFile)) {
        // JsonStore.open copes with damaged files (falls back to its rolling copies).
        const legacy = await JsonStore.open(dir);
        store.replaceAll(legacy.snapshot());
        await fs.rename(jsonFile, `${jsonFile}.imported-${Date.now()}`);
        log.info('moved data from projects.json into the database');
      } else if (options.seed) {
        store.replaceAll(options.seed());
      }
    }

    await store.applyPendingRestore(dir);
    return store;
  }

  /** Closes the database (on quit, and in tests). */
  close(): void {
    if (this.db.isOpen) this.db.close();
  }

  /** Writes are synchronous and committed; kept so callers can treat both stores alike. */
  flush(): Promise<void> {
    return Promise.resolve();
  }

  // ---- reads ----

  getSettings(): AppSettings {
    const settings: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    for (const row of this.all('SELECT key, value FROM settings')) {
      settings[String(row.key)] = JSON.parse(String(row.value));
    }
    return settings as unknown as AppSettings;
  }

  listWorlds(): World[] {
    return this.all('SELECT * FROM worlds ORDER BY sort_order, rowid').map(toWorld);
  }

  listProjects(): Project[] {
    return this.all('SELECT * FROM projects ORDER BY seq').map(toProject);
  }

  getProject(id: Id): Project | undefined {
    const row = this.get('SELECT * FROM projects WHERE id = ?', id);
    return row ? toProject(row) : undefined;
  }

  activePause(projectId: Id): Pause | undefined {
    const row = this.get(
      'SELECT * FROM pauses WHERE project_id = ? AND resumed_at IS NULL ORDER BY rowid LIMIT 1',
      projectId,
    );
    return row ? toPause(row) : undefined;
  }

  listEntries(projectId: Id): Entry[] {
    return this.all(
      'SELECT * FROM entries WHERE project_id = ? ORDER BY created_at DESC, id DESC',
      projectId,
    ).map(toEntry);
  }

  getEntry(id: Id): Entry | undefined {
    const row = this.get('SELECT * FROM entries WHERE id = ?', id);
    return row ? toEntry(row) : undefined;
  }

  listEvents(projectId: Id): ActivityEvent[] {
    return this.all(
      'SELECT * FROM events WHERE project_id = ? ORDER BY created_at DESC, id DESC',
      projectId,
    ).map(toEvent);
  }

  listRecentEvents(projectIds: Id[], since: number, limit: number): ActivityEvent[] {
    if (projectIds.length === 0) return [];
    return this.all(
      `SELECT * FROM events
       WHERE project_id IN (SELECT value FROM json_each(?)) AND created_at >= ?
       ORDER BY created_at DESC, id DESC LIMIT ?`,
      JSON.stringify(projectIds),
      since,
      limit,
    ).map(toEvent);
  }

  listModules(projectId: Id): Module[] {
    return this.all(
      'SELECT * FROM modules WHERE project_id = ? ORDER BY sort_order, rowid',
      projectId,
    ).map(toModule);
  }

  getModule(id: Id): Module | undefined {
    const row = this.get('SELECT * FROM modules WHERE id = ?', id);
    return row ? toModule(row) : undefined;
  }

  listParts(projectId: Id): Part[] {
    return this.all(
      'SELECT * FROM parts WHERE project_id = ? ORDER BY created_at, id',
      projectId,
    ).map(toPart);
  }

  getPart(id: Id): Part | undefined {
    const row = this.get('SELECT * FROM parts WHERE id = ?', id);
    return row ? toPart(row) : undefined;
  }

  listNodes(projectId: Id): CanvasNode[] {
    return this.all(
      'SELECT * FROM canvas_nodes WHERE project_id = ? ORDER BY rowid',
      projectId,
    ).map(toNode);
  }

  getNode(id: Id): CanvasNode | undefined {
    const row = this.get('SELECT * FROM canvas_nodes WHERE id = ?', id);
    return row ? toNode(row) : undefined;
  }

  listEdges(projectId: Id): CanvasEdge[] {
    return this.all(
      'SELECT * FROM canvas_edges WHERE project_id = ? ORDER BY rowid',
      projectId,
    ).map(toEdge);
  }

  /**
   * Projects whose title, and notes/links/items whose title or text, contain every word of
   * `query` (each word also matches as a prefix, so results appear while typing).
   */
  search(query: string, limit = 30): SearchHit[] {
    const match = toMatchQuery(query);
    if (!match) return [];
    const projects = this.all(
      `SELECT p.id, p.title, p.archived_at,
              highlight(projects_fts, 0, ?, ?) AS marked
       FROM projects_fts JOIN projects p ON p.seq = projects_fts.rowid
       WHERE projects_fts MATCH ? ORDER BY rank LIMIT ?`,
      SNIPPET_OPEN,
      SNIPPET_CLOSE,
      match,
      limit,
    ).map((r): SearchHit => ({
      kind: 'project',
      projectId: String(r.id),
      projectTitle: String(r.title),
      entryId: null,
      entryType: null,
      title: String(r.title),
      snippet: String(r.marked),
      archived: r.archived_at !== null,
    }));
    const entries = this.all(
      `SELECT e.id, e.project_id, e.type, e.title, p.title AS project_title, p.archived_at,
              snippet(entries_fts, 1, ?, ?, '…', 14) AS snip
       FROM entries_fts
       JOIN entries e ON e.seq = entries_fts.rowid
       JOIN projects p ON p.id = e.project_id
       WHERE entries_fts MATCH ? ORDER BY rank LIMIT ?`,
      SNIPPET_OPEN,
      SNIPPET_CLOSE,
      match,
      limit,
    ).map((r): SearchHit => ({
      kind: 'entry',
      projectId: String(r.project_id),
      projectTitle: String(r.project_title),
      entryId: String(r.id),
      entryType: r.type as Entry['type'],
      title: String(r.title),
      snippet: String(r.snip),
      archived: r.archived_at !== null,
    }));
    return [...projects, ...entries];
  }

  /** Everything, in the same shape as the JSON data file: used for backups and export. */
  snapshot(): StoreData {
    return {
      version: STORE_VERSION,
      settings: this.getSettings(),
      worlds: this.listWorlds(),
      projects: this.listProjects(),
      pauses: this.all('SELECT * FROM pauses ORDER BY rowid').map(toPause),
      entries: this.all('SELECT * FROM entries ORDER BY seq').map(toEntry),
      events: this.all('SELECT * FROM events ORDER BY rowid').map(toEvent),
      modules: this.all('SELECT * FROM modules ORDER BY rowid').map(toModule),
      parts: this.all('SELECT * FROM parts ORDER BY rowid').map(toPart),
      nodes: this.all('SELECT * FROM canvas_nodes ORDER BY rowid').map(toNode),
      edges: this.all('SELECT * FROM canvas_edges ORDER BY rowid').map(toEdge),
    };
  }

  async transaction<T>(fn: (tx: RepositoryTx) => T): Promise<T> {
    return Promise.resolve(this.atomically(() => fn(this.tx)));
  }

  // ---- internals ----

  /** Replaces every record with `data` (one transaction). Used for import and restore. */
  private replaceAll(data: StoreData): void {
    this.atomically(() => {
      for (const table of [
        'settings',
        'worlds',
        'projects',
        'pauses',
        'entries',
        'events',
        'modules',
        'parts',
        'canvas_nodes',
        'canvas_edges',
      ]) {
        this.db.exec(`DELETE FROM ${table}`);
      }
      this.writeSettings(data.settings);
      this.importAll(data);
      for (const m of data.modules) this.insertModule(m);
      for (const p of data.parts) this.insertPart(p);
      for (const n of data.nodes) this.insertNode(n);
      for (const e of data.edges) this.insertEdge(e);
    });
  }

  private async applyPendingRestore(dir: string): Promise<void> {
    const pending = path.join(dir, RESTORE_FILE);
    let text: string;
    try {
      text = await fs.readFile(pending, 'utf8');
    } catch {
      return;
    }
    const data = migrateStoreData(JSON.parse(text));
    if (!data) throw new Error('The backup to restore is not Stokebay data');
    this.replaceAll(data);
    await fs.rename(pending, `${pending}.restored-${Date.now()}`);
    log.info('restored data from a backup');
  }

  private atomically<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  private stmt(sql: string): StatementSync {
    let statement = this.stmts.get(sql);
    if (!statement) {
      statement = this.db.prepare(sql);
      this.stmts.set(sql, statement);
    }
    return statement;
  }

  private all(sql: string, ...params: SqlValue[]): Row[] {
    return this.stmt(sql).all(...params) as Row[];
  }

  private get(sql: string, ...params: SqlValue[]): Row | undefined {
    return this.stmt(sql).get(...params) as Row | undefined;
  }

  private run(sql: string, ...params: SqlValue[]): number {
    return Number(this.stmt(sql).run(...params).changes);
  }

  private requireProject(id: Id): Project {
    const project = this.getProject(id);
    if (!project) throw new Error(`Project ${id} not found`);
    return project;
  }

  private writeSettings(settings: Partial<AppSettings>): void {
    for (const [key, value] of Object.entries(settings)) {
      if (value === undefined) continue;
      this.run(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
        key,
        JSON.stringify(value),
      );
    }
  }

  private importAll(data: ImportableData): void {
    for (const w of data.worlds) this.insertWorld(w);
    for (const p of data.projects) this.insertProject(p);
    for (const p of data.pauses) this.insertPause(p);
    for (const e of data.entries) this.insertEntry(e);
    for (const e of data.events) this.insertEvent(e);
  }

  private insertWorld(w: World): void {
    this.run(
      'INSERT INTO worlds (id, name, color, icon, sort_order) VALUES (?, ?, ?, ?, ?)',
      w.id,
      w.name,
      w.color,
      w.icon ?? null,
      w.sortOrder,
    );
  }

  private insertProject(p: Project): void {
    this.run(
      `INSERT INTO projects (id, title, path, status, kind, blueprint_id, parts_bin, color, is_work,
         is_sample, world_ids, created_at, updated_at, last_event_at, archived_at, git)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      p.id,
      p.title,
      p.path ?? null,
      p.status,
      p.kind ?? 'other',
      p.blueprintId ?? null,
      p.partsBin ? 1 : 0,
      p.color ?? null,
      p.isWork ? 1 : 0,
      p.isSample ? 1 : 0,
      JSON.stringify(p.worldIds ?? []),
      p.createdAt,
      p.updatedAt ?? p.createdAt,
      p.lastEventAt ?? p.createdAt,
      p.archivedAt ?? null,
      p.git ? JSON.stringify(p.git) : null,
    );
  }

  private insertPause(p: Pause): void {
    this.run(
      `INSERT INTO pauses (id, project_id, paused_at, resumed_at, where_i_stopped, next_step,
                           git_context, remind_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      p.id,
      p.projectId,
      p.pausedAt,
      p.resumedAt ?? null,
      p.whereIStopped,
      p.nextStep,
      p.gitContext ? JSON.stringify(p.gitContext) : null,
      p.remindAt ?? null,
    );
  }

  private insertEntry(e: Entry): void {
    this.run(
      `INSERT INTO entries (id, project_id, type, title, body, url, checklist, file, module_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      e.id,
      e.projectId,
      e.type,
      e.title,
      e.body,
      e.url ?? null,
      e.checklist ? JSON.stringify(e.checklist) : null,
      e.file ? JSON.stringify(e.file) : null,
      e.moduleId ?? null,
      e.createdAt,
    );
  }

  private insertEvent(e: ActivityEvent): void {
    this.run(
      'INSERT INTO events (id, type, project_id, payload, created_at) VALUES (?, ?, ?, ?, ?)',
      e.id,
      e.type,
      e.projectId ?? null,
      JSON.stringify(e.payload ?? {}),
      e.createdAt,
    );
  }

  private insertModule(m: Module): void {
    this.run(
      'INSERT INTO modules (id, project_id, title, color, sort_order) VALUES (?, ?, ?, ?, ?)',
      m.id,
      m.projectId,
      m.title,
      m.color ?? null,
      m.sortOrder,
    );
  }

  private insertPart(p: Part): void {
    this.run(
      `INSERT INTO parts (id, project_id, module_id, name, qty, unit_cost_minor, currency,
         supplier_url, status, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      p.id,
      p.projectId,
      p.moduleId ?? null,
      p.name,
      p.qty,
      p.unitCostMinor ?? null,
      p.currency,
      p.supplierUrl ?? null,
      p.status,
      p.notes,
      p.createdAt,
      p.updatedAt,
    );
  }

  private insertNode(n: CanvasNode): void {
    this.run(
      `INSERT INTO canvas_nodes (id, project_id, ref_type, ref_id, x, y, w, h)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      n.id,
      n.projectId,
      n.refType,
      n.refId,
      n.x,
      n.y,
      n.w ?? null,
      n.h ?? null,
    );
  }

  private insertEdge(e: CanvasEdge): void {
    this.run(
      'INSERT INTO canvas_edges (id, project_id, from_node_id, to_node_id) VALUES (?, ?, ?, ?)',
      e.id,
      e.projectId,
      e.fromNodeId,
      e.toNodeId,
    );
  }

  private createTx(): RepositoryTx {
    return {
      updateSettings: (changes) => {
        this.writeSettings(changes);
        return this.getSettings();
      },

      importData: (data) => this.importAll(data),

      createWorld: ({ name, color }) => {
        const max = this.get('SELECT MAX(sort_order) AS m FROM worlds')?.m;
        const world: World = {
          id: newId(),
          name,
          color,
          icon: null,
          sortOrder: (max === null || max === undefined ? -1 : Number(max)) + 1,
        };
        this.insertWorld(world);
        return world;
      },

      updateWorld: (id, changes) => {
        const world = this.listWorlds().find((w) => w.id === id);
        if (!world) throw new Error(`World ${id} not found`);
        const next = { ...world, ...changes };
        this.run('UPDATE worlds SET name = ?, color = ? WHERE id = ?', next.name, next.color, id);
        return next;
      },

      deleteWorld: (id) => {
        this.run('DELETE FROM worlds WHERE id = ?', id);
        for (const project of this.listProjects()) {
          if (!project.worldIds.includes(id)) continue;
          this.run(
            'UPDATE projects SET world_ids = ? WHERE id = ?',
            JSON.stringify(project.worldIds.filter((w) => w !== id)),
            project.id,
          );
        }
      },

      createProject: (input) => {
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
        this.insertProject(project);
        return project;
      },

      updateProject: (id, changes, at) => {
        const next: Project = { ...this.requireProject(id), ...changes, updatedAt: at };
        this.run(
          `UPDATE projects SET title = ?, status = ?, world_ids = ?, path = ?, parts_bin = ?,
             updated_at = ? WHERE id = ?`,
          next.title,
          next.status,
          JSON.stringify(next.worldIds),
          next.path ?? null,
          next.partsBin ? 1 : 0,
          at,
          id,
        );
        return next;
      },

      archiveProject: (id, at) => {
        this.requireProject(id);
        this.run('UPDATE projects SET archived_at = ?, updated_at = ? WHERE id = ?', at, at, id);
        return this.requireProject(id);
      },

      restoreProject: (id, at) => {
        this.requireProject(id);
        this.run('UPDATE projects SET archived_at = NULL, updated_at = ? WHERE id = ?', at, id);
        return this.requireProject(id);
      },

      deleteProject: (id) => {
        this.requireProject(id);
        for (const table of [
          'pauses',
          'entries',
          'events',
          'modules',
          'parts',
          'canvas_nodes',
          'canvas_edges',
        ]) {
          this.run(`DELETE FROM ${table} WHERE project_id = ?`, id);
        }
        this.run('DELETE FROM projects WHERE id = ?', id);
      },

      setGitInfo: (id, git) => {
        this.requireProject(id);
        this.run('UPDATE projects SET git = ? WHERE id = ?', git ? JSON.stringify(git) : null, id);
      },

      addPause: (input) => {
        this.requireProject(input.projectId);
        const pause: Pause = {
          gitContext: null,
          remindAt: null,
          ...input,
          id: newId(),
          resumedAt: null,
        };
        this.insertPause(pause);
        return pause;
      },

      closePause: (id, resumedAt) => {
        if (this.run('UPDATE pauses SET resumed_at = ? WHERE id = ?', resumedAt, id) === 0) {
          throw new Error(`Pause ${id} not found`);
        }
        return toPause(this.get('SELECT * FROM pauses WHERE id = ?', id)!);
      },

      addEntry: (input) => {
        this.requireProject(input.projectId);
        const entry: Entry = { checklist: null, file: null, moduleId: null, ...input, id: newId() };
        this.insertEntry(entry);
        return entry;
      },

      updateEntry: (id, changes) => {
        const entry = this.getEntry(id);
        if (!entry) throw new Error(`Entry ${id} not found`);
        const next = { ...entry, ...changes };
        this.run(
          'UPDATE entries SET title = ?, body = ?, checklist = ?, module_id = ? WHERE id = ?',
          next.title,
          next.body,
          next.checklist ? JSON.stringify(next.checklist) : null,
          next.moduleId ?? null,
          id,
        );
        return next;
      },

      deleteEntry: (id) => {
        this.run('DELETE FROM entries WHERE id = ?', id);
      },

      createModule: (input) => {
        this.requireProject(input.projectId);
        const max = this.get(
          'SELECT MAX(sort_order) AS m FROM modules WHERE project_id = ?',
          input.projectId,
        )?.m;
        const module: Module = {
          ...input,
          id: newId(),
          sortOrder: (max === null || max === undefined ? -1 : Number(max)) + 1,
        };
        this.insertModule(module);
        return module;
      },

      updateModule: (id, changes) => {
        const module = this.getModule(id);
        if (!module) throw new Error(`Module ${id} not found`);
        const next = { ...module, ...changes };
        this.run(
          'UPDATE modules SET title = ?, color = ? WHERE id = ?',
          next.title,
          next.color ?? null,
          id,
        );
        return next;
      },

      deleteModule: (id) => {
        this.run('DELETE FROM modules WHERE id = ?', id);
        this.run('UPDATE entries SET module_id = NULL WHERE module_id = ?', id);
        this.run('UPDATE parts SET module_id = NULL WHERE module_id = ?', id);
      },

      addPart: (input) => {
        this.requireProject(input.projectId);
        const part: Part = { ...input, id: newId() };
        this.insertPart(part);
        return part;
      },

      updatePart: (id, changes, at) => {
        const part = this.getPart(id);
        if (!part) throw new Error(`Part ${id} not found`);
        const next: Part = { ...part, ...changes, updatedAt: at };
        this.run(
          `UPDATE parts SET name = ?, qty = ?, unit_cost_minor = ?, currency = ?, supplier_url = ?,
             status = ?, notes = ?, module_id = ?, updated_at = ? WHERE id = ?`,
          next.name,
          next.qty,
          next.unitCostMinor ?? null,
          next.currency,
          next.supplierUrl ?? null,
          next.status,
          next.notes,
          next.moduleId ?? null,
          at,
          id,
        );
        return next;
      },

      deletePart: (id) => {
        this.run('DELETE FROM parts WHERE id = ?', id);
      },

      addNode: (input) => {
        this.requireProject(input.projectId);
        const node: CanvasNode = { ...input, id: newId() };
        this.insertNode(node);
        return node;
      },

      updateNode: (id, changes) => {
        const node = this.getNode(id);
        if (!node) throw new Error(`Canvas node ${id} not found`);
        const next = { ...node, ...changes };
        this.run(
          'UPDATE canvas_nodes SET x = ?, y = ?, w = ?, h = ? WHERE id = ?',
          next.x,
          next.y,
          next.w ?? null,
          next.h ?? null,
          id,
        );
        return next;
      },

      deleteNode: (id) => {
        this.run('DELETE FROM canvas_nodes WHERE id = ?', id);
        this.run('DELETE FROM canvas_edges WHERE from_node_id = ? OR to_node_id = ?', id, id);
      },

      addEdge: (input) => {
        const edge: CanvasEdge = { ...input, id: newId() };
        this.insertEdge(edge);
        return edge;
      },

      deleteEdge: (id) => {
        this.run('DELETE FROM canvas_edges WHERE id = ?', id);
      },

      addEvent: (input) => {
        const event: ActivityEvent = { ...input, id: newId() };
        if (input.projectId) {
          this.requireProject(input.projectId);
          this.run(
            'UPDATE projects SET last_event_at = MAX(last_event_at, ?) WHERE id = ?',
            input.createdAt,
            input.projectId,
          );
        }
        this.insertEvent(event);
        return event;
      },
    };
  }
}

type SqlValue = string | number | null;

function openDatabase(file: string): DatabaseSync {
  const db = new DatabaseSync(file);
  // WAL: readers never wait for a writer, and a crash mid-write can't corrupt the file.
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 3000;');
  migrate(db);
  return db;
}

/** Runs the schema steps this database hasn't had yet. */
export function migrate(db: DatabaseSync): void {
  const current = Number((db.prepare('PRAGMA user_version').get() as Row).user_version);
  if (current > MIGRATIONS.length) {
    throw new Error('This data was written by a newer version of Stokebay. Please update the app.');
  }
  for (let step = current; step < MIGRATIONS.length; step++) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(MIGRATIONS[step]);
      db.exec(`PRAGMA user_version = ${step + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}

/**
 * Turns what the user typed into an FTS5 query: every word must match, each as a prefix.
 * Words are quoted, so characters like - or : are searched for, not parsed as operators.
 */
export function toMatchQuery(query: string): string | null {
  const words = query
    .split(/\s+/)
    .map((w) => w.replace(/"/g, '').trim())
    .filter(Boolean)
    .slice(0, 12);
  return words.length ? words.map((w) => `"${w}"*`).join(' ') : null;
}

const json = <T>(value: unknown): T | null =>
  value === null || value === undefined ? null : (JSON.parse(String(value)) as T);
const num = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

function toWorld(r: Row): World {
  return {
    id: String(r.id),
    name: String(r.name),
    color: String(r.color),
    icon: r.icon === null ? null : String(r.icon),
    sortOrder: Number(r.sort_order),
  };
}

function toProject(r: Row): Project {
  return {
    id: String(r.id),
    title: String(r.title),
    path: r.path === null ? null : String(r.path),
    status: r.status as Project['status'],
    kind: r.kind as Project['kind'],
    blueprintId: r.blueprint_id === null ? null : String(r.blueprint_id),
    partsBin: Number(r.parts_bin) === 1,
    color: r.color === null ? null : String(r.color),
    isWork: Number(r.is_work) === 1,
    isSample: Number(r.is_sample) === 1,
    worldIds: json<Id[]>(r.world_ids) ?? [],
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
    lastEventAt: Number(r.last_event_at),
    archivedAt: num(r.archived_at),
    git: json<GitInfo>(r.git),
  };
}

function toPause(r: Row): Pause {
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    pausedAt: Number(r.paused_at),
    resumedAt: num(r.resumed_at),
    whereIStopped: String(r.where_i_stopped),
    nextStep: String(r.next_step),
    gitContext: json<GitWorkState>(r.git_context),
    remindAt: num(r.remind_at),
  };
}

function toEntry(r: Row): Entry {
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    type: r.type as Entry['type'],
    title: String(r.title),
    body: String(r.body),
    url: r.url === null ? null : String(r.url),
    checklist: json<Entry['checklist']>(r.checklist),
    file: json<Entry['file']>(r.file),
    moduleId: r.module_id === null ? null : String(r.module_id),
    createdAt: Number(r.created_at),
  };
}

function toEvent(r: Row): ActivityEvent {
  return {
    id: String(r.id),
    type: r.type as ActivityEvent['type'],
    projectId: r.project_id === null ? null : String(r.project_id),
    payload: json<ActivityEvent['payload']>(r.payload) ?? {},
    createdAt: Number(r.created_at),
  };
}

function toModule(r: Row): Module {
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    title: String(r.title),
    color: r.color === null ? null : String(r.color),
    sortOrder: Number(r.sort_order),
  };
}

function toPart(r: Row): Part {
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    moduleId: r.module_id === null ? null : String(r.module_id),
    name: String(r.name),
    qty: Number(r.qty),
    unitCostMinor: num(r.unit_cost_minor),
    currency: String(r.currency),
    supplierUrl: r.supplier_url === null ? null : String(r.supplier_url),
    status: r.status as Part['status'],
    notes: String(r.notes),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

function toNode(r: Row): CanvasNode {
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    refType: r.ref_type as CanvasNode['refType'],
    refId: String(r.ref_id),
    x: Number(r.x),
    y: Number(r.y),
    w: num(r.w),
    h: num(r.h),
  };
}

function toEdge(r: Row): CanvasEdge {
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    fromNodeId: String(r.from_node_id),
    toNodeId: String(r.to_node_id),
  };
}

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}
