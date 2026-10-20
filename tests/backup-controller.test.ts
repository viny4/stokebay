import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BackupController } from '../src/main/backup-controller';
import { listSnapshots } from '../src/main/services/external-backup';
import { ProjectService, UserError } from '../src/main/services/projects';
import { SqliteStore } from '../src/main/store/sqlite-store';
import { tempDir } from './helpers';

const NOW = new Date(2026, 9, 20, 12).getTime();

async function app() {
  const dataDir = await tempDir();
  const store = await SqliteStore.open(dataDir);
  const service = new ProjectService(store, () => NOW);
  let restarted = false;
  const backups = new BackupController({
    service,
    dataDir,
    flush: () => store.flush(),
    snapshot: () => JSON.stringify(store.snapshot()),
    restart: () => {
      restarted = true;
    },
    clock: () => NOW,
  });
  return { dataDir, service, backups, restarted: () => restarted };
}

describe('BackupController', () => {
  it('backs up right away when a folder is chosen, and once per day after that', async () => {
    const mac = await app();
    await mac.service.create({ title: 'Robot', status: 'active', worldIds: [], path: null });
    const drive = await tempDir();
    const status = await mac.backups.useFolder(drive);
    expect(status.snapshots).toHaveLength(1);
    expect(status.lastBackupAt).toBe(NOW);
    expect(await mac.backups.backupIfDue()).toBe(false); // already done today
  });

  it('on a new Mac, choosing the folder never overwrites the backups with empty data', async () => {
    // Old Mac: real projects backed up to the drive.
    const oldMac = await app();
    await oldMac.service.create({ title: 'Robot', status: 'active', worldIds: [], path: null });
    const drive = await tempDir();
    await oldMac.backups.useFolder(drive);
    const [day] = await listSnapshots(drive);
    const file = path.join(drive, 'Stokebay Backups', 'data', `projects-${day}.json`);
    const before = await fs.readFile(file, 'utf8');

    // New Mac: empty app picks the same folder; the daily run fires too.
    const newMac = await app();
    await newMac.backups.useFolder(drive);
    expect(await newMac.backups.backupIfDue()).toBe(false);
    await expect(newMac.backups.backupNow()).rejects.toBeInstanceOf(UserError);
    expect(await fs.readFile(file, 'utf8')).toBe(before);

    // Restoring brings the projects back and restarts the app.
    await newMac.backups.restore(day);
    expect(newMac.restarted()).toBe(true);
    const restored = await SqliteStore.open(newMac.dataDir);
    expect(restored.listProjects().map((p) => p.title)).toEqual(['Robot']);
  });
});
