import { BrowserWindow } from 'electron';
import path from 'node:path';
import { createLogger } from './logging/logger';

const log = createLogger('window');

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#04070c',
    title: 'Stokebay',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Showing only when ready avoids a white flash before the dark UI paints.
  win.once('ready-to-show', () => win.show());

  // The window only ever shows the app itself; links open in the system browser through IPC.
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  const load = MAIN_WINDOW_VITE_DEV_SERVER_URL
    ? win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
    : win.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  load.catch((err: unknown) => log.error('failed to load renderer', { error: String(err) }));

  return win;
}

/** True for pages that belong to the app (dev server in development, bundled files when packaged). */
export function isAppUrl(url: string): boolean {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) return url.startsWith(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  return url.startsWith('file://');
}
