import { BrowserWindow, nativeTheme, screen } from 'electron';
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
    // Matches the page background in each mode so nothing flashes while it paints.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1b1a19' : '#fbfaf8',
    title: 'Stokebay',
    // macOS: no title bar strip; the traffic lights sit inside the sidebar like native apps.
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 16, y: 16 } }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Showing only when ready avoids a flash before the UI paints.
  win.once('ready-to-show', () => win.show());

  lockDown(win);
  loadRenderer(win);
  return win;
}

/** True for pages that belong to the app (dev server in development, bundled files when packaged). */
export function isAppUrl(url: string): boolean {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) return url.startsWith(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  return url.startsWith('file://');
}

/** The window only ever shows the app itself; links open in the system browser through IPC. */
function lockDown(win: BrowserWindow): void {
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

/**
 * Loads the renderer page. `hash` picks another screen of the same page (the capture window
 * uses `#capture`), so no second Vite entry is needed.
 */
function loadRenderer(win: BrowserWindow, hash?: string): void {
  const devUrl = MAIN_WINDOW_VITE_DEV_SERVER_URL;
  const load = devUrl
    ? win.loadURL(hash ? `${devUrl}#${hash}` : devUrl)
    : win.loadFile(
        path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
        hash ? { hash } : undefined,
      );
  load.catch((err: unknown) => log.error('failed to load renderer', { error: String(err) }));
}

// ---- Quick capture window ----

const CAPTURE_WIDTH = 560;
const CAPTURE_HEIGHT = 208;

// Matches --raised in index.css (the capture panel's colour), so showing it never flashes.
const captureBackground = () => (nativeTheme.shouldUseDarkColors ? '#2b2928' : '#ffffff');

let captureWindow: BrowserWindow | null = null;
let captureReady = false;

/**
 * The small window the capture shortcut opens. Made once on first use, then only hidden and
 * shown again, so every later press appears instantly.
 */
export function createCaptureWindow(): BrowserWindow {
  const existing = getCaptureWindow();
  if (existing) return existing;
  const win = new BrowserWindow({
    width: CAPTURE_WIDTH,
    height: CAPTURE_HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: captureBackground(),
    title: 'Quick capture',
    // macOS: a panel takes the keyboard without bringing the app and its main window forward,
    // floats over full-screen apps and appears on the current Space, like Spotlight. When it
    // hides, focus goes straight back to the app the user was in.
    ...(process.platform === 'darwin' ? { type: 'panel' } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  captureReady = false;
  win.once('ready-to-show', () => {
    captureReady = true;
  });
  // Clicking anywhere else puts it away, like Spotlight. The typed text stays for next time.
  win.on('blur', () => {
    if (!win.isDestroyed() && win.isVisible()) win.hide();
  });
  win.on('closed', () => {
    if (captureWindow === win) {
      captureWindow = null;
      captureReady = false;
    }
  });
  lockDown(win);
  loadRenderer(win, 'capture');
  captureWindow = win;
  return win;
}

/** The capture window if it has been made (it may be hidden). */
export function getCaptureWindow(): BrowserWindow | null {
  return captureWindow && !captureWindow.isDestroyed() ? captureWindow : null;
}

/** Shows the capture window centred on the display under the pointer, a little above middle. */
export function showCaptureWindow(): void {
  const win = createCaptureWindow();
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const [width, height] = win.getSize();
  win.setBounds({
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + Math.max(0, area.height * 0.32 - height / 2)),
    width,
    height,
  });
  // The system theme may have changed since it was last shown.
  win.setBackgroundColor(captureBackground());
  const reveal = () => {
    if (win.isDestroyed()) return;
    win.show();
    win.focus();
  };
  if (captureReady) reveal();
  else win.once('ready-to-show', reveal);
}

export function hideCaptureWindow(): void {
  const win = getCaptureWindow();
  if (win?.isVisible()) win.hide();
}

/** The shortcut opens the window; pressing it again puts it away. */
export function toggleCaptureWindow(): void {
  if (getCaptureWindow()?.isVisible()) hideCaptureWindow();
  else showCaptureWindow();
}
