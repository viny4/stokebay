// Daily backups of the data file, on top of the rolling copies made on every save. The rolling
// copies protect against a bad write; these protect against "I deleted something last week".
import fs from 'node:fs/promises';
import path from 'node:path';

export const DAILY_BACKUPS_KEPT = 7;
const NAME = /^projects-(\d{4}-\d{2}-\d{2})\.json$/;

/** Local calendar day, so "today's backup" matches what the user sees on their clock. */
export function dayStamp(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Copies `dataFile` to `backupDir/projects-YYYY-MM-DD.json` if today has no backup yet, then
 * keeps only the newest `keep` days. Returns the file written, or null if today was done.
 */
export async function runDailyBackup(
  dataFile: string,
  backupDir: string,
  now: number = Date.now(),
  keep: number = DAILY_BACKUPS_KEPT,
): Promise<string | null> {
  await fs.mkdir(backupDir, { recursive: true });
  const target = path.join(backupDir, `projects-${dayStamp(now)}.json`);
  let written: string | null = null;
  try {
    // COPYFILE_EXCL: never overwrite today's backup (the first copy of the day is the safe one).
    await fs.copyFile(dataFile, target, fs.constants.COPYFILE_EXCL);
    written = target;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'EEXIST' && code !== 'ENOENT') throw err;
  }

  const backups = (await fs.readdir(backupDir)).filter((f) => NAME.test(f)).sort();
  const old = backups.slice(0, Math.max(0, backups.length - keep));
  await Promise.all(old.map((f) => fs.rm(path.join(backupDir, f), { force: true })));
  return written;
}
