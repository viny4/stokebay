import {
  app,
  globalShortcut,
  net,
  Notification,
  protocol,
  session,
  type BrowserWindow,
} from 'electron';
import started from 'electron-squirrel-startup';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CHANNELS } from '../shared/ipc';
import type { AppSettings } from '../shared/types';
import { BackupController } from './backup-controller';
import { registerIpcHandlers } from './ipc/handlers';
import { createLogger, enableFileLogging, setLogLevel } from './logging/logger';
import { runDailyBackup } from './services/backup';
import { GitRefresher } from './services/git';
import { GitWatcher } from './services/git-watcher';
import { LabService } from './services/lab';
import { MediaStore } from './services/media';
import { ProjectService } from './services/projects';
import { startReminders } from './services/reminders';
import { SqliteStore } from './store/sqlite-store';
import { adoptLegacyData, LEGACY_FOLDER } from './store/legacy';
import { createMainWindow, hideCaptureWindow, toggleCaptureWindow } from './window';
import { CaptureShortcut } from './capture-shortcut';

const log = createLogger('main');

// The Windows installer launches the app briefly to create shortcuts; nothing else should run then.
if (started) app.quit();

// STOKEBAY_DATA_DIR lets trial runs use a throwaway folder instead of the real data. It
// also moves userData, so a trial run gets its own single-instance lock.
const trialDataDir = process.env.STOKEBAY_DATA_DIR;
if (trialDataDir) app.setPath('userData', trialDataDir);

// Lab images are shown through hud-media://entry/<id>. It must be registered before the app
// is ready; the handler (below) only serves files that belong to a Lab entry.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'hud-media',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

