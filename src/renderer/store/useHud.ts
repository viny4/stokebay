// App state for the renderer. Components read slices with selectors (useHud((s) => s.x)) so
// a change only re-renders what uses it. Actions call window.api and throw on failure, so
// forms can show the message inline; fire-and-forget callers wrap them with `guard`.
import { create } from 'zustand';
import type {
  AddLinkInput,
  AddNoteInput,
  CreateProjectInput,
  IgniteInput,
  OnboardingInput,
  PauseInput,
  ScanImportInput,
  UpdateProjectInput,
} from '../../shared/schemas';
import type {
  AppSettings,
  Blueprint,
  Id,
  LabData,
  ProjectDetail,
  ProjectSummary,
  ScanResult,
  World,
} from '../../shared/types';

export type View = 'grid' | 'archived' | 'lab';

export type DialogState =
  | { kind: 'none' }
  | { kind: 'ignite' }
  | { kind: 'project'; mode: 'create' }
  | { kind: 'project'; mode: 'edit'; projectId: Id }
  | { kind: 'pause'; projectId: Id }
  | { kind: 'scan' }
  | { kind: 'settings' }
  | {
      kind: 'confirm';
      title: string;
      message: string;
      confirmLabel: string;
      danger: boolean;
      onConfirm: () => Promise<void> | void;
    };

export interface Toast {
  id: number;
  kind: 'info' | 'error';
  message: string;
}

export interface HudState {
  status: 'loading' | 'ready' | 'error';
  loadError: string | null;
  worlds: World[];
  projects: ProjectSummary[];
  /** Clock for relative times and glow; ticks every minute. */
  now: number;
  worldFilter: Id | null;
  search: string;
  view: View;
  /** Project shown in the detail side panel. */
  selectedId: Id | null;
  detail: ProjectDetail | null;
  dialog: DialogState;
  toast: Toast | null;
  blueprints: Blueprint[];
  settings: AppSettings;
  /** Project whose Lab is open (view === 'lab'), and its data once loaded. */
  labProjectId: Id | null;
  lab: LabData | null;

  load(): Promise<void>;
  tick(): void;
  setWorldFilter(id: Id | null): void;
  setSearch(search: string): void;
  setView(view: 'grid' | 'archived'): void;

  /** Creates a project from a blueprint; it appears on the grid. */
  ignite(input: IgniteInput): Promise<ProjectSummary>;
  enterLab(projectId: Id): Promise<void>;
  exitLab(): void;
  /** Ends first-run setup with the chosen worlds and, optionally, the example projects. */
  finishOnboarding(input: OnboardingInput): Promise<void>;
  /**
   * Runs any Lab call (e.g. `runLab(() => window.api.labAddNote({...}))`) and applies the
   * returned Lab to the screen and the grid. Throws on failure like other actions.
   */
  runLab(call: () => Promise<LabData | null>): Promise<LabData | null>;
  openProject(id: Id): Promise<void>;
  closeProject(): void;
  openDialog(dialog: Exclude<DialogState, { kind: 'none' }>): void;
  closeDialog(): void;
  showToast(message: string, kind?: Toast['kind']): void;
  dismissToast(): void;

