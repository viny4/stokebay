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
  /** Top folders macOS wouldn't let the app look into (privacy settings), if any. */
  blocked?: string[];
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
  'Homebrew', // Homebrew's own repos (taps), not the user's projects
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

/** Folders at the top of the disk that belong to macOS or other system software. */
const SYSTEM_ROOT_DIRS = new Set([
  'Applications',
  'Library',
  'System',
  'Users',
  'Volumes',
  'Network',
  'bin',
  'cores',
  'dev',
  'etc',
  'home',
  'net',
  'opt',
  'private',
  'sbin',
  'tmp',
  'usr',
  'var',
]);

async function isDir(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

async function realpathOr(p: string): Promise<string> {
  try {
    return await fs.realpath(p);
  } catch {
    return p;
  }
}

/**
 * Everywhere a person might keep code: the home folder, their own folders at the top of the
 * disk (e.g. /code), /Users/Shared, and every connected drive. Skips system folders, the
 * Recovery volume, the link back to the main disk, and Time Machine backups (full of copies of
 * repos that aren't separate projects).
 */
export async function computerScanRoots(
  home: string,
  locations: { fsRoot?: string; volumes?: string } = {},
): Promise<string[]> {
  const fsRoot = locations.fsRoot ?? '/';
  const volumes = locations.volumes ?? '/Volumes';
  const roots = [home];

  const top = await fs.readdir(fsRoot, { withFileTypes: true }).catch(() => []);
  for (const entry of top) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || SYSTEM_ROOT_DIRS.has(entry.name)) {
      continue;
    }
    roots.push(path.join(fsRoot, entry.name));
  }
  const shared = path.join(fsRoot, 'Users', 'Shared');
  if (await isDir(shared)) roots.push(shared);

  const mainDisk = await realpathOr(fsRoot);
  const drives = await fs.readdir(volumes, { withFileTypes: true }).catch(() => []);
  for (const entry of drives) {
    const drive = path.join(volumes, entry.name);
    if (entry.name.startsWith('.') || entry.name === 'Recovery') continue;
    if (/time ?machine|backups? of/i.test(entry.name)) continue;
    if ((await realpathOr(drive)) === mainDisk) continue; // "Macintosh HD" links back to /
    if (!(await isDir(drive))) continue;
    if (await isDir(path.join(drive, 'Backups.backupdb'))) continue;
    roots.push(drive);
  }

  // Drop duplicates and folders already inside another root (e.g. home under a custom root).
  const unique = [...new Set(roots.map((r) => path.resolve(r)))];
  return unique.filter(
    (r) => !unique.some((other) => other !== r && r.startsWith(other + path.sep)),
  );
}

/**
 * Finds every Git repository under `roots` (see computerScanRoots), so the user doesn't have
 * to know where their projects are. Many folders are read at once, places code never lives are
 * skipped, and a repo's insides are never searched. Stops early (truncated) on very large
 * trees. Top folders macOS refuses to open (privacy settings) are reported, never skipped
 * silently.
 */
export async function findGitRepos(
  roots: string | string[],
  options: FindReposOptions = {},
): Promise<ScanOutput> {
  const maxDepth = options.maxDepth ?? 8;
  const maxDirs = options.maxDirs ?? 300_000;
  const concurrency = options.concurrency ?? 48;
  const deadline = Date.now() + (options.timeLimitMs ?? 30_000);

  const candidates: ScanCandidate[] = [];
  const queue = (Array.isArray(roots) ? roots : [roots]).map((r) => ({
    dir: path.resolve(r),
    depth: 0,
  }));
  const blocked: string[] = [];
  let visited = 0;
  let truncated = false;

  const visit = async (dir: string, depth: number) => {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (err) {
      // Deep folders that can't be read are normal (other apps' data). Near the top, it means
      // macOS is blocking a whole area such as Documents or Desktop: the user must know.
      const code = (err as NodeJS.ErrnoException).code;
      if (depth <= 1 && (code === 'EPERM' || code === 'EACCES')) blocked.push(dir);
      return;
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
  return { candidates, truncated, blocked: blocked.sort() };
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
