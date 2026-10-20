import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ScanCandidate } from '../../shared/types';

export const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.next', 'venv']);

export interface ScanOptions {
  /** How many levels below the chosen folder to look (the folder itself is level 0). */
  maxDepth?: number;
  /** Safety cap so picking a huge folder can't run for minutes. */
  maxDirs?: number;
}

export interface ScanOutput {
  candidates: ScanCandidate[];
  truncated: boolean;
}

/**
 * Finds project folders: anything containing `.git` or `package.json`. A folder with `.git`
 * is one project, so the scan doesn't look inside it; this keeps monorepo sub-packages from
 * showing up as separate projects.
 */
export async function scanFolder(root: string, options: ScanOptions = {}): Promise<ScanOutput> {
  const maxDepth = options.maxDepth ?? 3;
  const maxDirs = options.maxDirs ?? 20_000;
  const candidates: ScanCandidate[] = [];
  let visited = 0;
  let truncated = false;

  const visit = async (dir: string, depth: number): Promise<void> => {
    if (visited >= maxDirs) {
      truncated = true;
      return;
    }
    visited++;
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return; // unreadable (permissions, vanished): skip quietly
    }
    const hasGit = entries.some((e) => e.name === '.git');
    const hasPackage = entries.some((e) => e.name === 'package.json' && e.isFile());
    if (hasGit || hasPackage) candidates.push({ path: dir, name: path.basename(dir), hasGit });
    if (hasGit || depth >= maxDepth) return;

    for (const entry of entries) {
      // Dirent.isDirectory() is false for symlinks, so links can't send the scan in circles.
      if (!entry.isDirectory() || entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
      await visit(path.join(dir, entry.name), depth + 1);
    }
  };

  await visit(path.resolve(root), 0);
  candidates.sort((a, b) => a.path.localeCompare(b.path));
  return { candidates, truncated };
}
