// The typed bridge. The renderer gets these functions as `window.api` and nothing else:
// no ipcRenderer, no Node. Runs sandboxed with contextIsolation.
import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron';
import { CHANNELS, type HudApi, type IpcResult } from '../shared/ipc';
import type { ProjectSummary } from '../shared/types';

async function invoke<T>(channel: string, payload?: unknown): Promise<T> {
  const result = (await ipcRenderer.invoke(channel, payload)) as IpcResult<T>;
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

const api: HudApi = {
  bootstrap: () => invoke(CHANNELS.bootstrap),
  createProject: (input) => invoke(CHANNELS.projectsCreate, input),
  updateProject: (input) => invoke(CHANNELS.projectsUpdate, input),
  archiveProject: (id) => invoke(CHANNELS.projectsArchive, { id }),
  restoreProject: (id) => invoke(CHANNELS.projectsRestore, { id }),
  deleteProject: (id) => invoke(CHANNELS.projectsDelete, { id }),
  removeSampleProjects: () => invoke(CHANNELS.projectsRemoveSamples),
  pauseProject: (input) => invoke(CHANNELS.projectsPause, input),
  resumeProject: (id) => invoke(CHANNELS.projectsResume, { id }),
  getProjectDetail: (id) => invoke(CHANNELS.projectsDetail, { id }),
  addNote: (input) => invoke(CHANNELS.entriesAddNote, input),
  addLink: (input) => invoke(CHANNELS.entriesAddLink, input),
  openLink: (entryId) => invoke(CHANNELS.entriesOpenLink, { id: entryId }),
  createWorld: (name) => invoke(CHANNELS.worldsCreate, { name }),
  pickFolder: () => invoke(CHANNELS.dialogPickFolder),
  scanFolder: () => invoke(CHANNELS.scanPickAndRun),
  importScanned: (input) => invoke(CHANNELS.scanImport, input),
  openInEditor: (id) => invoke(CHANNELS.launchEditor, { id }),
  revealInFinder: (id) => invoke(CHANNELS.launchReveal, { id }),
  onProjectsChanged: (listener) => {
    const wrapped = (_event: IpcRendererEvent, projects: ProjectSummary[]) => listener(projects);
    ipcRenderer.on(CHANNELS.projectsChanged, wrapped);
    return () => ipcRenderer.removeListener(CHANNELS.projectsChanged, wrapped);
  },
  reportError: (report) => ipcRenderer.send(CHANNELS.logRendererError, report),

  listBlueprints: () => invoke(CHANNELS.blueprintsList),
  ignite: (input) => invoke(CHANNELS.ignite, input),
  getLab: (projectId) => invoke(CHANNELS.labGet, { projectId }),
  labAddNote: (input) => invoke(CHANNELS.labAddNote, input),
  labAddChecklist: (input) => invoke(CHANNELS.labAddChecklist, input),
  labAddLink: (input) => invoke(CHANNELS.labAddLink, input),
  labAddFiles: (input) => invoke(CHANNELS.labAddFiles, input),
  labPickFiles: (input) => invoke(CHANNELS.labPickFiles, input),
  labAddImageData: (input) => invoke(CHANNELS.labAddImageData, input),
  labAddPart: (input) => invoke(CHANNELS.labAddPart, input),
  labUpdatePart: (input) => invoke(CHANNELS.labUpdatePart, input),
  labAddZone: (input) => invoke(CHANNELS.labAddZone, input),
  labRenameZone: (input) => invoke(CHANNELS.labRenameZone, input),
  labUpdateItem: (input) => invoke(CHANNELS.labUpdateItem, input),
  labMoveNodes: (input) => invoke(CHANNELS.labMoveNodes, input),
  labConnect: (input) => invoke(CHANNELS.labConnect, input),
  labDisconnect: (edgeId) => invoke(CHANNELS.labDisconnect, { id: edgeId }),
  labRemoveNode: (nodeId) => invoke(CHANNELS.labRemoveNode, { nodeId }),
  labSetPartsBin: (input) => invoke(CHANNELS.labSetPartsBin, input),
  openFile: (entryId) => invoke(CHANNELS.labOpenFile, { id: entryId }),
  pathForFile: (file) => webUtils.getPathForFile(file),
  openUrl: (url) => invoke(CHANNELS.openUrl, { url }),
  finishOnboarding: (input) => invoke(CHANNELS.onboardingFinish, input),
  backupStatus: () => invoke(CHANNELS.backupStatus),
  backupChooseFolder: () => invoke(CHANNELS.backupChooseFolder),
  backupUseFolder: (folder) => invoke(CHANNELS.backupUseFolder, { folder }),
  backupDisable: () => invoke(CHANNELS.backupDisable),
  backupNow: () => invoke(CHANNELS.backupNow),
  backupRestore: (day) => invoke(CHANNELS.backupRestore, { day }),
};

contextBridge.exposeInMainWorld('api', api);
