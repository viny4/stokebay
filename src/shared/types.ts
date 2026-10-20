// Domain types shared by main, preload and renderer. Ids are ULIDs; times are UTC epoch ms.

export type Id = string;
export type EpochMs = number;

export const PROJECT_STATUSES = ['active', 'paused', 'done', 'idea'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** Statuses a user picks directly. `paused` only comes from the pause flow, so it always has a note. */
export const SETTABLE_STATUSES = ['active', 'idea', 'done'] as const;
export type SettableStatus = (typeof SETTABLE_STATUSES)[number];

/** What sort of project it is; set from the blueprint it was ignited with. */
export const PROJECT_KINDS = [
  'software',
  'hardware',
  'mixed',
  'creative',
  'research',
  'other',
] as const;
export type ProjectKind = (typeof PROJECT_KINDS)[number];

export interface World {
  id: Id;
  name: string;
  color: string;
  icon: string | null;
  sortOrder: number;
}

export interface GitInfo {
  branch: string | null;
  lastCommitAt: EpochMs | null;
  lastCommitMsg: string | null;
  refreshedAt: EpochMs;
  error: string | null;
}

export interface Project {
  id: Id;
  title: string;
  /** Folder on disk; null for ideas and non-code projects. */
  path: string | null;
  status: ProjectStatus;
  kind: ProjectKind;
  blueprintId: string | null;
  /** Show the Parts Bin for this project (on by default for physical builds). */
  partsBin: boolean;
  color: string | null;
  isWork: boolean;
  isSample: boolean;
  worldIds: Id[];
  createdAt: EpochMs;
  updatedAt: EpochMs;
  /** Newest activity event for this project. */
  lastEventAt: EpochMs;
  /** Set when archived; archived projects are hidden from the grid. */
  archivedAt: EpochMs | null;
  /** Cached Git info so the grid never waits on Git. */
  git: GitInfo | null;
}

/** What Git shows about unfinished work in a project folder, used to pre-fill the pause note. */
export interface GitWorkState {
  branch: string | null;
  lastCommitAt: EpochMs | null;
  lastCommitMsg: string | null;
  /** Uncommitted (changed or new) files, relative to the project folder; at most 20. */
  changedFiles: string[];
  /** All uncommitted files, including any past the 20 listed. */
  changedCount: number;
}

export interface Pause {
  id: Id;
  projectId: Id;
  pausedAt: EpochMs;
  resumedAt: EpochMs | null;
  whereIStopped: string;
  nextStep: string;
  /** What Git showed when the project was paused; null for projects without Git. */
  gitContext: GitWorkState | null;
  /** When to bring the project back with a reminder; null for no reminder. */
  remindAt: EpochMs | null;
}

/** Everything a project can hold. Notes and links also show in the detail panel. */
export const ENTRY_TYPES = ['note', 'link', 'checklist', 'image', 'file'] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];

export interface ChecklistItem {
  id: Id;
  text: string;
  done: boolean;
}

/**
 * A file kept for a Lab item. `copy`: stored in the app's media folder (`path` is relative to
 * it), so it survives the original moving. `link`: too big to copy, `path` is absolute.
 */
export interface FileRef {
  name: string;
  storage: 'copy' | 'link';
  path: string;
  mime: string;
  size: number;
}

export interface Entry {
  id: Id;
  projectId: Id;
  type: EntryType;
  title: string;
  body: string;
  url: string | null;
  checklist: ChecklistItem[] | null;
  file: FileRef | null;
  /** The module zone the item sits in, if any. */
  moduleId: Id | null;
  createdAt: EpochMs;
}

/** A building block of a project (Mechanics, Electronics, Code…), shown as a zone in the Lab. */
export interface Module {
  id: Id;
  projectId: Id;
  title: string;
  color: string | null;
  sortOrder: number;
}

export const PART_STATUSES = ['needed', 'ordered', 'arrived', 'installed'] as const;
export type PartStatus = (typeof PART_STATUSES)[number];

export interface Part {
  id: Id;
  projectId: Id;
  moduleId: Id | null;
  name: string;
  qty: number;
  /** Price of one, in minor units (cents); null when unknown. Never floats. */
  unitCostMinor: number | null;
  /** ISO 4217 code, e.g. "USD". */
  currency: string;
  supplierUrl: string | null;
  status: PartStatus;
  notes: string;
  createdAt: EpochMs;
  updatedAt: EpochMs;
}

export type CanvasRefType = 'entry' | 'part' | 'module';

/** Where one object sits on a project's Lab canvas. Zones (modules) also have a size. */
export interface CanvasNode {
  id: Id;
  projectId: Id;
  refType: CanvasRefType;
  refId: Id;
  x: number;
  y: number;
  w: number | null;
  h: number | null;
}

/** A line drawn between two Lab objects. */
export interface CanvasEdge {
  id: Id;
  projectId: Id;
  fromNodeId: Id;
  toNodeId: Id;
}

