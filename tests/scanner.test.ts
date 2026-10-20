import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { computerScanRoots, findGitRepos, scanFolder } from '../src/main/services/scanner';
import { tempDir } from './helpers';

async function makeTree(root: string, paths: string[]) {
  for (const p of paths) {
    const full = path.join(root, p);
    if (p.endsWith('/')) await fs.mkdir(full, { recursive: true });
    else {
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, '{}');
    }
  }
}

describe('scanFolder', () => {
  it('finds .git and package.json folders and skips noise', async () => {
    const root = await tempDir();
    await makeTree(root, [
      'api/.git/',
      'web/package.json',
      'web/node_modules/dep/package.json',
      'notes/readme.txt',
      '.hidden/tool/.git/',
      'dist/out/package.json',
      'venv/lib/package.json',
    ]);
    const { candidates } = await scanFolder(root);
    expect(candidates.map((c) => path.relative(root, c.path))).toEqual(['api', 'web']);
    expect(candidates.find((c) => c.name === 'api')?.hasGit).toBe(true);
  });

  it('treats a .git folder as one project and does not look inside it', async () => {
    const root = await tempDir();
    await makeTree(root, ['mono/.git/', 'mono/package.json', 'mono/packages/ui/package.json']);
    const { candidates } = await scanFolder(root);
    expect(candidates.map((c) => c.name)).toEqual(['mono']);
  });

  it('keeps looking inside package.json folders that have no .git', async () => {
    const root = await tempDir();
    await makeTree(root, ['work/package.json', 'work/tools/cli/package.json']);
    const { candidates } = await scanFolder(root);
    expect(candidates.map((c) => path.relative(root, c.path))).toEqual([
      'work',
      path.join('work', 'tools', 'cli'),
    ]);
  });

  it('looks at most 3 levels deep', async () => {
    const root = await tempDir();
    await makeTree(root, ['a/b/c/.git/', 'a/b/c/d/.git/', 'x/y/z/w/.git/']);
    const { candidates } = await scanFolder(root);
    expect(candidates.map((c) => path.relative(root, c.path))).toEqual([path.join('a', 'b', 'c')]);
  });

  it('includes the chosen folder itself when it is a project', async () => {
    const root = await tempDir();
    await makeTree(root, ['.git/']);
    const { candidates } = await scanFolder(root);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].path).toBe(path.resolve(root));
  });

  it('stops early on huge trees and says so', async () => {
    const root = await tempDir();
    await makeTree(
      root,
      Array.from({ length: 30 }, (_, i) => `d${i}/`),
    );
    const result = await scanFolder(root, { maxDirs: 10 });
    expect(result.truncated).toBe(true);
  });
});

describe('findGitRepos', () => {
  it('finds Git repos anywhere below, deep too, and skips places code never lives', async () => {
    const root = await tempDir();
    await makeTree(root, [
      'Documents/work/api/.git/',
      'Documents/work/api/sub/.git/',
      'code/a/b/c/d/e/deep/.git/',
      'Desktop/site/package.json',
      'Library/CloudStorage/Drive/repo/.git/',
      'Pictures/old/.git/',
      '.config/tool/.git/',
      'Applications/Thing.app/x/.git/',
      'tools/Thing.app/x/.git/',
      'proj/node_modules/dep/.git/',
    ]);
    // A worktree or submodule has a .git file instead of a folder.
    await makeTree(root, ['wt/.git']);
    const { candidates, truncated } = await findGitRepos(root);
    expect(truncated).toBe(false);
    expect(candidates.map((c) => path.relative(root, c.path)).sort()).toEqual([
      path.join('Documents', 'work', 'api'),
      path.join('code', 'a', 'b', 'c', 'd', 'e', 'deep'),
      'wt',
    ]);
    expect(candidates.every((c) => c.hasGit)).toBe(true);
  });

  it('lists the most recently worked-on repos first', async () => {
    const root = await tempDir();
    await makeTree(root, ['old/.git/logs/HEAD', 'new/.git/logs/HEAD', 'mid/.git/']);
    const at = (days: number) => new Date(Date.now() - days * 86_400_000);
    await fs.utimes(path.join(root, 'old/.git/logs/HEAD'), at(300), at(300));
    await fs.utimes(path.join(root, 'new/.git/logs/HEAD'), at(1), at(1));
    await fs.utimes(path.join(root, 'mid/.git'), at(30), at(30));
    const { candidates } = await findGitRepos(root);
    expect(candidates.map((c) => c.name)).toEqual(['new', 'mid', 'old']);
    expect(candidates[0].lastTouchedAt).toBeGreaterThan(candidates[2].lastTouchedAt!);
  });

  it('stops at the folder limit and says so', async () => {
    const root = await tempDir();
    await makeTree(root, ['a/1/', 'a/2/', 'b/1/', 'b/2/', 'c/.git/']);
    const result = await findGitRepos(root, { maxDirs: 2 });
    expect(result.truncated).toBe(true);
  });
});

describe('computerScanRoots', () => {
  it('adds own top-level folders, shared and connected drives, but no system places', async () => {
    const disk = await tempDir();
    const volumes = path.join(disk, 'Volumes');
    await makeTree(disk, [
      'Users/me/',
      'Users/Shared/',
      'code/',
      'pkg/',
      'System/',
      'Library/',
      'usr/',
      'opt/',
      '.hidden/',
      'Volumes/USB stick/',
      'Volumes/Recovery/',
      'Volumes/Time Machine Backups/',
      'Volumes/Old Backup/Backups.backupdb/',
    ]);
    await fs.symlink(disk, path.join(volumes, 'Macintosh HD'));

    const roots = await computerScanRoots(path.join(disk, 'Users', 'me'), {
      fsRoot: disk,
      volumes,
    });
    expect(roots.map((r) => path.relative(disk, r)).sort()).toEqual(
      [
        path.join('Users', 'Shared'),
        path.join('Users', 'me'),
        path.join('Volumes', 'USB stick'),
        'code',
        'pkg',
      ].sort(),
    );
  });
});

describe('findGitRepos across places', () => {
  it('searches several roots and reports top folders it is not allowed into', async () => {
    const home = await tempDir();
    const drive = await tempDir();
    await makeTree(home, ['Documents/app/.git/', 'Desktop/']);
    await makeTree(drive, ['work/site/.git/']);
    const locked = path.join(home, 'Desktop');
    await fs.chmod(locked, 0o000);
    try {
      const { candidates, blocked } = await findGitRepos([home, drive]);
      expect(candidates.map((c) => c.name).sort()).toEqual(['app', 'site']);
      expect(blocked).toEqual([locked]);
    } finally {
      await fs.chmod(locked, 0o755);
    }
  });
});
