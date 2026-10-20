import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { countCommitsSince, GitRefresher } from '../src/main/services/git';
import { GitWatcher, watchedFiles, type WatchFactory } from '../src/main/services/git-watcher';
import { ProjectService } from '../src/main/services/projects';
import { SqliteStore } from '../src/main/store/sqlite-store';
import { timelineLabel } from '../src/renderer/components/timeline-labels';
import { DAY } from '../src/shared/time';
import type { ActivityEvent, GitInfo } from '../src/shared/types';
import { tempDir } from './helpers';

const hasGit = (() => {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

function git(dir: string, date: string, ...args: string[]) {
  execFileSync('git', args, {
    cwd: dir,
    stdio: 'ignore',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_DATE: date,
    },
  });
}

const commit = (dir: string, date: string, msg: string) =>
  git(dir, date, 'commit', '-q', '--allow-empty', '-m', msg);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(check: () => boolean, ms = 2000) {
  const end = Date.now() + ms;
  while (!check() && Date.now() < end) await sleep(10);
}

/** A watch factory that records what is watched and lets the test fire changes. */
function fakeWatch() {
  const live = new Map<string, () => void>();
  const factory: WatchFactory = (files, onChange) => {
    const key = files[0];
    live.set(key, onChange);
    return { close: () => void live.delete(key) };
  };
  const fire = (dir: string) => live.get(watchedFiles(dir)[0])?.();
  const watching = () => [...live.keys()].map((f) => path.dirname(path.dirname(f))).sort();
  return { factory, fire, watching };
}

async function repoDir(root: string, name: string): Promise<string> {
  const dir = path.join(root, name);
  await fs.mkdir(path.join(dir, '.git'), { recursive: true });
  return dir;
}

describe('GitWatcher', () => {
  it('watches plain repos only and refreshes once per burst of changes', async () => {
    const root = await tempDir();
    const a = await repoDir(root, 'a');
    const plain = path.join(root, 'plain');
    await fs.mkdir(plain);
    // A worktree or submodule: `.git` is a file pointing elsewhere.
    const worktree = path.join(root, 'worktree');
    await fs.mkdir(worktree);
    await fs.writeFile(path.join(worktree, '.git'), 'gitdir: /elsewhere\n');

    const refreshed: string[][] = [];
    const fake = fakeWatch();
    const watcher = new GitWatcher({
      refresh: async (ids) => void refreshed.push(ids),
      watch: fake.factory,
      debounceMs: 20,
    });
    await watcher.sync([
      { id: 'a', path: a },
      { id: 'plain', path: plain },
      { id: 'worktree', path: worktree },
      { id: 'gone', path: path.join(root, 'missing') },
    ]);
    expect(fake.watching()).toEqual([a]);

    fake.fire(a);
    fake.fire(a);
    fake.fire(a);
    await until(() => refreshed.length > 0);
    await sleep(40);
    expect(refreshed).toEqual([['a']]);
    await watcher.close();
  });

  it('follows the project list: removed, moved and new repos', async () => {
    const root = await tempDir();
    const a = await repoDir(root, 'a');
    const b = await repoDir(root, 'b');
    const c = await repoDir(root, 'c');
    const fake = fakeWatch();
    const watcher = new GitWatcher({ refresh: async () => undefined, watch: fake.factory });

    await watcher.sync([
      { id: 'a', path: a },
      { id: 'b', path: b },
    ]);
    expect(fake.watching()).toEqual([a, b]);
    // b archived, a's folder changed to c.
    await watcher.sync([{ id: 'a', path: c }]);
    expect(fake.watching()).toEqual([c]);
    expect(watcher.size).toBe(1);
    await watcher.close();
    expect(fake.watching()).toEqual([]);
  });

  it('caps the watched repos, keeping the most recently committed', async () => {
    const root = await tempDir();
    const dirs = await Promise.all(['a', 'b', 'c'].map((n) => repoDir(root, n)));
    const fake = fakeWatch();
    const watcher = new GitWatcher({
      refresh: async () => undefined,
      watch: fake.factory,
      maxRepos: 2,
    });
    const at = (t: number): GitInfo => ({
      branch: 'main',
      lastCommitAt: t,
      lastCommitMsg: 'm',
      refreshedAt: t,
      error: null,
    });
    await watcher.sync([
      { id: 'a', path: dirs[0], git: at(1) },
      { id: 'b', path: dirs[1], git: at(3) },
      { id: 'c', path: dirs[2], git: at(2) },
    ]);
    expect(fake.watching()).toEqual([dirs[1], dirs[2]]);
    await watcher.close();
  });

  it('skips a repo whose watch fails to start', async () => {
    const root = await tempDir();
    const a = await repoDir(root, 'a');
    const watcher = new GitWatcher({
      refresh: async () => undefined,
      watch: () => {
        throw new Error('EMFILE');
      },
    });
    await watcher.sync([{ id: 'a', path: a }]);
    expect(watcher.size).toBe(0);
    await watcher.close();
  });

  it.skipIf(!hasGit)('notices a real commit', { timeout: 15_000 }, async () => {
    const dir = await tempDir();
    git(dir, '2026-10-01T10:00:00Z', 'init', '-q', '-b', 'main');
    commit(dir, '2026-10-01T10:00:00Z', 'first');
    const refreshed: string[][] = [];
    const watcher = new GitWatcher({
      refresh: async (ids) => void refreshed.push(ids),
      debounceMs: 50,
    });
    await watcher.sync([{ id: 'p', path: dir }]);
    // The file watch takes a moment to be live, so keep committing until it reports one.
    for (let i = 0; i < 20 && refreshed.length === 0; i++) {
      commit(dir, '2026-10-02T10:00:00Z', `change ${i}`);
      await until(() => refreshed.length > 0, 500);
    }
    await watcher.close();
    expect(refreshed[0]).toEqual(['p']);
  });
});

describe('GitRefresher commit counting', () => {
  const info = (at: number | null): GitInfo => ({
    branch: 'main',
    lastCommitAt: at,
    lastCommitMsg: 'm',
    refreshedAt: 0,
    error: null,
  });

  async function newCommitsFor(before: GitInfo | null, after: GitInfo | null) {
    let counted: Map<string, number> | undefined;
    const refresher = new GitRefresher({
      list: () => [{ id: 'p', path: '/r', git: before }],
      read: async () => after,
      countSince: async () => 3,
      save: async (_updates, newCommits) => {
        counted = newCommits;
        return false;
      },
      onChanged: () => undefined,
    });
    await refresher.refresh({ force: true });
    return counted?.get('p');
  }

  it('counts only when the last commit moved forward from a known one', async () => {
    expect(await newCommitsFor(info(10), info(20))).toBe(3);
    expect(await newCommitsFor(null, info(20))).toBeUndefined();
    expect(await newCommitsFor(info(null), info(20))).toBeUndefined();
    expect(await newCommitsFor(info(20), info(10))).toBeUndefined();
    expect(await newCommitsFor(info(20), info(20))).toBeUndefined();
  });

  it('runs a forced refresh again when it arrives during a run', async () => {
    const reads: string[] = [];
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const refresher = new GitRefresher({
      list: () => [
        { id: 'a', path: '/a', git: null },
        { id: 'b', path: '/b', git: null },
      ],
      read: async (dir) => {
        reads.push(dir);
        await gate;
        return info(1);
      },
      save: async () => false,
      onChanged: () => undefined,
    });
    let runs = 0;
    refresher.afterEachRun(() => runs++);
    const first = refresher.refresh({ force: true, ids: ['a'] });
    const second = refresher.refresh({ force: true, ids: ['b'] });
    const third = refresher.refresh({ force: true, ids: ['a'] });
    release();
    await Promise.all([first, second, third]);
    expect(reads).toEqual(['/a', '/a', '/b']);
    expect(runs).toBe(2);
  });

  it.skipIf(!hasGit)('counts real commits after a time', async () => {
    const dir = await tempDir();
    git(dir, '2026-10-01T10:00:00Z', 'init', '-q', '-b', 'main');
    commit(dir, '2026-10-01T10:00:00Z', 'one');
    commit(dir, '2026-10-02T10:00:00Z', 'two');
    commit(dir, '2026-10-03T10:00:00Z', 'three');
    expect(await countCommitsSince(dir, Date.parse('2026-10-01T10:00:00Z'))).toBe(2);
    expect(await countCommitsSince(dir, Date.parse('2026-10-03T10:00:00Z'))).toBe(1);
    expect(await countCommitsSince(path.join(dir, 'missing'), 0)).toBe(1);
  });
});

const NOW = Date.UTC(2026, 9, 20, 12);

async function setup() {
  const store = await SqliteStore.open(await tempDir());
  let now = NOW;
  const service = new ProjectService(store, () => now);
  return { service, store, advance: (ms: number) => (now += ms) };
}

const gitAt = (at: number | null, msg = 'Fix the parser'): GitInfo => ({
  branch: 'main',
  lastCommitAt: at,
  lastCommitMsg: at === null ? null : msg,
  refreshedAt: NOW,
  error: null,
});

describe('commit_detected', () => {
  it('records new commits with their count, dated by the commit', async () => {
    const { service, store } = await setup();
    const p = await service.create({ title: 'Repo', status: 'active', worldIds: [], path: '/r' });
    await service.saveGitInfo(new Map([[p.id, gitAt(NOW - 5 * DAY)]]));
    expect(store.listEvents(p.id).map((e) => e.type)).toEqual(['project_created']);

    await service.saveGitInfo(new Map([[p.id, gitAt(NOW - DAY)]]), new Map([[p.id, 4]]));
    const commits = () => store.listEvents(p.id).filter((e) => e.type === 'commit_detected');
    expect(commits()).toHaveLength(1);
    expect(commits()[0]).toMatchObject({
      type: 'commit_detected',
      payload: { count: 4 },
      createdAt: NOW - DAY,
    });

    // A commit dated in the future (clock skew) is capped at now; no count means 1.
    await service.saveGitInfo(new Map([[p.id, gitAt(NOW + DAY)]]));
    expect(commits()[0]).toMatchObject({ payload: { count: 1 }, createdAt: NOW });
  });

  it('records nothing on a branch switch to older work or a failed read', async () => {
    const { service, store } = await setup();
    const p = await service.create({ title: 'Repo', status: 'active', worldIds: [], path: '/r' });
    await service.saveGitInfo(new Map([[p.id, gitAt(NOW - DAY)]]));
    await service.saveGitInfo(new Map([[p.id, gitAt(NOW - 9 * DAY, 'old branch')]]));
    await service.saveGitInfo(new Map([[p.id, { ...gitAt(NOW), error: 'Git failed' }]]));
    expect(store.listEvents(p.id).map((e) => e.type)).toEqual(['project_created']);
  });
});

describe('autoPause', () => {
  it('pauses only active, non-archived projects quiet for longer than the setting', async () => {
    const { service, store, advance } = await setup();
    const create = (title: string, status: 'active' | 'idea' = 'active') =>
      service.create({ title, status, worldIds: [], path: null });
    const cold = await create('Cold');
    const idea = await create('Idea', 'idea');
    const archived = await create('Archived');
    const withGit = await create('Recent commits');
    await service.archive(archived.id);
    advance(40 * DAY);
    const fresh = await create('Fresh');
    await service.saveGitInfo(new Map([[withGit.id, gitAt(NOW + 39 * DAY)]]));

    const paused = await service.autoPause();
    expect(paused).toEqual([cold.id]);
    const summary = service.summary(cold.id);
    expect(summary.status).toBe('paused');
    expect(summary.activePause).toMatchObject({
      whereIStopped: 'Paused automatically after 30 days without activity.',
      nextStep: '',
      gitContext: null,
    });
    expect(store.listEvents(cold.id)[0]).toMatchObject({
      type: 'project_paused',
      payload: { pauseId: summary.activePause?.id, auto: true, days: 30 },
    });
    for (const p of [idea, archived, withGit, fresh]) {
      expect(service.summary(p.id).status).not.toBe('paused');
    }
    // Already paused: nothing more to do.
    expect(await service.autoPause()).toEqual([]);
  });

  it('mentions the last commit, and does nothing when turned off', async () => {
    const { service, advance } = await setup();
    const p = await service.create({ title: 'Repo', status: 'active', worldIds: [], path: '/r' });
    await service.saveGitInfo(new Map([[p.id, gitAt(NOW - 100 * DAY)]]));
    await service.updateSettings({ autoPauseDays: 0 });
    advance(200 * DAY);
    expect(await service.autoPause()).toEqual([]);

    await service.updateSettings({ autoPauseDays: 90 });
    expect(await service.autoPause()).toEqual([p.id]);
    expect(service.summary(p.id).activePause?.whereIStopped).toBe(
      'Paused automatically after 90 days without activity. Last commit on main: Fix the parser',
    );
  });

  it('reads as an automatic pause on the timeline', () => {
    const event = (payload: ActivityEvent['payload']): ActivityEvent => ({
      id: 'e',
      type: 'project_paused',
      projectId: 'p',
      payload,
      createdAt: NOW,
    });
    expect(timelineLabel(event({ pauseId: 'x', auto: true, days: 30 }), new Map())).toBe(
      'Paused automatically after 30 days',
    );
    expect(timelineLabel(event({ pauseId: 'x' }), new Map())).toBe('Paused');
  });
});
