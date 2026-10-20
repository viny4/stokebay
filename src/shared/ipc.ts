import type {
  AddLinkInput,
  AddNoteInput,
  CreateProjectInput,
  IgniteInput,
  LabAddChecklistInput,
  LabAddFilesInput,
  LabAddImageDataInput,
  LabAddLinkInput,
  LabAddNoteInput,
  LabAddPartInput,
  LabAddZoneInput,
  LabConnectInput,
  LabMoveNodesInput,
  LabPartsBinInput,
  LabPickFilesInput,
  LabRenameZoneInput,
  LabUpdateItemInput,
  LabUpdatePartInput,
  OnboardingInput,
  PauseInput,
  ScanImportInput,
  UpdateProjectInput,
  UpdateWorldInput,
} from './schemas';
import type { EditorId } from './editors';
import type {
  AppSettings,
  AreaActivity,
  BackupStatus,
  Blueprint,
  BootstrapData,
  Id,
  LabData,
  LaunchResult,
  ProjectDetail,
  ProjectSummary,
  RendererErrorReport,
  ScanResult,
  SearchHit,
  World,
} from './types';

export const CHANNELS = {
  bootstrap: 'app:bootstrap',
  projectsCreate: 'projects:create',
  projectsUpdate: 'projects:update',
  projectsArchive: 'projects:archive',
  projectsRestore: 'projects:restore',
  projectsDelete: 'projects:delete',
  projectsRemoveSamples: 'projects:removeSamples',
  projectsPause: 'projects:pause',
  projectsResume: 'projects:resume',
  projectsDetail: 'projects:detail',
  entriesAddNote: 'entries:addNote',
  entriesAddLink: 'entries:addLink',
  entriesOpenLink: 'entries:openLink',
  worldsCreate: 'worlds:create',
  dialogPickFolder: 'dialog:pickFolder',
  scanPickAndRun: 'scan:pickAndRun',
  scanComputer: 'scan:computer',
  scanImport: 'scan:import',
  launchEditor: 'launch:editor',
  launchReveal: 'launch:reveal',
  blueprintsList: 'blueprints:list',
  ignite: 'ignite:create',
  labGet: 'lab:get',
  labAddNote: 'lab:addNote',
  labAddChecklist: 'lab:addChecklist',
  labAddLink: 'lab:addLink',
  labAddFiles: 'lab:addFiles',
  labPickFiles: 'lab:pickFiles',
  labAddImageData: 'lab:addImageData',
  labAddPart: 'lab:addPart',
  labUpdatePart: 'lab:updatePart',
  labAddZone: 'lab:addZone',
  labRenameZone: 'lab:renameZone',
  labUpdateItem: 'lab:updateItem',
  labMoveNodes: 'lab:moveNodes',
  labConnect: 'lab:connect',
  labDisconnect: 'lab:disconnect',
  labRemoveNode: 'lab:removeNode',
  labSetPartsBin: 'lab:setPartsBin',
  labOpenFile: 'lab:openFile',
  openUrl: 'shell:openUrl',
  onboardingFinish: 'onboarding:finish',
  backupStatus: 'backup:status',
  backupChooseFolder: 'backup:chooseFolder',
  backupUseFolder: 'backup:useFolder',
  backupDisable: 'backup:disable',
  backupNow: 'backup:now',
  backupRestore: 'backup:restore',
  worldsUpdate: 'worlds:update',
  worldsDelete: 'worlds:delete',
  settingsSetEditor: 'settings:setEditor',
  appRevealData: 'app:revealData',
  /** Pushed from main when projects change outside a renderer request (e.g. Git refresh). */
  projectsChanged: 'projects:changed',
  logRendererError: 'log:rendererError',
  searchQuery: 'search:query',
  areasActivity: 'areas:activity',
  appOpenPrivacySettings: 'app:openPrivacySettings',
} as const;

