import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAX_LISTED_FILES, parsePorcelainZ, readWorkState } from '../src/main/services/work-state';
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

async function repoWithCommit(): Promise<string> {
  const dir = await tempDir();
  git(dir, 'init', '-q', '-b', 'feature/login');
  await fs.writeFile(path.join(dir, 'a.txt'), 'hi');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'Add token refresh');
  return dir;
}

describe.skipIf(!hasGit)('readWorkState', () => {
  it('reports a clean repo with its branch and last commit', async () => {
    const dir = await repoWithCommit();
    expect(await readWorkState(dir)).toEqual({
      branch: 'feature/login',
      lastCommitAt: Date.parse('2026-10-01T10:00:00Z'),
      lastCommitMsg: 'Add token refresh',
      changedFiles: [],
      changedCount: 0,
    });
  });

  it('lists changed, new and renamed files relative to the folder', async () => {
    const dir = await repoWithCommit();
    await fs.writeFile(path.join(dir, 'a.txt'), 'changed');
    await fs.mkdir(path.join(dir, 'src'));
    await fs.writeFile(path.join(dir, 'src', 'my file.ts'), 'new');
    await fs.writeFile(path.join(dir, 'b.txt'), 'b');
    git(dir, 'add', 'b.txt');
    git(dir, 'commit', '-q', '-m', 'Add b');
    git(dir, 'mv', 'b.txt', 'c.txt');

    const state = await readWorkState(dir);
    expect(state?.changedCount).toBe(3);
    expect(state?.changedFiles.sort()).toEqual(['a.txt', 'c.txt', 'src/'].sort());
  });

  it('lists at most 20 files but counts them all', async () => {
    const dir = await repoWithCommit();
    await Promise.all(
      Array.from({ length: 25 }, (_, i) => fs.writeFile(path.join(dir, `f${i}.txt`), 'x')),
    );
    const state = await readWorkState(dir);
    expect(state?.changedCount).toBe(25);
    expect(state?.changedFiles).toHaveLength(MAX_LISTED_FILES);
  });

  it('works in a repo with no commits yet', async () => {
    const dir = await tempDir();
    git(dir, 'init', '-q', '-b', 'main');
    await fs.writeFile(path.join(dir, 'a.txt'), 'hi');
    expect(await readWorkState(dir)).toEqual({
      branch: 'main',
      lastCommitAt: null,
      lastCommitMsg: null,
      changedFiles: ['a.txt'],
      changedCount: 1,
    });
  });
});

describe('readWorkState without Git', () => {
  it('returns null for a folder that is not a repo', async () => {
    expect(await readWorkState(await tempDir())).toBeNull();
  });

  it('returns null for a missing folder instead of throwing', async () => {
    expect(await readWorkState(path.join(await tempDir(), 'gone'))).toBeNull();
  });
});

describe('parsePorcelainZ', () => {
  it('keeps raw paths and skips the original name of renames', () => {
    const out = ' M a b.txt\0R  new.ts\0old.ts\0?? "quoted".md\0';
    expect(parsePorcelainZ(out)).toEqual(['a b.txt', 'new.ts', '"quoted".md']);
  });

  it('handles empty output', () => {
    expect(parsePorcelainZ('')).toEqual([]);
  });
});
