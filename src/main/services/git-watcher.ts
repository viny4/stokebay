// Watches project repos so new commits, checkouts and pulls reach the timeline without the user
// doing anything. Only two small files per repo are watched, never the working tree, so a busy
// project folder costs nothing.
import fs from 'node:fs/promises';
import path from 'node:path';
import { watch } from 'chokidar';
import type { GitInfo, Id } from '../../shared/types';
import { createLogger } from '../logging/logger';

const log = createLogger('git-watch');

/** Each watched repo holds a few file handles; past this many, the periodic refresh covers the rest. */
export const MAX_WATCHED_REPOS = 500;
/** A commit, rebase or pull writes these files several times; one refresh after it settles. */
export const WATCH_DEBOUNCE_MS = 2_000;

export interface RepoWatch {
  close(): Promise<void> | void;
}

/** Starts watching `files`, calling `onChange` on any change and `onError` if the watch fails. */
export type WatchFactory = (
  files: string[],
  onChange: () => void,
  onError: (err: unknown) => void,
) => RepoWatch;

export const chokidarWatch: WatchFactory = (files, onChange, onError) => {
  const watcher = watch(files, { ignoreInitial: true });
  watcher.on('all', () => onChange());
  watcher.on('error', onError);
  return { close: () => watcher.close() };
};

/**
 * HEAD changes on checkout; logs/HEAD gets a line on every commit, merge, pull and reset. Both
 * are written by renaming a lock file over them, which file watchers follow.
 */
export function watchedFiles(repoDir: string): string[] {
  return [path.join(repoDir, '.git', 'HEAD'), path.join(repoDir, '.git', 'logs', 'HEAD')];
}

/**
 * Only plain repos are watched. Worktrees and submodules have a `.git` file pointing elsewhere;
 * they are left to the periodic refresh rather than chasing the pointer.
 */
async function hasGitFolder(dir: string): Promise<boolean> {
  try {
    return (await fs.stat(path.join(dir, '.git'))).isDirectory();
  } catch {
    return false;
  }
}

export interface GitWatcherOptions {
  /** Re-reads Git for these projects (GitRefresher.refresh with force). */
  refresh: (ids: Id[]) => Promise<void>;
  watch?: WatchFactory;
  debounceMs?: number;
  maxRepos?: number;
}

interface Watched {
  path: string;
  watch: RepoWatch;
  timer: ReturnType<typeof setTimeout> | null;
}

export class GitWatcher {
  private readonly repos = new Map<Id, Watched>();
  private syncing: Promise<void> = Promise.resolve();
  private closed = false;

  constructor(private readonly options: GitWatcherOptions) {}

  /** Number of repos being watched right now. */
  get size(): number {
    return this.repos.size;
  }

  /**
   * Watches exactly these projects' repos: starts new ones, stops removed or moved ones. Calls
   * run one after another so two quick syncs can't both start a watch for the same repo.
   */
  sync(projects: { id: Id; path: string; git?: GitInfo | null }[]): Promise<void> {
    this.syncing = this.syncing
      .then(() => this.apply(projects))
      .catch((err: unknown) => log.warn('watch sync failed', { error: String(err) }));
    return this.syncing;
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.syncing;
    const repos = [...this.repos.keys()];
    await Promise.all(repos.map((id) => this.stop(id)));
  }

  private async apply(projects: { id: Id; path: string; git?: GitInfo | null }[]): Promise<void> {
    if (this.closed) return;
    const max = this.options.maxRepos ?? MAX_WATCHED_REPOS;
    // With more repos than the cap, the recently committed ones are the likeliest to change.
    const byRecent = [...projects].sort(
      (a, b) => (b.git?.lastCommitAt ?? 0) - (a.git?.lastCommitAt ?? 0),
    );
    const isRepo = await Promise.all(byRecent.map((p) => hasGitFolder(p.path)));
    const wanted = new Map(
      byRecent
        .filter((_, i) => isRepo[i])
        .slice(0, max)
        .map((p) => [p.id, p.path] as const),
    );
    if (isRepo.filter(Boolean).length > max) {
      log.info('watching only the most recent repos', { max });
    }

    for (const [id, repo] of [...this.repos]) {
      if (wanted.get(id) !== repo.path) await this.stop(id);
    }
    for (const [id, dir] of wanted) {
      if (this.closed) return;
      if (!this.repos.has(id)) this.start(id, dir);
    }
  }

  private start(id: Id, dir: string): void {
    const factory = this.options.watch ?? chokidarWatch;
    try {
      const watched: Watched = {
        path: dir,
        timer: null,
        watch: factory(
          watchedFiles(dir),
          () => this.changed(id),
          (err) => log.warn('repo watch error', { projectId: id, error: String(err) }),
        ),
      };
      this.repos.set(id, watched);
    } catch (err) {
      // Too many open files, a folder that vanished mid-sync: skip it, the periodic refresh covers it.
      log.warn('could not watch repo', { projectId: id, error: String(err) });
    }
  }

  private changed(id: Id): void {
    const repo = this.repos.get(id);
    if (!repo || this.closed) return;
    if (repo.timer) clearTimeout(repo.timer);
    repo.timer = setTimeout(() => {
      repo.timer = null;
      if (this.closed || this.repos.get(id) !== repo) return;
      this.options
        .refresh([id])
        .catch((err: unknown) => log.warn('git refresh failed', { error: String(err) }));
    }, this.options.debounceMs ?? WATCH_DEBOUNCE_MS);
    // A pending refresh should never keep the app (or a test run) alive.
    repo.timer.unref?.();
  }

  private async stop(id: Id): Promise<void> {
    const repo = this.repos.get(id);
    if (!repo) return;
    this.repos.delete(id);
    if (repo.timer) clearTimeout(repo.timer);
    try {
      await repo.watch.close();
    } catch (err) {
      log.warn('could not stop watching repo', { projectId: id, error: String(err) });
    }
  }
}
