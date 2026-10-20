import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanFolder } from '../src/main/services/scanner';
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
