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

/** Folders under a home folder where code projects don't live; skipping them keeps it quick. */
export const COMPUTER_SKIP_DIRS = new Set([
  ...SKIP_DIRS,
  'Library', // app data, caches, cloud-drive mirrors (reading those would download files)
  'Applications',
  'Pictures',
  'Music',
  'Movies',
  'Pods',
  'target',
  'vendor',
  'DerivedData',
  '__pycache__',
  'site-packages',
]);

/** macOS packages that look like folders but are app bundles or media libraries. */
const PACKAGE_SUFFIX = /\.(app|bundle|framework|photoslibrary|musiclibrary|tvlibrary|xcassets)$/i;

export interface FindReposOptions {
  maxDepth?: number;
  maxDirs?: number;
  /** Folders read at the same time. */
  concurrency?: number;
  /** Stop and return what was found after this long. */
  timeLimitMs?: number;
}

/**
 * Finds every Git repository under `root` (normally the home folder), so the user doesn't
 * have to know where their projects are. Many folders are read at once, places code never
 * lives are skipped, and a repo's insides are never searched. Stops early (truncated) on
 * very large trees.
 */
export async function findGitRepos(
  root: string,
  options: FindReposOptions = {},
): Promise<ScanOutput> {
  const maxDepth = options.maxDepth ?? 8;
  const maxDirs = options.maxDirs ?? 300_000;
  const concurrency = options.concurrency ?? 48;
  const deadline = Date.now() + (options.timeLimitMs ?? 30_000);

  const candidates: ScanCandidate[] = [];
  const queue: { dir: string; depth: number }[] = [{ dir: path.resolve(root), depth: 0 }];
  let visited = 0;
  let truncated = false;

  const visit = async (dir: string, depth: number) => {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return; // no permission or vanished: skip quietly
    }
    // `.git` is a folder in normal repos and a file in worktrees and submodules.
    if (entries.some((e) => e.name === '.git')) {
      candidates.push({ path: dir, name: path.basename(dir), hasGit: true });
      return;
    }
    if (depth >= maxDepth) return;
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      if (COMPUTER_SKIP_DIRS.has(entry.name) || PACKAGE_SUFFIX.test(entry.name)) continue;
      queue.push({ dir: path.join(dir, entry.name), depth: depth + 1 });
    }
  };

  // A simple pool: keep up to `concurrency` folder reads in flight; each finished read starts
  // the next ones. Done when nothing is queued and nothing is being read.
  await new Promise<void>((resolve) => {
    let active = 0;
    const pump = () => {
      while (active < concurrency && queue.length > 0) {
        if (visited >= maxDirs || Date.now() > deadline) {
          truncated = true;
          queue.length = 0;
          break;
        }
        const next = queue.pop()!;
        visited++;
        active++;
        void visit(next.dir, next.depth).finally(() => {
          active--;
          pump();
        });
      }
      if (active === 0 && queue.length === 0) resolve();
    };
    pump();
  });
  await Promise.all(
    candidates.map(async (c) => {
      c.lastTouchedAt = await lastGitActivity(c.path);
    }),
  );
  // Most recently worked on first: those are the ones people want to add.
  candidates.sort(
    (a, b) => (b.lastTouchedAt ?? 0) - (a.lastTouchedAt ?? 0) || a.path.localeCompare(b.path),
  );
  return { candidates, truncated };
}

/**
 * When Git last wrote its log of HEAD moves (every commit, checkout, pull): a cheap stand-in for
 * "last worked on" that needs no git command. Falls back to the .git entry itself.
 */
async function lastGitActivity(repo: string): Promise<number | undefined> {
  for (const file of [path.join(repo, '.git', 'logs', 'HEAD'), path.join(repo, '.git')]) {
    try {
      return Math.round((await fs.stat(file)).mtimeMs);
    } catch {
      // try the next one
    }
  }
  return undefined;
}