  createProject(input: CreateProjectInput): Promise<ProjectSummary>;
  updateProject(input: UpdateProjectInput): Promise<ProjectSummary>;
  archiveProject(id: Id): Promise<void>;
  restoreProject(id: Id): Promise<void>;
  deleteProject(id: Id): Promise<void>;
  removeSampleProjects(): Promise<void>;
  pauseProject(input: PauseInput): Promise<void>;
  resumeProject(id: Id): Promise<void>;
  addNote(input: AddNoteInput): Promise<void>;
  addLink(input: AddLinkInput): Promise<void>;
  openLink(entryId: Id): Promise<void>;
  createWorld(name: string): Promise<World>;
  pickFolder(): Promise<string | null>;
  /** Opens the folder picker and scans it; null if the user cancelled. */
  scanFolder(): Promise<ScanResult | null>;
  importScanned(input: ScanImportInput): Promise<ProjectSummary[]>;
  openInEditor(id: Id): Promise<void>;
  revealInFinder(id: Id): Promise<void>;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

let toastSeq = 0;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useHud = create<HudState>()((set, get) => {
  /** Puts a changed project into the list and refreshes the open detail panel if it's that one. */
  const upsert = async (project: ProjectSummary) => {
    set((s) => ({
      projects: s.projects.some((p) => p.id === project.id)
        ? s.projects.map((p) => (p.id === project.id ? project : p))
        : [...s.projects, project],
    }));
    if (get().selectedId === project.id) await refreshDetail(project.id);
  };

  const refreshDetail = async (id: Id) => {
    const detail = await window.api.getProjectDetail(id);
    if (get().selectedId === id) set({ detail });
  };

  return {
    status: 'loading',
    loadError: null,
    worlds: [],
    projects: [],
    now: Date.now(),
    worldFilter: null,
    search: '',
    view: 'grid',
    selectedId: null,
    detail: null,
    dialog: { kind: 'none' },
    toast: null,
    blueprints: [],
    settings: { onboarded: true, backupFolder: null, lastExternalBackupAt: null },
    labProjectId: null,
    lab: null,

    async load() {
      try {
        // Blueprints only matter for Ignite; failing to load them must never hide the projects.
        const [data, blueprints] = await Promise.all([
          window.api.bootstrap(),
          window.api.listBlueprints().catch((err: unknown) => {
            window.api.reportError({ message: errorMessage(err), source: 'error' });
            return [];
          }),
        ]);
        set({
          status: 'ready',
          worlds: data.worlds,
          projects: data.projects,
          blueprints,
          settings: data.settings,
          now: Date.now(),
        });
      } catch (err) {
        set({ status: 'error', loadError: errorMessage(err) });
      }
    },

    async ignite(input) {
      const project = await window.api.ignite(input);
      await upsert(project);
      return project;
    },

    async enterLab(projectId) {
      set({ view: 'lab', labProjectId: projectId, lab: null, selectedId: null, detail: null });
      try {
        const lab = await window.api.getLab(projectId);
        if (get().labProjectId === projectId) set({ lab });
      } catch (err) {
        set({ view: 'grid', labProjectId: null });
        throw err;
      }
    },

    exitLab: () => set({ view: 'grid', labProjectId: null, lab: null }),

    async finishOnboarding(input) {
      const data = await window.api.finishOnboarding(input);
      set({ worlds: data.worlds, projects: data.projects, settings: data.settings });
    },

    async runLab(call) {
      const lab = await call();
      if (!lab) return null;
      set((s) => ({
        lab: s.labProjectId === lab.project.id ? lab : s.lab,
        projects: s.projects.map((p) => (p.id === lab.project.id ? lab.project : p)),
      }));
      return lab;
    },

    tick: () => set({ now: Date.now() }),
    setWorldFilter: (worldFilter) => set({ worldFilter }),
    setSearch: (search) => set({ search }),
    setView: (view) => set({ view }),

    async openProject(id) {
      set({ selectedId: id, detail: null });
      try {
        await refreshDetail(id);
      } catch (err) {
        set({ selectedId: null });
        get().showToast(errorMessage(err), 'error');
      }
    },
    closeProject: () => set({ selectedId: null, detail: null }),

    openDialog: (dialog) => set({ dialog }),
    closeDialog: () => set({ dialog: { kind: 'none' } }),

    showToast(message, kind = 'info') {
      clearTimeout(toastTimer);
      set({ toast: { id: ++toastSeq, kind, message } });
      toastTimer = setTimeout(() => set({ toast: null }), kind === 'error' ? 7000 : 3500);
    },
    dismissToast: () => set({ toast: null }),

    async createProject(input) {
      const project = await window.api.createProject(input);
      await upsert(project);
      return project;
    },
    async updateProject(input) {
      const project = await window.api.updateProject(input);
      await upsert(project);
      return project;
    },
    async archiveProject(id) {
      await upsert(await window.api.archiveProject(id));
      if (get().selectedId === id) get().closeProject();
    },
    async restoreProject(id) {
      await upsert(await window.api.restoreProject(id));
    },
    async deleteProject(id) {
      await window.api.deleteProject(id);
      set((s) => ({ projects: s.projects.filter((p) => p.id !== id) }));
      if (get().selectedId === id) get().closeProject();
    },
    async removeSampleProjects() {
      const projects = await window.api.removeSampleProjects();
      set({ projects });
      const selected = get().selectedId;
      if (selected && !projects.some((p) => p.id === selected)) get().closeProject();
    },
    async pauseProject(input) {
      await upsert(await window.api.pauseProject(input));
    },
    async resumeProject(id) {
      await upsert(await window.api.resumeProject(id));
    },
    async addNote(input) {
      const detail = await window.api.addNote(input);
      set((s) => ({
        detail: s.selectedId === input.projectId ? detail : s.detail,
        projects: s.projects.map((p) => (p.id === detail.project.id ? detail.project : p)),
      }));
    },
    async addLink(input) {
      const detail = await window.api.addLink(input);
      set((s) => ({
        detail: s.selectedId === input.projectId ? detail : s.detail,
        projects: s.projects.map((p) => (p.id === detail.project.id ? detail.project : p)),
      }));
    },
    openLink: (entryId) => window.api.openLink(entryId),
    async createWorld(name) {
      const world = await window.api.createWorld(name);
      set((s) => ({ worlds: [...s.worlds, world] }));
      return world;
    },
    pickFolder: () => window.api.pickFolder(),
    scanFolder: () => window.api.scanFolder(),
    async importScanned(input) {
      const created = await window.api.importScanned(input);
      set((s) => ({ projects: [...s.projects, ...created] }));
      return created;
    },
    async openInEditor(id) {
      const result = await window.api.openInEditor(id);
      if (!result.ok) {
        get().showToast(result.message ?? "Couldn't open the editor.", 'error');
        return;
      }
      // Opening counts as activity, so refresh this project's glow and timeline.
      await upsert((await window.api.getProjectDetail(id)).project);
    },
    revealInFinder: (id) => window.api.revealInFinder(id),
  };
});

/** Runs an action and shows its error as a toast instead of throwing. */
export function guard(action: () => Promise<unknown>): void {
  action().catch((err: unknown) => useHud.getState().showToast(errorMessage(err), 'error'));
}

// Git refreshes happen in the background; main pushes the new list when something changed.
export function subscribeToMain(): () => void {
  return window.api.onProjectsChanged((projects) => {
    useHud.setState({ projects });
    const { selectedId } = useHud.getState();
    if (selectedId) {
      window.api
        .getProjectDetail(selectedId)
        .then((detail) => {
          if (useHud.getState().selectedId === selectedId) useHud.setState({ detail });
        })
        .catch(() => undefined);
    }
  });
}
