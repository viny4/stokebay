import { execFile, spawn } from 'node:child_process';
import type { LaunchResult } from '../../shared/types';
import { createLogger } from '../logging/logger';

const log = createLogger('launcher');

export const CODE_NOT_FOUND_MESSAGE =
  "Couldn't open VS Code. If it's installed, open it, press Cmd+Shift+P, run " +
  '"Shell Command: Install \'code\' command in PATH", then try again.';

export interface LauncherDeps {
  /** Starts a program and resolves once it has launched (rejects with ENOENT if missing). */
  spawnDetached: (command: string, args: string[]) => Promise<void>;
  /** Runs a program to completion; rejects on a non-zero exit. */
  run: (command: string, args: string[]) => Promise<void>;
  platform: NodeJS.Platform;
}

const defaultDeps: LauncherDeps = {
  spawnDetached: (command, args) =>
    new Promise((resolve, reject) => {
      const child = spawn(command, args, { detached: true, stdio: 'ignore' });
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
 * Opens a folder in VS Code. Always argument arrays, never a shell string. Apps started from
 * Finder don't get the terminal's PATH, so `code` is often missing there; on macOS fall back
 * to asking Launch Services for the app by name.
 */
export async function openInEditor(
  dir: string,
  deps: LauncherDeps = defaultDeps,
): Promise<LaunchResult> {
  try {
    await deps.spawnDetached('code', [dir]);
    return { ok: true, message: null };
  } catch (err) {
    log.debug('`code` not available', { error: err instanceof Error ? err.message : String(err) });
  }
  if (deps.platform === 'darwin') {
    try {
      await deps.run('open', ['-a', 'Visual Studio Code', dir]);
      return { ok: true, message: null };
    } catch (err) {
      log.debug('open -a failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { ok: false, message: CODE_NOT_FOUND_MESSAGE };
}
