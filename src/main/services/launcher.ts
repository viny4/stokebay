import { execFile, spawn } from 'node:child_process';
import { editorById, type EditorId } from '../../shared/editors';
import { terminalById, type Terminal, type TerminalId } from '../../shared/terminals';
import type { LaunchResult } from '../../shared/types';
import { createLogger } from '../logging/logger';

const log = createLogger('launcher');

export const CODE_NOT_FOUND_MESSAGE =
  "Couldn't open VS Code. If it's installed, open it, press Cmd+Shift+P, run " +
  '"Shell Command: Install \'code\' command in PATH", then try again.';

export interface LauncherDeps {
  /** Starts a program and resolves once it has launched (rejects with ENOENT if missing). */
  spawnDetached: (command: string, args: string[], options?: { cwd?: string }) => Promise<void>;
  /** Runs a program to completion; rejects on a non-zero exit. */
  run: (command: string, args: string[]) => Promise<void>;
  platform: NodeJS.Platform;
}

const defaultDeps: LauncherDeps = {
  spawnDetached: (command, args, options) =>
    new Promise((resolve, reject) => {
      const child = spawn(command, args, { detached: true, stdio: 'ignore', cwd: options?.cwd });
      child.once('error', reject);
      child.once('spawn', () => {
        child.unref();
        resolve();
      });
    }),
  run: (command, args) =>
    new Promise((resolve, reject) => {
      execFile(command, args, (err) => (err ? reject(err) : resolve()));
    }),
  platform: process.platform,
};

/**
 * Opens a folder in the chosen editor (VS Code by default). Always argument arrays, never a
 * shell string. Apps started from Finder don't get the terminal's PATH, so the editor's
 * command is often missing there; on macOS fall back to asking for the app by name.
 */
export async function openInEditor(
  dir: string,
  deps: LauncherDeps = defaultDeps,
  editorId: EditorId = 'vscode',
): Promise<LaunchResult> {
  const editor = editorById(editorId);
  try {
    await deps.spawnDetached(editor.cli, [dir]);
    return { ok: true, message: null };
  } catch (err) {
    log.debug('editor command not available', {
      editor: editor.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  if (deps.platform === 'darwin') {
    try {
      await deps.run('open', ['-a', editor.app, dir]);
      return { ok: true, message: null };
    } catch (err) {
      log.debug('open -a failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }
  return {
    ok: false,
    message:
      editor.id === 'vscode'
        ? CODE_NOT_FOUND_MESSAGE
        : `Couldn't open ${editor.name}. Is it installed? You can pick another editor in Settings.`,
  };
}

export const TERMINAL_NOT_FOUND_MESSAGE = "Couldn't open a terminal in the project folder.";

/**
 * How each named terminal is told which folder to start in. On macOS these go through
 * `open -na <App> --args …`, the way their docs recommend for starting a new window.
 */
const TERMINAL_DIR_ARGS: Record<
  Exclude<TerminalId, 'default' | 'iterm' | 'warp'>,
  (dir: string) => string[]
> = {
  ghostty: (dir) => [`--working-directory=${dir}`],
  kitty: (dir) => ['--directory', dir],
  alacritty: (dir) => ['--working-directory', dir],
  wezterm: (dir) => ['start', '--cwd', dir],
};

/**
 * Opens a terminal window in `dir`: the chosen one, or the system's own when it's `default`.
 * The folder always goes in as its own argument (or as the working directory), never inside a
 * shell string. A missing chosen terminal is reported rather than swapped for another one, so
 * the user knows to change it in Settings.
 */
export async function openTerminal(
  dir: string,
  deps: LauncherDeps = defaultDeps,
  terminalId: TerminalId = 'default',
): Promise<LaunchResult> {
  const terminal = terminalById(terminalId);
  const attempts: (() => Promise<void>)[] =
    terminal.id === 'default' ? systemTerminal(dir, deps) : namedTerminal(terminal, dir, deps);
  for (const attempt of attempts) {
    try {
      await attempt();
      return { ok: true, message: null };
    } catch (err) {
      log.debug('terminal command failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return {
    ok: false,
    message:
      terminal.id === 'default'
        ? TERMINAL_NOT_FOUND_MESSAGE
        : `Couldn't open ${terminal.name}. Is it installed? You can pick another terminal in Settings.`,
  };
}

function systemTerminal(dir: string, deps: LauncherDeps): (() => Promise<void>)[] {
  if (deps.platform === 'darwin') return [() => deps.run('open', ['-a', 'Terminal', dir])];
  if (deps.platform === 'win32') {
    return [
      // Windows Terminal when installed, otherwise a plain Command Prompt in the folder.
      () => deps.spawnDetached('wt', ['-d', dir]),
      () => deps.spawnDetached('cmd.exe', ['/K'], { cwd: dir }),
    ];
  }
  return [
    // Debian-style systems point this at the user's chosen terminal.
    () => deps.spawnDetached('x-terminal-emulator', [], { cwd: dir }),
    () => deps.spawnDetached('gnome-terminal', [`--working-directory=${dir}`]),
    () => deps.spawnDetached('konsole', ['--workdir', dir]),
  ];
}

function namedTerminal(
  terminal: Terminal,
  dir: string,
  deps: LauncherDeps,
): (() => Promise<void>)[] {
  if (terminal.id === 'default') return systemTerminal(dir, deps);
  if (deps.platform === 'darwin') {
    // iTerm and Warp open a folder handed to them like a document.
    if (terminal.id === 'iterm' || terminal.id === 'warp') {
      return [() => deps.run('open', ['-a', terminal.app, dir])];
    }
    return [
      () =>
        deps.run('open', ['-na', terminal.app, '--args', ...TERMINAL_DIR_ARGS[terminal.id](dir)]),
    ];
  }
  // iTerm has no command outside macOS; Warp's starts in its working directory.
  if (terminal.id === 'iterm') return [];
  if (terminal.id === 'warp') return [() => deps.spawnDetached(terminal.cli, [], { cwd: dir })];
  const args = TERMINAL_DIR_ARGS[terminal.id](dir);
  return [() => deps.spawnDetached(terminal.cli, args, { cwd: dir })];
}
