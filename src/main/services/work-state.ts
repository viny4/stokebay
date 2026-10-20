// What Git shows about unfinished work in a project folder: the branch, the last commit and the
// files not committed yet. Read when a project is paused, so the resume card can say where
// things stood even if the user wrote nothing.
import { simpleGit } from 'simple-git';
import type { GitWorkState } from '../../shared/types';
import { createLogger } from '../logging/logger';
import { readGitInfo } from './git';

const log = createLogger('work-state');

/** More than this many file names is noise in a pause note; the count still covers them all. */
export const MAX_LISTED_FILES = 20;

/**
 * Returns null when the folder isn't a Git repo or Git can't read it. Pausing must never fail
 * because of Git, so errors are logged and swallowed.
 */
export async function readWorkState(dir: string, timeoutMs = 5_000): Promise<GitWorkState | null> {
  try {
    const info = await readGitInfo(dir);
    if (!info || info.error) return null;

    const git = simpleGit({
      baseDir: dir,
      maxConcurrentProcesses: 1,
      timeout: { block: timeoutMs },
    });
    // --no-optional-locks: a background read must never block the user's own git commands.
    // -z: paths come back raw (no quoting), separated by NUL.
    const out = await git.raw(['--no-optional-locks', 'status', '--porcelain', '-z']);
    const changed = parsePorcelainZ(out);
    return {
      branch: info.branch,
      lastCommitAt: info.lastCommitAt,
      lastCommitMsg: info.lastCommitMsg,
      changedFiles: changed.slice(0, MAX_LISTED_FILES),
      changedCount: changed.length,
    };
  } catch (err) {
    log.warn('work state read failed', { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/** Paths from `git status --porcelain -z`. Renames list the new name only. */
export function parsePorcelainZ(out: string): string[] {
  const parts = out.split('\0');
  const files: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const record = parts[i];
    if (record.length < 4) continue;
    files.push(record.slice(3));
    // A rename or copy is followed by its original path as a separate field.
    if (record[0] === 'R' || record[0] === 'C') i++;
  }
  return files;
}
