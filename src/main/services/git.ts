import fs from 'node:fs/promises';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import type { GitInfo, Id } from '../../shared/types';
import { createLogger } from '../logging/logger';
import { mapLimit } from './concurrency';

const log = createLogger('git');

/** Each repo refresh runs its git commands one after another, so this caps git processes too. */
export const MAX_PARALLEL_REPOS = 4;

/**
 * Reads the branch and last commit of the repo at `dir`. Returns null when the folder isn't a
 * Git repo; returns info with `error` set when the folder is missing or Git fails.
 */
export async function readGitInfo(dir: string, now: number = Date.now()): Promise<GitInfo | null> {
  try {
    await fs.access(dir);
  } catch {
    return {
      branch: null,
      lastCommitAt: null,
      lastCommitMsg: null,
      refreshedAt: now,
      error: 'Folder not found',
    };
  }
  try {
    await fs.access(path.join(dir, '.git'));
  } catch {
    return null;
  }

  const git = simpleGit({ baseDir: dir, maxConcurrentProcesses: 1, timeout: { block: 15_000 } });
  try {
    let branch: string | null = null;
    try {
      branch = (await git.raw(['symbolic-ref', '--short', '-q', 'HEAD'])).trim() || null;
    } catch {
      // Detached HEAD: show the short commit instead of a branch name.
      const sha = (await git.raw(['rev-parse', '--short', 'HEAD']).catch(() => '')).trim();
      branch = sha ? `detached @ ${sha}` : null;
    }

    let lastCommitAt: number | null = null;
    let lastCommitMsg: string | null = null;
    // %x1f (unit separator) can't appear in a subject line, so the split is unambiguous.
    const out = await git.raw(['log', '-1', '--format=%ct%x1f%s']).catch(() => '');
    const [seconds, subject] = out.trim().split('\x1f');
    if (seconds) {
      lastCommitAt = Number(seconds) * 1000;
      lastCommitMsg = subject ?? '';
    }
    return { branch, lastCommitAt, lastCommitMsg, refreshedAt: now, error: null };
  } catch (err) {
    log.warn('git read failed', { error: err instanceof Error ? err.message : String(err) });
    return {
      branch: null,
      lastCommitAt: null,
      lastCommitMsg: null,
      refreshedAt: now,
      error: 'Git could not read this folder',
    };
  }
}

export interface GitRefresherOptions {
  list: () => { id: Id; path: string; git: GitInfo | null }[];
  read?: (dir: string) => Promise<GitInfo | null>;
  /** Saves new info; resolves true when something actually changed. */
  save: (updates: Map<Id, GitInfo | null>) => Promise<boolean>;
  onChanged: () => void;
  minIntervalMs?: number;
  clock?: () => number;
}

/**
 * Refreshes cached Git info in the background (on window focus and after imports) so the grid
 * never waits on Git. Overlapping requests share one run; focus spam is throttled.
 */
export class GitRefresher {
  private running: Promise<void> | null = null;
  private lastRunAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly options: GitRefresherOptions) {}

  refresh(opts: { force?: boolean; ids?: Id[] } = {}): Promise<void> {
    if (this.running) return this.running;
    const clock = this.options.clock ?? Date.now;
    const minInterval = this.options.minIntervalMs ?? 15_000;
    if (!opts.force && clock() - this.lastRunAt < minInterval) return Promise.resolve();
    this.lastRunAt = clock();
    this.running = this.run(opts.ids).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async run(ids?: Id[]): Promise<void> {
    const read = this.options.read ?? ((dir: string) => readGitInfo(dir));
    const projects = this.options.list().filter((p) => !ids || ids.includes(p.id));
    if (projects.length === 0) return;
    const results = await mapLimit(projects, MAX_PARALLEL_REPOS, async (p) => {
      const next = await read(p.path);
      // On a failed read, keep the last good commit info and just flag the error.
      if (next?.error && p.git)
        return { ...p.git, error: next.error, refreshedAt: next.refreshedAt };
      return next;
    });
    const updates = new Map(projects.map((p, i) => [p.id, results[i]] as const));
    if (await this.options.save(updates)) this.options.onChanged();
  }
}
