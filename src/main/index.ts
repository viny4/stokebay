import { app, BrowserWindow, net, protocol, session } from 'electron';
import started from 'electron-squirrel-startup';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CHANNELS } from '../shared/ipc';
import { BackupController } from './backup-controller';
import { registerIpcHandlers } from './ipc/handlers';
import { createLogger, enableFileLogging, setLogLevel } from './logging/logger';
import { runDailyBackup } from './services/backup';
import { GitRefresher } from './services/git';
import { LabService } from './services/lab';
import { MediaStore } from './services/media';
import { ProjectService } from './services/projects';
import { JsonStore } from './store/json-store';
import { adoptLegacyData, LEGACY_FOLDER } from './store/legacy';
import { createMainWindow } from './window';

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
    const store = await JsonStore.open(dataDir);
    log.info('data loaded', { dataDir });

    const service = new ProjectService(store);
    const backups = new BackupController({
      service,
      dataDir,
      flush: () => store.flush(),
      restart: () => {
        app.relaunch();
        app.exit(0);
      },
    });

    // Once at startup, then every few hours for apps left open for days: the local daily copy,
    // and the copy to the user's backup folder (e.g. Google Drive) if one is set.
    const backup = async () => {
      try {
        const file = await runDailyBackup(store.file, path.join(dataDir, 'backups'));
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
      save: (updates) => service.saveGitInfo(updates),
      onChanged: () => mainWindow?.webContents.send(CHANNELS.projectsChanged, service.summaries()),
    });
    const media = new MediaStore(path.join(dataDir, 'media'));
    const lab = new LabService(store, service, media);
    registerIpcHandlers({ service, lab, media, backups, git, getWindow: () => mainWindow });

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
      });
      mainWindow = win;
    };
    openWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) openWindow?.();
    });
    app.on('before-quit', () => {
      store.flush().catch(() => undefined);
    });
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
