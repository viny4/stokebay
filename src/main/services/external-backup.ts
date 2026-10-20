// Backups to a folder the user picks, typically inside Google Drive / iCloud / Dropbox, so a
// copy leaves the machine. Stokebay never talks to the cloud itself: it writes plain files and
// the user's sync app uploads them.
//
// Layout inside <chosen folder>/Stokebay Backups/:
//   data/projects-YYYY-MM-DD.json   one copy of the data file per day, last 30 kept
//   media/<projectId>/<file>        add-only mirror of Lab files (stored files never change,
//                                   so copying new ones is enough; nothing is deleted here)
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { dayStamp } from './backup';

export const BACKUP_FOLDER_NAME = 'Stokebay Backups';
export const EXTERNAL_DAYS_KEPT = 30;
const SNAPSHOT = /^projects-(\d{4}-\d{2}-\d{2})\.json$/;

export interface ExternalBackupResult {
  snapshot: string;
  mediaFilesCopied: number;
}

/** The Stokebay folder inside whatever the user picked (picking it directly also works). */
export function backupRoot(chosen: string): string {
  return path.basename(chosen) === BACKUP_FOLDER_NAME
    ? chosen
    : path.join(chosen, BACKUP_FOLDER_NAME);
}

/** Copies today's data file and any new Lab files into the backup folder. */
export async function runExternalBackup(
  dataDir: string,
  chosen: string,
  now: number = Date.now(),
  keep: number = EXTERNAL_DAYS_KEPT,
): Promise<ExternalBackupResult> {
  const root = backupRoot(chosen);
  const dataOut = path.join(root, 'data');
  await fs.mkdir(dataOut, { recursive: true });

  // Write under a temp name and rename, so the sync app never uploads a half-written file.
  const snapshot = `projects-${dayStamp(now)}.json`;
  const tmp = path.join(dataOut, `.${snapshot}.tmp`);
  await fs.copyFile(path.join(dataDir, 'projects.json'), tmp);
  await fs.rename(tmp, path.join(dataOut, snapshot));

  const old = (await listSnapshots(chosen)).slice(keep);
  await Promise.all(
    old.map((day) => fs.rm(path.join(dataOut, `projects-${day}.json`), { force: true })),
  );

  const mediaFilesCopied = await mirrorAddOnly(
    path.join(dataDir, 'media'),
    path.join(root, 'media'),
  );
  return { snapshot, mediaFilesCopied };
}

/** Dates (YYYY-MM-DD) that have a backup, newest first. */
export async function listSnapshots(chosen: string): Promise<string[]> {
  try {
    const files = await fs.readdir(path.join(backupRoot(chosen), 'data'));
    return files
      .map((f) => SNAPSHOT.exec(f)?.[1])
      .filter((d): d is string => Boolean(d))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

/**
 * Puts the chosen day's data back into `dataDir`. The current data file is kept as
 * `projects.json.before-restore-<time>` first, so a restore can always be undone, and Lab
 * files from the backup are added back without touching files already present.
 */
export async function restoreExternalBackup(
  dataDir: string,
  chosen: string,
  day: string,
  now: number = Date.now(),
): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Invalid backup date');
  const root = backupRoot(chosen);
  const source = path.join(root, 'data', `projects-${day}.json`);
  JSON.parse(await fs.readFile(source, 'utf8')); // refuse a damaged backup before touching anything

  const current = path.join(dataDir, 'projects.json');
  try {
    await fs.copyFile(current, `${current}.before-restore-${now}`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  await mirrorAddOnly(path.join(root, 'media'), path.join(dataDir, 'media'));
  const tmp = `${current}.restore-tmp`;
  await fs.copyFile(source, tmp);
  await fs.rename(tmp, current);
}

/** "My Drive" of Google Drive for desktop, if installed (it lives under ~/Library/CloudStorage). */
export async function findGoogleDrive(home: string = os.homedir()): Promise<string | null> {
  const cloud = path.join(home, 'Library', 'CloudStorage');
  try {
    for (const entry of await fs.readdir(cloud)) {
      if (!entry.startsWith('GoogleDrive-')) continue;
      const myDrive = path.join(cloud, entry, 'My Drive');
      if ((await fs.stat(myDrive)).isDirectory()) return myDrive;
    }
  } catch {
    // not installed
  }
  return null;
}

/** Copies files that are missing in `to`; never overwrites or deletes. Returns files copied. */
async function mirrorAddOnly(from: string, to: string): Promise<number> {
  let copied = 0;
  let entries;
  try {
    entries = await fs.readdir(from, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copied += await mirrorAddOnly(src, dst);
    } else if (entry.isFile()) {
      try {
        await fs.access(dst);
      } catch {
        await fs.mkdir(to, { recursive: true });
        await fs.copyFile(src, dst);
        copied++;
      }
    }
  }
  return copied;
}
