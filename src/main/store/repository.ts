// The storage boundary. SqliteStore is the real implementation; JsonStore (the prototype's
// single JSON file) remains for reading old data files and backups.
import type {
  ActivityEvent,
  AppSettings,
  CanvasEdge,
  CanvasNode,
  Entry,
  EpochMs,
  GitInfo,
  Id,
  Module,
  Part,
  Pause,
  Project,
  ProjectKind,
  ProjectStatus,
  SearchHit,
  World,
} from '../../shared/types';

export const STORE_VERSION = 4;

/** Settings for existing data; a brand-new install also has `onboarded: false`. */
export function defaultSettings(): AppSettings {
  return {
    onboarded: true,
    backupFolder: null,
    lastExternalBackupAt: null,
    editor: 'vscode',
    terminal: 'builtin',
    autoPauseDays: 30,
    captureShortcut: 'CommandOrControl+Shift+Space',
    lastCaptureProjectId: null,
    pickUpTerminal: true,
    pickUpLinks: false,
    lastReviewAt: null,
  };
}

export interface StoreData {
  version: typeof STORE_VERSION;
  settings: AppSettings;
  worlds: World[];
  projects: Project[];
  pauses: Pause[];
  entries: Entry[];
  events: ActivityEvent[];
  modules: Module[];
  parts: Part[];
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

export interface NewProject {
  title: string;
  status: ProjectStatus;
  worldIds: Id[];
  path: string | null;
  kind?: ProjectKind;
  blueprintId?: string | null;
  partsBin?: boolean;
  isSample?: boolean;
  createdAt: EpochMs;
}

export type ProjectChanges = Partial<
  Pick<Project, 'title' | 'status' | 'worldIds' | 'path' | 'partsBin'>
>;

export type NewEntry = Omit<Entry, 'id' | 'checklist' | 'file' | 'moduleId'> &
  Partial<Pick<Entry, 'checklist' | 'file' | 'moduleId'>>;

export type EntryChanges = Partial<Pick<Entry, 'title' | 'body' | 'checklist' | 'moduleId'>>;

export type PartChanges = Partial<
  Pick<
    Part,
    'name' | 'qty' | 'unitCostMinor' | 'currency' | 'supplierUrl' | 'status' | 'notes' | 'moduleId'
  >
>;

export type NodeChanges = Partial<Pick<CanvasNode, 'x' | 'y' | 'w' | 'h'>>;

/** The parts of a data file that can be merged into another (used for example projects). */
export type ImportableData = Pick<
  StoreData,
  'worlds' | 'projects' | 'pauses' | 'entries' | 'events'
>;

export interface ProjectRepository {
  getSettings(): AppSettings;
  listWorlds(): World[];
  /** All projects, archived ones included. */
  listProjects(): Project[];
  getProject(id: Id): Project | undefined;
  activePause(projectId: Id): Pause | undefined;
  /** Open pauses whose reminder time is at or before `now`, earliest reminder first. */
  listDueReminders(now: EpochMs): Pause[];
  /** Newest first. */
  listEntries(projectId: Id): Entry[];
  getEntry(id: Id): Entry | undefined;
  /** Newest first. */
  listEvents(projectId: Id): ActivityEvent[];
  /** Newest first: events of any of `projectIds` at or after `since`, at most `limit`. */
  listRecentEvents(projectIds: Id[], since: EpochMs, limit: number): ActivityEvent[];
  listModules(projectId: Id): Module[];
  getModule(id: Id): Module | undefined;
  /** Oldest first, so the Parts Bin keeps the order parts were added. */
  listParts(projectId: Id): Part[];
  getPart(id: Id): Part | undefined;
  listNodes(projectId: Id): CanvasNode[];
  getNode(id: Id): CanvasNode | undefined;
  listEdges(projectId: Id): CanvasEdge[];
  /** Projects and items matching every word of `query` (prefixes count), best first. */
  search(query: string, limit?: number): SearchHit[];
  /** Everything, in the data-file format (used for backups and export). */
  snapshot(): StoreData;
  /** Waits until every change has reached the disk. */
  flush(): Promise<void>;
  /**
   * Applies all changes in `fn` and saves them in one write, so one user action costs one
   * backup slot. If `fn` throws, nothing is changed.
   */
  transaction<T>(fn: (tx: RepositoryTx) => T): Promise<T>;
}

export interface RepositoryTx {
  updateSettings(changes: Partial<AppSettings>): AppSettings;
  /** Appends records as they are (ids must be fresh). */
  importData(data: ImportableData): void;
  createWorld(input: { name: string; color: string }): World;
  updateWorld(id: Id, changes: Partial<Pick<World, 'name' | 'color'>>): World;
  /** Projects keep existing; they just lose this world tag. */
  deleteWorld(id: Id): void;
  createProject(input: NewProject): Project;
  updateProject(id: Id, changes: ProjectChanges, at: EpochMs): Project;
  archiveProject(id: Id, at: EpochMs): Project;
  restoreProject(id: Id, at: EpochMs): Project;
  /** Permanent: also removes everything that belongs to the project. */
  deleteProject(id: Id): void;
  setGitInfo(id: Id, git: GitInfo | null): void;
  /** Git context and reminder are optional here (older callers and imports have neither). */
  addPause(
    input: Omit<Pause, 'id' | 'resumedAt' | 'gitContext' | 'remindAt'> &
      Partial<Pick<Pause, 'gitContext' | 'remindAt'>>,
  ): Pause;
  closePause(id: Id, resumedAt: EpochMs): Pause;
  /** Sets or clears (null) a pause's reminder; cleared once it has been shown. */
  setPauseReminder(id: Id, remindAt: EpochMs | null): Pause;
  addEntry(input: NewEntry): Entry;
  updateEntry(id: Id, changes: EntryChanges): Entry;
  deleteEntry(id: Id): void;
  addEvent(input: Omit<ActivityEvent, 'id'>): ActivityEvent;
  createModule(input: Omit<Module, 'id' | 'sortOrder'>): Module;
  updateModule(id: Id, changes: Partial<Pick<Module, 'title' | 'color'>>): Module;
  /** Items inside the zone stay; they just stop belonging to it. */
  deleteModule(id: Id): void;
  addPart(input: Omit<Part, 'id'>): Part;
  updatePart(id: Id, changes: PartChanges, at: EpochMs): Part;
  deletePart(id: Id): void;
  addNode(input: Omit<CanvasNode, 'id'>): CanvasNode;
  updateNode(id: Id, changes: NodeChanges): CanvasNode;
  /** Also removes lines touching the node. */
  deleteNode(id: Id): void;
  addEdge(input: Omit<CanvasEdge, 'id'>): CanvasEdge;
  deleteEdge(id: Id): void;
}
