import { app, dialog, ipcMain, shell, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import type { z } from 'zod';
import { editorById } from '../../shared/editors';
import { CHANNELS, type IpcResult } from '../../shared/ipc';
import {
  addLinkInput,
  addNoteInput,
  createProjectInput,
  createWorldInput,
  emptyInput,
  idInput,
  searchInput,
  areaInput,
  igniteInput,
  labAddChecklistInput,
  labAddFilesInput,
  labAddImageDataInput,
  labAddLinkInput,
  labAddNoteInput,
  labAddPartInput,
  labAddZoneInput,
  labConnectInput,
  labMoveNodesInput,
  labNodeInput,
  labPartsBinInput,
  labPickFilesInput,
  labProjectInput,
  labRenameZoneInput,
  labUpdateItemInput,
  labUpdatePartInput,
  backupRestoreInput,
  backupUseFolderInput,
  captureSaveInput,
  onboardingInput,
  openUrlInput,
  pauseInput,
  rendererErrorInput,
  scanImportInput,
  setEditorInput,
  updateProjectInput,
  updateSettingsInput,
  updateWorldInput,
} from '../../shared/schemas';
import type { AppSettings, CaptureStatus, ScanCandidate, ScanResult } from '../../shared/types';
import { createLogger } from '../logging/logger';
import { getBlueprint, listBlueprints } from '../services/blueprints';
import type { GitRefresher } from '../services/git';
import type { LabService } from '../services/lab';
import type { MediaStore } from '../services/media';
import type { BackupController } from '../backup-controller';
import { openInEditor, openTerminal } from '../services/launcher';
import { pickUp } from '../services/pick-up';
import { readWorkState } from '../services/work-state';
import { UserError, type ProjectService } from '../services/projects';
import { computerScanRoots, findGitRepos, scanFolder } from '../services/scanner';
import { isAppUrl } from '../window';

const log = createLogger('ipc');
const rendererLog = createLogger('renderer');

export interface HandlerDeps {
  service: ProjectService;
  lab: LabService;
  media: MediaStore;
  backups: BackupController;
  git: GitRefresher;
  getWindow: () => BrowserWindow | null;
  /** Runs after settings change (e.g. re-registers the capture shortcut, re-checks auto-pause). */
  onSettingsChanged?: (settings: AppSettings, previous: AppSettings) => void;
  /** The quick capture window and shortcut (see window.ts and capture-shortcut.ts). */
  capture?: { hide: () => void; status: () => CaptureStatus };
  /** Returns (and forgets) a project to show in a window that was just created for it. */
  takePendingFocus?: () => string | null;
}

export function registerIpcHandlers({
  service,
  lab,
  media,
  backups,
  git,
  getWindow,
  onSettingsChanged,
  capture,
  takePendingFocus,
}: HandlerDeps): void {
  // Import is only allowed for folders the last scan actually found, so the renderer can't
  // smuggle in arbitrary paths.
  let lastScan: ScanCandidate[] = [];

  const pickFolder = async (title: string): Promise<string | null> => {
    const win = getWindow();
    const options = { title, properties: ['openDirectory', 'createDirectory'] as const };
    const result = win
      ? await dialog.showOpenDialog(win, { ...options, properties: [...options.properties] })
      : await dialog.showOpenDialog({ ...options, properties: [...options.properties] });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  };

  const refreshGitFor = (id: string) => {
    git
      .refresh({ force: true, ids: [id] })
      .catch((err: unknown) => log.warn('git refresh failed', { error: String(err) }));
  };

  handle(CHANNELS.bootstrap, emptyInput, () => service.bootstrap());

  handle(CHANNELS.projectsCreate, createProjectInput, async (input) => {
    if (input.path) await assertFolder(input.path);
    const created = await service.create(input);
    if (created.path) refreshGitFor(created.id);
    return created;
  });

  handle(CHANNELS.projectsUpdate, updateProjectInput, async ({ id, patch }) => {
    if (patch.path) await assertFolder(patch.path);
    const updated = await service.update(id, patch);
    if (patch.path) refreshGitFor(id);
    return updated;
  });

  handle(CHANNELS.projectsArchive, idInput, ({ id }) => service.archive(id));
  handle(CHANNELS.projectsRestore, idInput, ({ id }) => service.restore(id));
  handle(CHANNELS.projectsDelete, idInput, async ({ id }) => {
    await service.deletePermanently(id);
    await media.removeProject(id);
  });
  handle(CHANNELS.projectsRemoveSamples, emptyInput, async () => {
    const before = new Set(service.summaries().map((p) => p.id));
    const left = await service.removeSamples();
    for (const p of left) before.delete(p.id);
    await Promise.all([...before].map((id) => media.removeProject(id)));
    return left;
  });
  handle(CHANNELS.projectsPause, pauseInput, async ({ id, whereIStopped, nextStep, remindAt }) => {
    // Main reads the Git state itself; the renderer only says what the user wrote.
    const folder = service.summary(id).path;
    const gitContext = folder ? await readWorkState(folder) : null;
    return service.pause(id, whereIStopped, nextStep, { gitContext, remindAt: remindAt ?? null });
  });
  handle(CHANNELS.projectsResume, idInput, ({ id }) => service.resume(id));
  handle(CHANNELS.projectsDetail, idInput, ({ id }) => service.detail(id));
  handle(CHANNELS.searchQuery, searchInput, ({ query }) => service.search(query));
  handle(CHANNELS.areasActivity, areaInput, ({ worldId }) => service.areaActivity(worldId));
  handle(CHANNELS.appOpenPrivacySettings, emptyInput, async () => {
    if (process.platform !== 'darwin') return;
    await shell.openExternal(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_FilesAndFolders',
    );
  });

  handle(CHANNELS.entriesAddNote, addNoteInput, ({ projectId, title, body }) =>
    service.addNote(projectId, title, body),
  );
  handle(CHANNELS.entriesAddLink, addLinkInput, ({ projectId, title, url }) =>
    service.addLink(projectId, title, url),
  );
  handle(CHANNELS.entriesOpenLink, idInput, async ({ id }) => {
    const url = service.linkUrl(id);
    // Stored links were validated on the way in; check again before handing one to the OS.
    const protocol = new URL(url).protocol;
    if (protocol !== 'http:' && protocol !== 'https:')
      throw new UserError('Only web links can be opened.');
    await shell.openExternal(url);
  });

  handle(CHANNELS.worldsCreate, createWorldInput, ({ name }) => service.createWorld(name));

  handle(CHANNELS.dialogPickFolder, emptyInput, () => pickFolder('Choose the project folder'));

  /** Leaves out folders that are already projects and remembers the rest for import. */
  const scanResult = (
    root: string,
    searched: string[],
    found: { candidates: ScanCandidate[]; truncated: boolean; blocked?: string[] },
    started: number,
  ): ScanResult => {
    const known = new Set(service.bootstrap().projects.map((p) => p.path));
    const fresh = found.candidates.filter((c) => !known.has(c.path));
    lastScan = fresh;
    log.info('scan finished', {
      found: found.candidates.length,
      fresh: fresh.length,
      truncated: found.truncated,
      places: searched.length,
      blocked: found.blocked?.length ?? 0,
      durationMs: Date.now() - started,
    });
    return {
      root,
      searched,
      blocked: found.blocked ?? [],
      candidates: fresh,
      alreadyImported: found.candidates.length - fresh.length,
      truncated: found.truncated,
    };
  };

  handle(CHANNELS.scanPickAndRun, emptyInput, async (): Promise<ScanResult | null> => {
    const root = await pickFolder('Choose a folder to scan for projects');
    if (!root) return null;
    const started = Date.now();
    return scanResult(root, [root], await scanFolder(root), started);
  });

  // The whole computer (home, own folders, connected drives), Git projects only.
  handle(CHANNELS.scanComputer, emptyInput, async (): Promise<ScanResult> => {
    const root = os.homedir();
    const started = Date.now();
    const searched = await computerScanRoots(root);
    return scanResult(root, searched, await findGitRepos(searched), started);
  });

  handle(CHANNELS.scanImport, scanImportInput, async ({ paths, worldIds }) => {
    const wanted = new Set(paths);
    const chosen = lastScan.filter((c) => wanted.has(c.path));
    const created = await service.importScanned(chosen, worldIds);
    git
      .refresh({ force: true, ids: created.map((p) => p.id) })
      .catch((err: unknown) => log.warn('git refresh failed', { error: String(err) }));
    return created;
  });

  handle(CHANNELS.launchEditor, idInput, async ({ id }) => {
    const editor = editorById(service.bootstrap().settings.editor).id;
    const result = await openInEditor(service.folderOf(id), undefined, editor);
    if (result.ok) await service.recordOpenedInEditor(id);
    return result;
  });

  handle(CHANNELS.launchReveal, idInput, async ({ id }) => {
    const folder = service.folderOf(id);
    await assertFolder(folder);
    shell.showItemInFolder(folder);
  });

  // ---- Ignite and the Lab ----

  handle(CHANNELS.blueprintsList, emptyInput, () => listBlueprints());

  handle(CHANNELS.ignite, igniteInput, async (input) => {
    const blueprint = getBlueprint(input.blueprintId);
    if (!blueprint) throw new UserError('That blueprint no longer exists.');
    if (input.path) await assertFolder(input.path);
    const created = await lab.ignite(input, blueprint);
    if (created.path) refreshGitFor(created.id);
    return created;
  });

  handle(CHANNELS.labGet, labProjectInput, ({ projectId }) => lab.lab(projectId));
  handle(CHANNELS.labAddNote, labAddNoteInput, ({ projectId, title, body, x, y }) =>
    lab.addNote(projectId, title, body, { x, y }),
  );
  handle(CHANNELS.labAddChecklist, labAddChecklistInput, ({ projectId, title, items, x, y }) =>
    lab.addChecklist(projectId, title, items, { x, y }),
  );
  handle(CHANNELS.labAddLink, labAddLinkInput, ({ projectId, title, url, x, y }) =>
    lab.addLink(projectId, title, url, { x, y }),
  );
  handle(CHANNELS.labAddFiles, labAddFilesInput, ({ projectId, paths, x, y }) =>
    lab.addFiles(projectId, paths, { x, y }),
  );
  handle(CHANNELS.labPickFiles, labPickFilesInput, async ({ projectId, x, y }) => {
    const win = getWindow();
    const options = {
      title: 'Add files to the Lab',
      properties: ['openFile', 'multiSelections'] as Array<'openFile' | 'multiSelections'>,
    };
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) return null;
    return lab.addFiles(projectId, result.filePaths.slice(0, 50), { x, y });
  });
  handle(CHANNELS.labAddImageData, labAddImageDataInput, ({ projectId, name, bytes, x, y }) =>
    lab.addImageData(projectId, name, bytes, { x, y }),
  );
  handle(CHANNELS.labAddPart, labAddPartInput, ({ projectId, x, y, ...fields }) =>
    lab.addPart(projectId, fields, x !== null && y !== null ? { x, y } : null),
  );
  handle(CHANNELS.labUpdatePart, labUpdatePartInput, ({ id, patch }) => lab.updatePart(id, patch));
  handle(CHANNELS.labAddZone, labAddZoneInput, ({ projectId, title, x, y, w, h }) =>
    lab.addZone(projectId, title, { x, y, w, h }),
  );
  handle(CHANNELS.labRenameZone, labRenameZoneInput, ({ id, title }) => lab.renameZone(id, title));
  handle(CHANNELS.labUpdateItem, labUpdateItemInput, ({ id, patch }) => lab.updateItem(id, patch));
  handle(CHANNELS.labMoveNodes, labMoveNodesInput, ({ projectId, moves }) =>
    lab.moveNodes(projectId, moves),
  );
  handle(CHANNELS.labConnect, labConnectInput, ({ projectId, fromNodeId, toNodeId }) =>
    lab.connect(projectId, fromNodeId, toNodeId),
  );
  handle(CHANNELS.labDisconnect, idInput, ({ id }) => lab.disconnect(id));
  handle(CHANNELS.labRemoveNode, labNodeInput, ({ nodeId }) => lab.removeNode(nodeId));
  handle(CHANNELS.labSetPartsBin, labPartsBinInput, ({ projectId, on }) =>
    lab.setPartsBin(projectId, on),
  );
  handle(CHANNELS.labOpenFile, idInput, async ({ id }) => {
    // shell.openPath resolves to an error message rather than throwing.
    const error = await shell.openPath(lab.filePath(id));
    if (error) throw new UserError(`Couldn't open the file: ${error}`);
  });

  // httpUrl only accepts http(s), so nothing else (file:, javascript:, custom apps) gets out.
  handle(CHANNELS.openUrl, openUrlInput, ({ url }) => shell.openExternal(url));

  handle(CHANNELS.onboardingFinish, onboardingInput, ({ worlds, addSamples }) =>
    service.finishOnboarding(worlds, addSamples),
  );

  handle(CHANNELS.worldsUpdate, updateWorldInput, ({ id, name, color }) =>
    service.updateWorld(id, { name, color }),
  );
  handle(CHANNELS.worldsDelete, idInput, ({ id }) => service.deleteWorld(id));
  handle(CHANNELS.settingsSetEditor, setEditorInput, ({ editor }) =>
    service.updateSettings({ editor }),
  );
  handle(CHANNELS.appRevealData, emptyInput, async () => {
    const error = await shell.openPath(app.getPath('userData'));
    if (error) throw new UserError(`Couldn't open the data folder: ${error}`);
  });

  handle(CHANNELS.backupStatus, emptyInput, () => backups.status());
  handle(CHANNELS.backupChooseFolder, emptyInput, async () => {
    const folder = await pickFolder('Choose where to keep backups (e.g. Google Drive › My Drive)');
    return folder ? backups.useFolder(folder) : null;
  });
  handle(CHANNELS.backupUseFolder, backupUseFolderInput, async ({ folder }) => {
    await assertFolder(folder);
    return backups.useFolder(folder);
  });
  handle(CHANNELS.backupDisable, emptyInput, () => backups.disable());
  handle(CHANNELS.backupNow, emptyInput, () => backups.backupNow());
  handle(CHANNELS.backupRestore, backupRestoreInput, ({ day }) => backups.restore(day));

  handle(CHANNELS.settingsUpdate, updateSettingsInput, async (input) => {
    const previous = service.bootstrap().settings;
    const settings = await service.updateSettings(input);
    onSettingsChanged?.(settings, previous);
    return settings;
  });

  // ---- Git tracking (commits, auto-pause) ----

  // ---- Pause notes and reminders ----

  handle(CHANNELS.projectsTakePendingFocus, emptyInput, () => takePendingFocus?.() ?? null);
  handle(CHANNELS.projectsWorkState, idInput, async ({ id }) => {
    const folder = service.summary(id).path;
    return folder ? readWorkState(folder) : null;
  });

  // ---- Pick up ----

  handle(CHANNELS.projectsPickUp, idInput, ({ id }) =>
    pickUp(id, {
      service,
      settings: () => service.bootstrap().settings,
      openEditor: (dir) =>
        openInEditor(dir, undefined, editorById(service.bootstrap().settings.editor).id),
      openTerminal: (dir) => openTerminal(dir),
      openUrl: (url) => shell.openExternal(url),
    }),
  );

  // ---- Quick capture ----

  handle(CHANNELS.captureSave, captureSaveInput, async ({ projectId, text }) => {
    await service.addNote(projectId, '', text, 'capture');
    await service.updateSettings({ lastCaptureProjectId: projectId });
    // The main window (if open) refreshes its grid and detail panel; the capture window
    // reloads its own data each time it's shown.
    getWindow()?.webContents.send(CHANNELS.projectsChanged, service.summaries());
    capture?.hide();
  });
  handle(CHANNELS.captureClose, emptyInput, () => capture?.hide());
  handle(CHANNELS.captureStatus, emptyInput, (): CaptureStatus => {
    return capture?.status() ?? { shortcut: null, registered: false };
  });

  // ---- Weekly review ----
  handle(CHANNELS.reviewKeep, idInput, ({ id }) => service.reviewKeep(id));
  handle(CHANNELS.reviewFinish, emptyInput, async () => {
    const previous = service.bootstrap().settings;
    const settings = await service.finishReview();
    onSettingsChanged?.(settings, previous);
    return settings;
  });

  ipcMain.on(CHANNELS.logRendererError, (event, raw: unknown) => {
    if (!isTrustedSender(event)) return;
    const report = rendererErrorInput.safeParse(raw);
    if (!report.success) return;
    rendererLog.error(`${report.data.source}: ${report.data.message}`, {
      stack: report.data.stack?.split('\n').slice(0, 6).join(' | '),
    });
  });
}