// One instance only: two copies writing the same data file would overwrite each other's changes.
if (!app.requestSingleInstanceLock()) {
  // Say why, otherwise this looks like a silent crash in the terminal.
  log.info('Stokebay is already running; showing that window instead.');
  app.quit();
} else {
  let mainWindow: BrowserWindow | null = null;
  let openWindow: (() => void) | null = null;
  setLogLevel(app.isPackaged ? 'info' : 'debug');
  // The installed app has no terminal, so its log goes to ~/Library/Logs/Stokebay/.
  if (app.isPackaged) enableFileLogging(app.getPath('logs'));

  // A second launch brings the running copy forward. On macOS that copy may have no window
  // left (closing the window doesn't quit), so open a fresh one.
  app.on('second-instance', () => {
    if (!mainWindow) {
      openWindow?.();
      return;
    }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  const start = async () => {
    // The app never needs camera, microphone, notifications or similar permissions.
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) =>
      callback(false),
    );

    // A fresh install starts empty; first-run setup offers the example projects.
    const dataDir = app.getPath('userData');
    // Trial runs start clean on purpose; real runs pick up data from the old app name once.
    if (!trialDataDir && (await adoptLegacyData(app.getPath('appData'), dataDir))) {
      log.info('copied data from the previous app name', { from: LEGACY_FOLDER });
    }
    const store = await SqliteStore.open(dataDir);
    log.info('data loaded', { dataDir });
    // Backups stay in the readable JSON format, so older backups remain restorable.
    const exportJson = () => `${JSON.stringify(store.snapshot(), null, 2)}\n`;

    const service = new ProjectService(store);
    const backups = new BackupController({
      service,
      dataDir,
      flush: () => store.flush(),
      snapshot: exportJson,
      restart: () => {
        app.relaunch();
        app.exit(0);
      },
    });

    // Once at startup, then every few hours for apps left open for days: the local daily copy,
    // and the copy to the user's backup folder (e.g. Google Drive) if one is set.
    const backup = async () => {
      try {
        const file = await runDailyBackup(exportJson, path.join(dataDir, 'backups'));
        if (file) log.info('daily backup written', { file: path.basename(file) });
      } catch (err) {
        log.error('daily backup failed', { error: String(err) });
      }
      try {
        if (await backups.backupIfDue()) log.info('folder backup written');
      } catch (err) {
        log.error('folder backup failed', { error: String(err) });
      }
    };
    void backup();
    setInterval(() => void backup(), 6 * 60 * 60 * 1000).unref();

    const git = new GitRefresher({
      list: () => service.projectsWithFolders(),
      save: (updates, newCommits) => service.saveGitInfo(updates, newCommits),
      onChanged: () => mainWindow?.webContents.send(CHANNELS.projectsChanged, service.summaries()),
    });
    const media = new MediaStore(path.join(dataDir, 'media'));
    const lab = new LabService(store, service, media);
    // A project to show once a window created for it is ready (see focusProject below).
    let pendingFocus: string | null = null;
    // Features that react to settings changes add themselves here (capture shortcut, auto-pause).
    const settingsListeners: ((settings: AppSettings, previous: AppSettings) => void)[] = [];
    registerIpcHandlers({
      service,
      lab,
      media,
      backups,
      git,
      getWindow: () => mainWindow,
      onSettingsChanged: (settings, previous) =>
        settingsListeners.forEach((listener) => listener(settings, previous)),
      // Only called once startup has finished, when captureShortcut (below) exists.
      capture: { hide: hideCaptureWindow, status: () => captureShortcut.status() },
      takePendingFocus: () => {
        const id = pendingFocus;
        pendingFocus = null;
        return id;
      },
    });

    // ---- Git tracking (commits, auto-pause) ----
    // Commits reach the timeline through repo watchers; every run (focus, import, folder
    // edit, the periodic fallback) re-syncs which repos are watched.
    const gitWatcher = new GitWatcher({ refresh: (ids) => git.refresh({ force: true, ids }) });
    git.afterEachRun(() => void gitWatcher.sync(service.projectsWithFolders()));
    // Catches what watchers can't see: worktrees, submodules, repos past the watch cap.
    setInterval(
      () =>
        void git
          .refresh()
          .catch((err: unknown) => log.warn('git refresh failed', { error: String(err) })),
      10 * 60 * 1000,
    ).unref();

    const autoPause = async () => {
      try {
        const paused = await service.autoPause();
        if (paused.length === 0) return;
        log.info('projects paused automatically', { count: paused.length });
        mainWindow?.webContents.send(CHANNELS.projectsChanged, service.summaries());
      } catch (err) {
        log.error('auto-pause failed', { error: String(err) });
      }
    };
    // After the first Git read, so recent commits count as activity and nothing pauses early.
    void git
      .refresh()
      .catch((err: unknown) => log.warn('git refresh failed', { error: String(err) }))
      .then(autoPause);
    setInterval(() => void autoPause(), 6 * 60 * 60 * 1000).unref();
    settingsListeners.push((settings, previous) => {
      if (settings.autoPauseDays !== previous.autoPauseDays) void autoPause();
    });
    app.on('will-quit', () => void gitWatcher.close());

    // ---- Pause reminders ----
    // A clicked reminder brings the app forward on that project. A window created just now
    // can't listen yet, so it asks for the project itself once it has started.
    const focusProject = (projectId: string) => {
      if (!mainWindow) {
        pendingFocus = projectId;
        openWindow?.();
        return;
      }
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send(CHANNELS.projectsFocus, projectId);
    };
    startReminders({ repo: store, Notification, onOpen: focusProject });

    // ---- Quick capture ----
    // The shortcut works from any app, and also while the main window is closed (macOS keeps
    // the app running), because saving never goes through the main window.
    const captureShortcut = new CaptureShortcut(
      globalShortcut,
      toggleCaptureWindow,
      (accelerator, reason) =>
        log.warn('quick capture shortcut not registered', { accelerator, reason }),
    );
    captureShortcut.apply(service.bootstrap().settings.captureShortcut);
    settingsListeners.push((settings) => void captureShortcut.apply(settings.captureShortcut));
    app.on('will-quit', () => globalShortcut.unregisterAll());

    protocol.handle('hud-media', async (request) => {
      const url = new URL(request.url);
      const entryId = decodeURIComponent(url.pathname.replace(/^\//, ''));
      if (url.hostname !== 'entry' || !entryId) return new Response('Not found', { status: 404 });
      try {
        return await net.fetch(pathToFileURL(lab.filePath(entryId)).toString());
      } catch {
        return new Response('Not found', { status: 404 });
      }
    });

    openWindow = () => {
      const win = createMainWindow();
      // Coming back to the app is the moment Git info is most likely stale.
      win.on('focus', () => {
        git
          .refresh()
          .catch((err: unknown) => log.warn('git refresh failed', { error: String(err) }));
      });
      win.on('closed', () => {
        if (mainWindow === win) mainWindow = null;
        // The hidden capture window still counts as a window, so 'window-all-closed' (below)
        // never fires once it exists; quit here in the same cases.
        if (process.platform !== 'darwin' || !app.isPackaged) app.quit();
      });
      mainWindow = win;
    };
    openWindow();

    // Clicking the Dock icon reopens the main window. Checked by the main window itself, as the
    // hidden capture window would otherwise make it look like a window is still open.
    app.on('activate', () => {
      if (!mainWindow) openWindow?.();
    });
    app.on('will-quit', () => store.close());
  };

  app
    .whenReady()
    .then(start)
    .catch((err: unknown) => {
      log.error('startup failed', { error: err instanceof Error ? err.message : String(err) });
      app.quit();
    });

  // macOS apps normally stay running with no windows. During development that leaves hidden
  // copies behind that block the next `npm start`, so dev builds quit when the window closes.
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' || !app.isPackaged) app.quit();
  });
}
