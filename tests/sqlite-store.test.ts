import fs from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { ProjectService } from '../src/main/services/projects';
import { DATA_FILE, emptyStoreData } from '../src/main/store/json-store';
import {
  DB_FILE,
  RESTORE_FILE,
  SqliteStore,
  migrate,
  toMatchQuery,
} from '../src/main/store/sqlite-store';
import { SNIPPET_CLOSE, SNIPPET_OPEN } from '../src/shared/types';
import { tempDir } from './helpers';

const NOW = new Date(2026, 9, 20, 12).getTime();

async function setup() {
  const dir = await tempDir();
  const store = await SqliteStore.open(dir);
  const service = new ProjectService(store, () => NOW);
  return { dir, store, service };
}

describe('SqliteStore', () => {
  it('moves an existing projects.json into the database once, keeping the file', async () => {
    const dir = await tempDir();
    const old = emptyStoreData();
    old.settings.onboarded = true;
    old.worlds.push({ id: 'w1', name: 'Coding', color: '#5b8fd1', icon: null, sortOrder: 0 });
    await fs.writeFile(path.join(dir, DATA_FILE), JSON.stringify({ ...old, version: 3 }));

    const store = await SqliteStore.open(dir);
    expect(store.listWorlds().map((w) => w.name)).toEqual(['Coding']);
    expect(store.getSettings().onboarded).toBe(true);
    const files = await fs.readdir(dir);
    expect(files).toContain(DB_FILE);
    expect(files).not.toContain(DATA_FILE);
    expect(files.some((f) => f.startsWith(`${DATA_FILE}.imported-`))).toBe(true);
    store.close();

    // A projects.json appearing later (e.g. copied in by hand) is not imported again.
    await fs.writeFile(path.join(dir, DATA_FILE), JSON.stringify(emptyStoreData()));
    expect((await SqliteStore.open(dir)).listWorlds()).toHaveLength(1);
  });

  it('keeps nothing from a change that fails halfway', async () => {
    const { store, service } = await setup();
    const p = await service.create({ title: 'Robot', status: 'active', worldIds: [], path: null });
    await expect(
      store.transaction((tx) => {
        tx.updateProject(p.id, { title: 'Renamed' }, NOW);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(store.getProject(p.id)?.title).toBe('Robot');
  });

  it('finds notes by any words, as prefixes, ignoring accents, and keeps up with edits', async () => {
    const { store, service } = await setup();
    const p = await service.create({
      title: 'Café racer',
      status: 'active',
      worldIds: [],
      path: null,
    });
    const note = await store.transaction((tx) =>
      tx.addEntry({
        projectId: p.id,
        type: 'note',
        title: 'Wiring',
        body: 'The servo jitters when the battery is low',
        url: null,
        createdAt: NOW,
      }),
    );

    const hits = store.search('serv batt');
    expect(hits.map((h) => h.entryId)).toEqual([note.id]);
    expect(hits[0].snippet).toContain(`${SNIPPET_OPEN}servo${SNIPPET_CLOSE}`);
    expect(store.search('cafe').map((h) => h.kind)).toEqual(['project']);
    expect(store.search('servo motor')).toEqual([]);

    await store.transaction((tx) => tx.updateEntry(note.id, { body: 'Fixed with a capacitor' }));
    expect(store.search('servo')).toEqual([]);
    expect(store.search('capac')).toHaveLength(1);

    await store.transaction((tx) => tx.deleteProject(p.id));
    expect(store.search('capac')).toEqual([]);
    expect(store.search('cafe')).toEqual([]);
  });

  it('treats search punctuation as text, never as query syntax', async () => {
    const { store } = await setup();
    for (const q of ['c++', '"', 'a-b', 'title:x', '(', '*', 'NOT', '   ']) {
      expect(() => store.search(q)).not.toThrow();
    }
    expect(toMatchQuery('  ')).toBeNull();
    expect(toMatchQuery('say "hi" now')).toBe('"say"* "hi"* "now"*');
  });

  it('exports everything and loads a backup waiting in restore.json on the next start', async () => {
    const { dir, store, service } = await setup();
    await service.create({ title: 'Kept', status: 'active', worldIds: [], path: null });
    const backup = store.snapshot();
    await service.create({ title: 'Added later', status: 'idea', worldIds: [], path: null });
    store.close();

    await fs.writeFile(path.join(dir, RESTORE_FILE), JSON.stringify(backup));
    const restored = await SqliteStore.open(dir);
    expect(restored.listProjects().map((p) => p.title)).toEqual(['Kept']);
    expect(restored.snapshot()).toEqual(backup);
    const files = await fs.readdir(dir);
    expect(files).not.toContain(RESTORE_FILE);
    expect(files.some((f) => f.startsWith(`${RESTORE_FILE}.restored-`))).toBe(true);
  });

  it('refuses a database written by a newer version instead of damaging it', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA user_version = 999');
    expect(() => migrate(db)).toThrow(/newer version/);
  });
});