/** Registers an invoke handler that checks the sender, validates the payload and wraps errors. */
function handle<S extends z.ZodType, R>(
  channel: string,
  schema: S,
  fn: (input: z.infer<S>) => R | Promise<R>,
): void {
  ipcMain.handle(channel, async (event, raw: unknown): Promise<IpcResult<Awaited<R>>> => {
    if (!isTrustedSender(event)) {
      log.warn('rejected call from untrusted frame', { channel });
      return { ok: false, error: 'Request rejected.' };
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      log.warn('invalid payload', { channel, issues: parsed.error.issues.length });
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid request.' };
    }
    try {
      return { ok: true, value: await fn(parsed.data) };
    } catch (err) {
      if (err instanceof UserError) return { ok: false, error: err.message };
      log.error('handler failed', {
        channel,
        error: err instanceof Error ? err.message : String(err),
      });
      return { ok: false, error: 'Something went wrong. The details are in the app log.' };
    }
  });
}

function isTrustedSender(event: IpcMainInvokeEvent | Electron.IpcMainEvent): boolean {
  const url = event.senderFrame?.url;
  return url !== undefined && isAppUrl(url);
}

async function assertFolder(folder: string): Promise<void> {
  try {
    if ((await fs.stat(folder)).isDirectory()) return;
  } catch {
    // fall through
  }
  throw new UserError("That folder doesn't exist anymore. Pick it again.");
}
