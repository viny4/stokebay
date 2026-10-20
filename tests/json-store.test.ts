import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { newId } from '../src/main/store/ids';
import { BACKUP_COUNT, DATA_FILE, JsonStore } from '../src/main/store/json-store';
import { createSampleData } from '../src/main/store/sample-data';
import { tempDir } from './helpers';

const NOW = Date.UTC(2026, 9, 19, 12);

async function readData(dir: string, suffix = '') {
  return JSON.parse(await fs.readFile(path.join(dir, DATA_FILE + suffix), 'utf8'));
}

async function createOne(store: JsonStore, title: string) {
  return store.transaction((tx) =>
    tx.createProject({ title, status: 'active', worldIds: [], path: null, createdAt: NOW }),
  );
}

describe('JsonStore', () => {
  it('seeds a new data file on first open', async () => {
    const dir = await tempDir();
    await JsonStore.open(dir, { seed: () => createSampleData(NOW, newId) });
    const data = await readData(dir);
    expect(data.version).toBe(3);
    expect(data.projects.length).toBeGreaterThan(0);
    expect(data.projects.every((p: { isSample: boolean }) => p.isSample)).toBe(true);
  });

  it('creates, updates, archives and restores, and keeps it all across reopen', async () => {
    const dir = await tempDir();
    const store = await JsonStore.open(dir);
    const project = await createOne(store, 'Robot');
    await store.transaction((tx) => tx.updateProject(project.id, { title: 'Robot arm' }, NOW + 1));
    await store.transaction((tx) => tx.archiveProject(project.id, NOW + 2));

    let reopened = await JsonStore.open(dir);
    expect(reopened.getProject(project.id)).toMatchObject({
      title: 'Robot arm',
      archivedAt: NOW + 2,
    });

    await reopened.transaction((tx) => tx.restoreProject(project.id, NOW + 3));
    reopened = await JsonStore.open(dir);
    expect(reopened.getProject(project.id)?.archivedAt).toBeNull();
  });

  it('leaves data untouched when a transaction throws', async () => {
    const dir = await tempDir();
    const store = await JsonStore.open(dir);
    const project = await createOne(store, 'Keep me');
    await expect(
      store.transaction((tx) => {
        tx.updateProject(project.id, { title: 'Half done' }, NOW);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(store.getProject(project.id)?.title).toBe('Keep me');
    expect((await readData(dir)).projects[0].title).toBe('Keep me');
  });

  it('writes atomically: no temp file left and the file always parses', async () => {
    const dir = await tempDir();
    const store = await JsonStore.open(dir);
    await Promise.all(Array.from({ length: 10 }, (_, i) => createOne(store, `P${i}`)));
    await store.flush();
    const files = await fs.readdir(dir);
    expect(files).not.toContain(`${DATA_FILE}.tmp`);
    expect((await readData(dir)).projects).toHaveLength(10);
  });

  it(`keeps exactly the last ${BACKUP_COUNT} previous versions`, async () => {
    const dir = await tempDir();
    const store = await JsonStore.open(dir); // write 1 (empty file)
    for (let i = 1; i <= 7; i++) await createOne(store, `P${i}`); // writes 2..8

    const backups = (await fs.readdir(dir)).filter((f) => /\.json\.\d+$/.test(f)).sort();
    expect(backups).toEqual([1, 2, 3, 4, 5].map((n) => `${DATA_FILE}.${n}`));
    // .1 is the version right before the latest write, .5 the oldest kept.
    expect((await readData(dir, '.1')).projects).toHaveLength(6);
    expect((await readData(dir, '.5')).projects).toHaveLength(2);
    expect((await readData(dir)).projects).toHaveLength(7);
  });

  it('falls back to the newest good backup when the main file is corrupt, keeping the bad file', async () => {
    const dir = await tempDir();
    const store = await JsonStore.open(dir);
    await createOne(store, 'First');
    await createOne(store, 'Second');
    await fs.writeFile(path.join(dir, DATA_FILE), '{ not json');

    const recovered = await JsonStore.open(dir);
    expect(recovered.listProjects().map((p) => p.title)).toEqual(['First']);
    const files = await fs.readdir(dir);
    expect(files.some((f) => f.startsWith(`${DATA_FILE}.corrupt-`))).toBe(true);
  });

  it('removes a project together with its entries, pauses and events', async () => {
    const dir = await tempDir();
    const store = await JsonStore.open(dir);
    const project = await createOne(store, 'Gone');
    await store.transaction((tx) => {
      tx.addEntry({
        projectId: project.id,
        type: 'note',
        title: '',
        body: 'x',
        url: null,
        createdAt: NOW,
      });
      tx.addPause({ projectId: project.id, pausedAt: NOW, whereIStopped: '', nextStep: '' });
      tx.addEvent({ type: 'note_added', projectId: project.id, payload: {}, createdAt: NOW });
    });
    await store.transaction((tx) => tx.deleteProject(project.id));
    const data = await readData(dir);
    expect(data.projects).toHaveLength(0);
    expect(data.entries).toHaveLength(0);
    expect(data.pauses).toHaveLength(0);
    expect(data.events).toHaveLength(0);
  });

  it('tracks the newest event time on the project', async () => {
    const dir = await tempDir();
    const store = await JsonStore.open(dir);
    const project = await createOne(store, 'Busy');
    await store.transaction((tx) => {
      tx.addEvent({ type: 'note_added', projectId: project.id, payload: {}, createdAt: NOW + 500 });
      tx.addEvent({ type: 'note_added', projectId: project.id, payload: {}, createdAt: NOW + 100 });
    });
    expect(store.getProject(project.id)?.lastEventAt).toBe(NOW + 500);
    expect(store.listEvents(project.id)[0].createdAt).toBe(NOW + 500);
  });
});
