import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { enableFileLogging, LOG_DAYS_KEPT } from '../src/main/logging/logger';
import { dayStamp, DAILY_BACKUPS_KEPT, runDailyBackup } from '../src/main/services/backup';
import { ProjectService } from '../src/main/services/projects';
import { DATA_FILE, JsonStore } from '../src/main/store/json-store';
import { migrateStoreData } from '../src/main/store/migrate';
import { tempDir } from './helpers';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 9, 20, 12).getTime();

describe('daily backups', () => {
  it('writes one backup per day and never overwrites it', async () => {
    const dir = await tempDir();
    const data = path.join(dir, 'projects.json');
    const backups = path.join(dir, 'backups');
    await fs.writeFile(data, 'morning');
    expect(await runDailyBackup(data, backups, NOW)).toContain(`projects-${dayStamp(NOW)}.json`);
    await fs.writeFile(data, 'evening');
    expect(await runDailyBackup(data, backups, NOW + 1000)).toBeNull();
    expect(await fs.readFile(path.join(backups, `projects-${dayStamp(NOW)}.json`), 'utf8')).toBe(
      'morning',
    );
  });

  it(`keeps only the newest ${DAILY_BACKUPS_KEPT} days`, async () => {
    const dir = await tempDir();
    const data = path.join(dir, 'projects.json');
    const backups = path.join(dir, 'backups');
    await fs.writeFile(data, '{}');
    for (let i = 0; i < 10; i++) await runDailyBackup(data, backups, NOW + i * DAY);
    const files = (await fs.readdir(backups)).sort();
    expect(files).toHaveLength(DAILY_BACKUPS_KEPT);
    expect(files.at(-1)).toBe(`projects-${dayStamp(NOW + 9 * DAY)}.json`);
    expect(files[0]).toBe(`projects-${dayStamp(NOW + 3 * DAY)}.json`);
  });

  it('does nothing when there is no data file yet', async () => {
    const dir = await tempDir();
    expect(
      await runDailyBackup(path.join(dir, 'missing.json'), path.join(dir, 'b'), NOW),
    ).toBeNull();
  });
});

describe('first-run setup', () => {
  it('starts a fresh install empty and not set up', async () => {
    const store = await JsonStore.open(await tempDir());
    expect(store.getSettings()).toEqual({ onboarded: false });
    expect(store.listProjects()).toHaveLength(0);
  });

  it('counts upgraded data as already set up', () => {
    const v2 = { version: 2, worlds: [], projects: [], pauses: [], entries: [], events: [] };
    expect(migrateStoreData(v2)?.settings).toEqual({ onboarded: true });
  });

  it('creates chosen worlds once, adds examples into matching worlds, and finishes setup', async () => {
    const dir = await tempDir();
    const store = await JsonStore.open(dir);
    const service = new ProjectService(store, () => NOW);
    const data = await service.finishOnboarding(['Coding', 'coding', ' Robotics ', 'Music'], true);

    const names = data.worlds.map((w) => w.name);
    expect(names.filter((n) => n.toLowerCase() === 'coding')).toHaveLength(1);
    expect(names).toEqual(
      expect.arrayContaining(['Robotics', 'Music', 'Writing', 'Health', 'Learning']),
    );
    expect(data.projects.length).toBe(7);
    const coding = data.worlds.find((w) => w.name === 'Coding')!;
    expect(data.projects.filter((p) => p.worldIds.includes(coding.id)).length).toBeGreaterThan(0);
    // Every project's worlds exist.
    const worldIds = new Set(data.worlds.map((w) => w.id));
    expect(data.projects.every((p) => p.worldIds.every((id) => worldIds.has(id)))).toBe(true);
    expect(data.settings.onboarded).toBe(true);

    const saved = JSON.parse(await fs.readFile(path.join(dir, DATA_FILE), 'utf8'));
    expect(saved.settings.onboarded).toBe(true);
  });

  it('can finish setup empty', async () => {
    const service = new ProjectService(await JsonStore.open(await tempDir()), () => NOW);
    const data = await service.finishOnboarding([], false);
    expect(data.projects).toHaveLength(0);
    expect(data.worlds).toHaveLength(0);
    expect(data.settings.onboarded).toBe(true);
  });
});

describe('file logging', () => {
  it(`deletes log files older than ${LOG_DAYS_KEPT} days and keeps recent ones`, async () => {
    const dir = await tempDir();
    await fs.writeFile(path.join(dir, 'main-2026-01-01.log'), 'old');
    await fs.writeFile(
      path.join(dir, `main-${new Date(NOW - DAY).toISOString().slice(0, 10)}.log`),
      'recent',
    );
    await fs.writeFile(path.join(dir, 'other.txt'), 'not a log');
    enableFileLogging(dir, NOW);
    const files = (await fs.readdir(dir)).sort();
    expect(files).not.toContain('main-2026-01-01.log');
    expect(files).toContain('other.txt');
    expect(files.some((f) => f.includes('recent') || /^main-\d/.test(f))).toBe(true);
  });
});
