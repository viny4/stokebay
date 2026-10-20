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

/**
 * How many commits on HEAD are newer than `sinceMs` (commit time). Best effort: anything that
 * goes wrong counts as one commit, since the caller already knows at least one is new.
 */
export async function countCommitsSince(dir: string, sinceMs: number): Promise<number> {
  try {
    const git = simpleGit({ baseDir: dir, maxConcurrentProcesses: 1, timeout: { block: 15_000 } });
    // --max-age takes raw epoch seconds, so no date parsing can shift the boundary. Commit times
    // are whole seconds; +1 leaves out the commit we already knew about.
    const since = Math.floor(sinceMs / 1000) + 1;
    const out = await git.raw(['rev-list', '--count', `--max-age=${since}`, 'HEAD']);
    return Math.max(1, Number.parseInt(out.trim(), 10) || 1);
  } catch {
    return 1;
  }
}

export interface GitRefresherOptions {
  list: () => { id: Id; path: string; git: GitInfo | null }[];
  read?: (dir: string) => Promise<GitInfo | null>;
  /** Counts commits newer than a time; used only when a repo's last commit moved forward. */
  countSince?: (dir: string, sinceMs: number) => Promise<number>;
  /**
   * Saves new info; resolves true when something actually changed. `newCommits` holds, per
   * project whose last commit moved forward, how many commits are new.
   */
  save: (updates: Map<Id, GitInfo | null>, newCommits: Map<Id, number>) => Promise<boolean>;
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
  /** Forced requests that arrived mid-run: 'all', or the ids still to read. */
  private queuedIds: Set<Id> | 'all' | null = null;
  private queuedRun: Promise<void> | null = null;
  private readonly runListeners: (() => void)[] = [];

  constructor(private readonly options: GitRefresherOptions) {}

  refresh(opts: { force?: boolean; ids?: Id[] } = {}): Promise<void> {
    if (this.running) return opts.force ? this.queue(opts.ids) : this.running;
    const clock = this.options.clock ?? Date.now;
    const minInterval = this.options.minIntervalMs ?? 15_000;
    if (!opts.force && clock() - this.lastRunAt < minInterval) return Promise.resolve();
    this.lastRunAt = clock();
    this.running = this.run(opts.ids).finally(() => {
      this.running = null;
      for (const listener of this.runListeners) {
        try {
          listener();
        } catch (err) {
          log.warn('after-run listener failed', { error: String(err) });
        }
      }
    });
    return this.running;
  }

  /** Called after every run, e.g. to start watching repos that were just added. */
  afterEachRun(listener: () => void): void {
    this.runListeners.push(listener);
  }

  /**
   * A forced request (a watched repo just committed, a folder was just added) may need data the
   * current run has already read, so it gets one more run once this one ends. Requests that
   * pile up meanwhile share that run.
   */
  private queue(ids: Id[] | undefined): Promise<void> {
    if (!ids) this.queuedIds = 'all';
    else if (this.queuedIds !== 'all')
      this.queuedIds = new Set([...(this.queuedIds ?? []), ...ids]);
    this.queuedRun ??= (this.running ?? Promise.resolve())
      .catch(() => undefined)
      .then(() => {
        const queued = this.queuedIds;
        this.queuedIds = null;
        this.queuedRun = null;
        return this.refresh({
          force: true,
          ids: queued === 'all' || !queued ? undefined : [...queued],
        });
      });
    return this.queuedRun;
  }

  private async run(ids?: Id[]): Promise<void> {
    const read = this.options.read ?? ((dir: string) => readGitInfo(dir));
    const countSince = this.options.countSince ?? countCommitsSince;
    const projects = this.options.list().filter((p) => !ids || ids.includes(p.id));
    if (projects.length === 0) return;
    const newCommits = new Map<Id, number>();
    const results = await mapLimit(projects, MAX_PARALLEL_REPOS, async (p) => {
      const next = await read(p.path);
      // On a failed read, keep the last good commit info and just flag the error.
      if (next?.error && p.git)
        return { ...p.git, error: next.error, refreshedAt: next.refreshedAt };
      // Only a forward move means new work; an earlier date is a branch switch or a reset.
      const before = p.git?.lastCommitAt ?? null;
      if (before !== null && next?.lastCommitAt != null && next.lastCommitAt > before) {
        newCommits.set(p.id, await countSince(p.path, before));
      }
      return next;
    });
    const updates = new Map(projects.map((p, i) => [p.id, results[i]] as const));
    if (await this.options.save(updates, newCommits)) this.options.onChanged();
  }
}
