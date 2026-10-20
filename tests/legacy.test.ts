import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { adoptLegacyData, LEGACY_FOLDER } from '../src/main/store/legacy';
import { tempDir } from './helpers';

async function oldInstall(appData: string) {
  const old = path.join(appData, LEGACY_FOLDER);
  await fs.mkdir(path.join(old, 'media', 'p1'), { recursive: true });
  await fs.mkdir(path.join(old, 'backups'), { recursive: true });
  await fs.writeFile(path.join(old, 'projects.json'), '{"old":true}');
  await fs.writeFile(path.join(old, 'media', 'p1', 'sketch.png'), 'png');
  await fs.writeFile(path.join(old, 'backups', 'projects-2026-10-19.json'), '{}');
  await fs.writeFile(path.join(old, 'Preferences'), 'chromium junk');
  return old;
}

describe('adoptLegacyData', () => {
  it('copies data, media and backups from the old app folder, leaving the old one intact', async () => {
    const appData = await tempDir();
    const old = await oldInstall(appData);
    const fresh = path.join(appData, 'Stokebay');

    expect(await adoptLegacyData(appData, fresh)).toBe(true);
    expect(await fs.readFile(path.join(fresh, 'projects.json'), 'utf8')).toBe('{"old":true}');
    expect(await fs.readFile(path.join(fresh, 'media', 'p1', 'sketch.png'), 'utf8')).toBe('png');
    expect(await fs.readdir(path.join(fresh, 'backups'))).toEqual(['projects-2026-10-19.json']);
    // Browser internals are not carried over, and the original stays as a backup.
    await expect(fs.access(path.join(fresh, 'Preferences'))).rejects.toThrow();
    expect(await fs.readFile(path.join(old, 'projects.json'), 'utf8')).toBe('{"old":true}');
  });

  it('never overwrites data that already exists under the new name', async () => {
    const appData = await tempDir();
    await oldInstall(appData);
    const fresh = path.join(appData, 'Stokebay');
    await fs.mkdir(fresh, { recursive: true });
    await fs.writeFile(path.join(fresh, 'projects.json'), '{"new":true}');

    expect(await adoptLegacyData(appData, fresh)).toBe(false);
    expect(await fs.readFile(path.join(fresh, 'projects.json'), 'utf8')).toBe('{"new":true}');
  });

  it('does nothing when there is no old install', async () => {
    const appData = await tempDir();
    expect(await adoptLegacyData(appData, path.join(appData, 'Stokebay'))).toBe(false);
  });

  it('leaves a folder alone once its data has moved into the database', async () => {
    const appData = await tempDir();
    await oldInstall(appData);
    const current = path.join(appData, 'Stokebay');
    await fs.mkdir(current, { recursive: true });
    // After the move: the database plus the renamed JSON file, no projects.json.
    await fs.writeFile(path.join(current, 'stokebay.db'), '');
    await fs.writeFile(path.join(current, 'projects.json.imported-1'), '{}');

    expect(await adoptLegacyData(appData, current)).toBe(false);
    await expect(fs.access(path.join(current, 'projects.json'))).rejects.toThrow();
  });
});
