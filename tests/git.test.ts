import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GitRefresher, MAX_PARALLEL_REPOS, readGitInfo } from '../src/main/services/git';
import type { GitInfo } from '../src/shared/types';
import { tempDir } from './helpers';

const hasGit = (() => {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

function git(dir: string, ...args: string[]) {
  execFileSync('git', args, {
    cwd: dir,
    stdio: 'ignore',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
      GIT_AUTHOR_DATE: '2026-10-01T10:00:00Z',
      GIT_COMMITTER_DATE: '2026-10-01T10:00:00Z',
    },
  });
}

describe.skipIf(!hasGit)('readGitInfo', () => {
  it('reads branch, last commit time and subject', async () => {
    const dir = await tempDir();
    git(dir, 'init', '-q', '-b', 'main');
    await fs.writeFile(path.join(dir, 'a.txt'), 'hi');
    git(dir, 'add', '.');
    git(dir, 'commit', '-q', '-m', 'Add the first file');

    const info = await readGitInfo(dir, 123);
    expect(info).toEqual({
      branch: 'main',
      lastCommitAt: Date.parse('2026-10-01T10:00:00Z'),
      lastCommitMsg: 'Add the first file',
      refreshedAt: 123,
      error: null,
    });
  });

  it('handles a repo with no commits yet', async () => {
    const dir = await tempDir();
    git(dir, 'init', '-q', '-b', 'main');
    expect(await readGitInfo(dir)).toMatchObject({
      branch: 'main',
      lastCommitAt: null,
      error: null,
    });
  });

  it('returns null for a folder that is not a repo', async () => {
    expect(await readGitInfo(await tempDir())).toBeNull();
  });

  it('flags a missing folder', async () => {
    const info = await readGitInfo(path.join(await tempDir(), 'gone'));
    expect(info?.error).toBe('Folder not found');
  });
});

describe('GitRefresher', () => {
  const info = (at: number): GitInfo => ({
    branch: 'main',
    lastCommitAt: at,
    lastCommitMsg: 'm',
    refreshedAt: at,
    error: null,
  });

  it(`runs at most ${MAX_PARALLEL_REPOS} repos at a time`, async () => {
    let inFlight = 0;
    let peak = 0;
    const projects = Array.from({ length: 10 }, (_, i) => ({
      id: `p${i}`,
      path: `/r${i}`,
      git: null,
    }));
    const refresher = new GitRefresher({
      list: () => projects,
      read: async () => {
        peak = Math.max(peak, ++inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
        return info(1);
      },
      save: async () => true,
      onChanged: () => undefined,
    });
    await refresher.refresh({ force: true });
    expect(peak).toBe(MAX_PARALLEL_REPOS);
  });

  it('throttles repeated focus refreshes but allows forced ones', async () => {
    let reads = 0;
    let now = 0;
    const refresher = new GitRefresher({
      list: () => [{ id: 'p', path: '/r', git: null }],
      read: async () => {
        reads++;
        return info(1);
      },
      save: async () => false,
      onChanged: () => undefined,
      minIntervalMs: 1000,
      clock: () => now,
    });
    await refresher.refresh();
    now = 500;
    await refresher.refresh();
    expect(reads).toBe(1);
    await refresher.refresh({ force: true });
    now = 2000;
    await refresher.refresh();
    expect(reads).toBe(3);
  });

  it('keeps the last good commit info when a read fails', async () => {
    let saved: Map<string, GitInfo | null> | undefined;
    const refresher = new GitRefresher({
      list: () => [{ id: 'p', path: '/r', git: info(10) }],
      read: async () => ({
        ...info(20),
        lastCommitAt: null,
        lastCommitMsg: null,
        error: 'Folder not found',
      }),
      save: async (updates) => {
        saved = updates;
        return true;
      },
      onChanged: () => undefined,
    });
    await refresher.refresh({ force: true });
    expect(saved?.get('p')).toMatchObject({ lastCommitAt: 10, error: 'Folder not found' });
  });
});
