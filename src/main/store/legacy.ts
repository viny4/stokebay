// The app was called "Project HUD" before it became Stokebay. macOS keeps app data in a
// folder named after the app, so after the rename the old data would sit unseen in
// ".../Project HUD". On first launch, copy it across. Copy, never move: the old folder stays
// as an extra backup until the user deletes it.
import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_FILE } from './json-store';
import { DB_FILE } from './sqlite-store';

export const LEGACY_FOLDER = 'Project HUD';
const CARRIED_OVER = [DATA_FILE, 'media', 'backups'];

/**
 * Copies the old data folder into `dataDir` when `dataDir` has no data yet and the old one
 * does. Returns true when something was copied.
 */
export async function adoptLegacyData(appDataDir: string, dataDir: string): Promise<boolean> {
  const oldDir = path.join(appDataDir, LEGACY_FOLDER);
  if (path.resolve(oldDir) === path.resolve(dataDir)) return false;
  // Either file means this folder already has data (the JSON file is renamed once it has been
  // moved into the database, so checking it alone would copy the old data in again).
  if (await exists(path.join(dataDir, DATA_FILE))) return false;
  if (await exists(path.join(dataDir, DB_FILE))) return false;
  if (!(await exists(path.join(oldDir, DATA_FILE)))) return false;

  await fs.mkdir(dataDir, { recursive: true });
  for (const name of CARRIED_OVER) {
    const from = path.join(oldDir, name);
    if (await exists(from)) {
      await fs.cp(from, path.join(dataDir, name), {
        recursive: true,
        errorOnExist: false,
        force: false,
      });
    }
  }
  return true;
}

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}