export type IpcResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** The only door from the renderer into the app. Exposed as `window.api` by the preload script. */
export interface HudApi {
  bootstrap(): Promise<BootstrapData>;
  createProject(input: CreateProjectInput): Promise<ProjectSummary>;
  updateProject(input: UpdateProjectInput): Promise<ProjectSummary>;
  archiveProject(id: Id): Promise<ProjectSummary>;
  restoreProject(id: Id): Promise<ProjectSummary>;
  deleteProject(id: Id): Promise<void>;
  removeSampleProjects(): Promise<ProjectSummary[]>;
  pauseProject(input: PauseInput): Promise<ProjectSummary>;
  resumeProject(id: Id): Promise<ProjectSummary>;
  getProjectDetail(id: Id): Promise<ProjectDetail>;
  /** Full-text search over project titles and everything inside projects. */
  search(query: string): Promise<SearchHit[]>;
  /** The last week of activity across one area's projects. */
  areaActivity(worldId: Id): Promise<AreaActivity>;
  /** Opens macOS System Settings at Privacy & Security → Files and Folders. */
  openPrivacySettings(): Promise<void>;
  addNote(input: AddNoteInput): Promise<ProjectDetail>;
  addLink(input: AddLinkInput): Promise<ProjectDetail>;
  openLink(entryId: Id): Promise<void>;
  createWorld(name: string): Promise<World>;
  pickFolder(): Promise<string | null>;
  scanFolder(): Promise<ScanResult | null>;
  /** Finds every Git project in the home folder. */
  scanComputer(): Promise<ScanResult>;
  importScanned(input: ScanImportInput): Promise<ProjectSummary[]>;
  openInEditor(id: Id): Promise<LaunchResult>;
  revealInFinder(id: Id): Promise<void>;
  onProjectsChanged(listener: (projects: ProjectSummary[]) => void): () => void;
  reportError(report: RendererErrorReport): void;

  // Ignite and the Lab. Every Lab change returns the whole updated Lab.
  listBlueprints(): Promise<Blueprint[]>;
  ignite(input: IgniteInput): Promise<ProjectSummary>;
  getLab(projectId: Id): Promise<LabData>;
  labAddNote(input: LabAddNoteInput): Promise<LabData>;
  labAddChecklist(input: LabAddChecklistInput): Promise<LabData>;
  labAddLink(input: LabAddLinkInput): Promise<LabData>;
  labAddFiles(input: LabAddFilesInput): Promise<LabData>;
  /** Shows the file picker; null when cancelled. */
  labPickFiles(input: LabPickFilesInput): Promise<LabData | null>;
  labAddImageData(input: LabAddImageDataInput): Promise<LabData>;
  labAddPart(input: LabAddPartInput): Promise<LabData>;
  labUpdatePart(input: LabUpdatePartInput): Promise<LabData>;
  labAddZone(input: LabAddZoneInput): Promise<LabData>;
  labRenameZone(input: LabRenameZoneInput): Promise<LabData>;
  labUpdateItem(input: LabUpdateItemInput): Promise<LabData>;
  labMoveNodes(input: LabMoveNodesInput): Promise<LabData>;
  labConnect(input: LabConnectInput): Promise<LabData>;
  labDisconnect(edgeId: Id): Promise<LabData | null>;
  labRemoveNode(nodeId: Id): Promise<LabData>;
  labSetPartsBin(input: LabPartsBinInput): Promise<LabData>;
  /** Opens a Lab file with its default app. */
  openFile(entryId: Id): Promise<void>;
  /** The real path of a file dropped from Finder (Electron removed File.path). */
  pathForFile(file: File): string;
  /** Opens an http(s) address (e.g. a part's supplier) in the system browser. */
  openUrl(url: string): Promise<void>;
  /** Finishes first-run setup; returns everything the HUD needs afterwards. */
  finishOnboarding(input: OnboardingInput): Promise<BootstrapData>;

  // Backups to a folder such as Google Drive.
  backupStatus(): Promise<BackupStatus>;
  /** Shows the folder picker; null when cancelled. */
  backupChooseFolder(): Promise<BackupStatus | null>;
  backupUseFolder(folder: string): Promise<BackupStatus>;
  backupDisable(): Promise<BackupStatus>;
  backupNow(): Promise<BackupStatus>;
  /** Restores that day's backup, then the app restarts. */
  backupRestore(day: string): Promise<void>;

  updateWorld(input: UpdateWorldInput): Promise<World>;
  /** Deletes a world; its projects stay. Returns the refreshed HUD data. */
  deleteWorld(id: Id): Promise<BootstrapData>;
  setEditor(editor: EditorId): Promise<AppSettings>;
  /** Shows Stokebay's data folder in Finder. */
  revealDataFolder(): Promise<void>;
}

/** Address the renderer uses to show a Lab image; served only from the app's media. */
export function mediaUrl(entryId: Id): string {
  return `hud-media://entry/${encodeURIComponent(entryId)}`;
}