export const EVENT_TYPES = [
  'project_created',
  'project_updated',
  'project_archived',
  'project_restored',
  'project_paused',
  'project_resumed',
  'note_added',
  'link_added',
  'checklist_added',
  'file_attached',
  'part_added',
  'part_status_changed',
  'zone_added',
  'lab_item_removed',
  'opened_in_editor',
  'commit_detected',
  'project_reviewed',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface ActivityEvent {
  id: Id;
  type: EventType;
  projectId: Id | null;
  /** Ids and field names only, never note text or URLs. */
  payload: Record<string, string | number | boolean | string[] | null>;
  createdAt: EpochMs;
}

/** A project prepared for display: everything the grid needs, no further lookups. */
export interface ProjectSummary extends Project {
  /** Newest of the project's events and, for Git projects, its last commit. */
  lastActivityAt: EpochMs;
  /** The open pause (where I stopped / next step) when the project is paused. */
  activePause: Pause | null;
}

export interface ProjectDetail {
  project: ProjectSummary;
  /** Newest first. */
  entries: Entry[];
  /** Newest first. */
  events: ActivityEvent[];
}

/** What happened lately across one area's projects (for the area overview). */
export interface AreaActivity {
  /** Newest first. */
  events: ActivityEvent[];
  /** Entries those events mention, so notes can be named in the list. */
  entries: Entry[];
}

/** Wraps the matched words inside a search snippet (control characters never typed by users). */
export const SNIPPET_OPEN = '\u0001';
export const SNIPPET_CLOSE = '\u0002';

/** One search result: a project (title matched) or something inside one. */
export interface SearchHit {
  kind: 'project' | 'entry';
  projectId: Id;
  projectTitle: string;
  entryId: Id | null;
  entryType: EntryType | null;
  title: string;
  /** Matching text with matches wrapped in SNIPPET_OPEN / SNIPPET_CLOSE. */
  snippet: string;
  archived: boolean;
}

/** App-wide settings kept in the data file. */
export interface AppSettings {
  /** False on a fresh install until first-run setup is finished. */
  onboarded: boolean;
  /** Extra backup destination (e.g. inside Google Drive); null when off. */
  backupFolder: string | null;
  lastExternalBackupAt: EpochMs | null;
  /** Which editor "Open in…" uses (see shared/editors.ts). */
  editor: string;
  /** Pause active projects untouched for this many days; 0 turns it off. */
  autoPauseDays: number;
  /** Global shortcut for quick capture (an Electron accelerator); null when off. */
  captureShortcut: string | null;
  /** Project the last quick capture went to, offered first next time. */
  lastCaptureProjectId: Id | null;
  /** What "Pick up" opens besides the editor. */
  pickUpTerminal: boolean;
  pickUpLinks: boolean;
  /** When the last weekly review was finished. */
  lastReviewAt: EpochMs | null;
}

/** Whether the quick capture shortcut is working (another app may already own it). */
export interface CaptureStatus {
  shortcut: string | null;
  registered: boolean;
}

/** What "Pick up" did; `problems` lists anything that couldn't be opened. */
export interface PickUpResult {
  project: ProjectSummary;
  problems: string[];
}

export interface BackupStatus {
  folder: string | null;
  lastBackupAt: EpochMs | null;
  /** Days that have a backup (YYYY-MM-DD), newest first. */
  snapshots: string[];
  /** "My Drive" of Google Drive for desktop, when installed. */
  googleDrive: string | null;
  /** True when macOS's privacy settings stop Stokebay from reading the backup folder. */
  folderBlocked: boolean;
}

export interface BootstrapData {
  worlds: World[];
  projects: ProjectSummary[];
  settings: AppSettings;
}

/** Everything one Lab screen needs, in one call. */
export interface LabData {
  project: ProjectSummary;
  modules: Module[];
  entries: Entry[];
  parts: Part[];
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

/** A starting point for Ignite. Built-in ones live in resources/blueprints/. */
export interface Blueprint {
  id: string;
  name: string;
  kind: ProjectKind;
  description: string;
  /** Words in the user's idea that suggest this blueprint. */
  keywords: string[];
  modules: string[];
  partsBin: boolean;
  checklist: string[];
}

export interface ScanCandidate {
  path: string;
  name: string;
  hasGit: boolean;
  /** Roughly when Git last recorded work here (commit, checkout); only from the computer search. */
  lastTouchedAt?: EpochMs;
}

export interface ScanResult {
  /** The folder scanned, or the home folder for a whole-computer search. */
  root: string;
  /** Every place searched (home, own folders at the top of the disk, connected drives). */
  searched: string[];
  /** Folders macOS wouldn't let the app look into; projects there may be missing. */
  blocked: string[];
  candidates: ScanCandidate[];
  /** Folders found that are already projects (including archived ones). */
  alreadyImported: number;
  /** True when the scan stopped early because the folder tree was very large. */
  truncated: boolean;
}

export interface LaunchResult {
  ok: boolean;
  message: string | null;
}

export interface RendererErrorReport {
  message: string;
  stack?: string;
  source: 'error' | 'unhandledrejection' | 'react';
}
