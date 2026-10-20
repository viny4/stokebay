import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { dayStamp } from '../src/main/services/backup';
import {
  BACKUP_FOLDER_NAME,
  findGoogleDrive,
  listSnapshots,
  restoreExternalBackup,
  runExternalBackup,
} from '../src/main/services/external-backup';
import { tempDir } from './helpers';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 9, 20, 12).getTime();

async function dataDir(content = '{"v":1}') {
  const dir = await tempDir();
  await fs.writeFile(path.join(dir, 'projects.json'), content);
  await fs.mkdir(path.join(dir, 'media', 'p1'), { recursive: true });
  await fs.writeFile(path.join(dir, 'media', 'p1', 'sketch.png'), 'png');
  return dir;
}

describe('external backups', () => {
  it('writes a dated data copy and mirrors Lab files into "Stokebay Backups"', async () => {
    const data = await dataDir();
    const drive = await tempDir();
    const result = await runExternalBackup(data, drive, NOW);
    const root = path.join(drive, BACKUP_FOLDER_NAME);
    expect(result).toEqual({ snapshot: `projects-${dayStamp(NOW)}.json`, mediaFilesCopied: 1 });
    expect(await fs.readFile(path.join(root, 'data', result.snapshot), 'utf8')).toBe('{"v":1}');
    expect(await fs.readFile(path.join(root, 'media', 'p1', 'sketch.png'), 'utf8')).toBe('png');
    // No temp files left for the sync app to upload.
    expect((await fs.readdir(path.join(root, 'data'))).some((f) => f.endsWith('.tmp'))).toBe(false);
  });

  it('accepts the "Stokebay Backups" folder itself as the choice', async () => {
    const data = await dataDir();
    const chosen = path.join(await tempDir(), BACKUP_FOLDER_NAME);
    await runExternalBackup(data, chosen, NOW);
    expect(await listSnapshots(chosen)).toEqual([dayStamp(NOW)]);
  });

  it('keeps 30 days, newest first, and only copies new media', async () => {
    const data = await dataDir();
    const drive = await tempDir();
    for (let i = 0; i < 35; i++) await runExternalBackup(data, drive, NOW + i * DAY);
    const days = await listSnapshots(drive);
    expect(days).toHaveLength(30);
    expect(days[0]).toBe(dayStamp(NOW + 34 * DAY));
    expect((await runExternalBackup(data, drive, NOW + 40 * DAY)).mediaFilesCopied).toBe(0);
  });

  it('never deletes mirrored Lab files, so old backups can still find them', async () => {
    const data = await dataDir();
    const drive = await tempDir();
    await runExternalBackup(data, drive, NOW);
    await fs.rm(path.join(data, 'media', 'p1', 'sketch.png'));
    await runExternalBackup(data, drive, NOW + DAY);
    await expect(
      fs.access(path.join(drive, BACKUP_FOLDER_NAME, 'media', 'p1', 'sketch.png')),
    ).resolves.toBeUndefined();
  });

  it('restores a day: keeps the current file aside and brings missing Lab files back', async () => {
    const data = await dataDir('{"day":1}');
    const drive = await tempDir();
    await runExternalBackup(data, drive, NOW);

    // Disaster: data changed and the Lab file is gone.
    await fs.writeFile(path.join(data, 'projects.json'), '{"day":2}');
    await fs.rm(path.join(data, 'media'), { recursive: true });

    await restoreExternalBackup(data, drive, dayStamp(NOW), NOW + 5);
    expect(await fs.readFile(path.join(data, 'projects.json'), 'utf8')).toBe('{"day":1}');
    expect(
      await fs.readFile(path.join(data, 'projects.json.before-restore-' + (NOW + 5)), 'utf8'),
    ).toBe('{"day":2}');
    expect(await fs.readFile(path.join(data, 'media', 'p1', 'sketch.png'), 'utf8')).toBe('png');
  });

  it('refuses a damaged backup without touching current data', async () => {
    const data = await dataDir('{"keep":true}');
    const drive = await tempDir();
    await runExternalBackup(data, drive, NOW);
    await fs.writeFile(
      path.join(drive, BACKUP_FOLDER_NAME, 'data', `projects-${dayStamp(NOW)}.json`),
      '{broken',
    );
    await expect(restoreExternalBackup(data, drive, dayStamp(NOW))).rejects.toThrow();
    expect(await fs.readFile(path.join(data, 'projects.json'), 'utf8')).toBe('{"keep":true}');
    await expect(restoreExternalBackup(data, drive, '../../etc')).rejects.toThrow(
      'Invalid backup date',
    );
  });

  it('finds Google Drive for desktop when installed', async () => {
    const home = await tempDir();
    expect(await findGoogleDrive(home)).toBeNull();
    const myDrive = path.join(
      home,
      'Library',
      'CloudStorage',
      'GoogleDrive-me@example.com',
      'My Drive',
    );
    await fs.mkdir(myDrive, { recursive: true });
    expect(await findGoogleDrive(home)).toBe(myDrive);
  });
});
