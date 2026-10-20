import { describe, expect, it } from 'vitest';
import { ProjectService, UserError } from '../src/main/services/projects';
import { SqliteStore } from '../src/main/store/sqlite-store';
import { editorById } from '../src/shared/editors';
import { tempDir } from './helpers';

async function setup() {
  const store = await SqliteStore.open(await tempDir());
  const service = new ProjectService(store, () => 0);
  const coding = await service.createWorld('Coding');
  const music = await service.createWorld('Music');
  const p = await service.create({
    title: 'Robot',
    status: 'active',
    worldIds: [coding.id, music.id],
    path: null,
  });
  return { service, coding, music, p };
}

describe('world settings', () => {
  it('renames and recolours a world', async () => {
    const { service, coding } = await setup();
    const world = await service.updateWorld(coding.id, { name: ' Code ', color: '#f87171' });
    expect(world).toMatchObject({ name: 'Code', color: '#f87171' });
  });

  it('refuses a name another world already has', async () => {
    const { service, coding } = await setup();
    await expect(service.updateWorld(coding.id, { name: 'music' })).rejects.toBeInstanceOf(
      UserError,
    );
  });

  it('deleting a world keeps its projects and removes only the tag', async () => {
    const { service, coding, music, p } = await setup();
    const data = await service.deleteWorld(coding.id);
    expect(data.worlds.map((w) => w.name)).toEqual(['Music']);
    expect(data.projects.find((x) => x.id === p.id)?.worldIds).toEqual([music.id]);
  });

  it('remembers the chosen editor, defaulting to VS Code', async () => {
    const { service } = await setup();
    expect(editorById(service.bootstrap().settings.editor).name).toBe('VS Code');
    await service.updateSettings({ editor: 'cursor' });
    expect(editorById(service.bootstrap().settings.editor).name).toBe('Cursor');
    expect(editorById('unknown').id).toBe('vscode');
  });
});

describe('area activity', () => {
  it("shows the last week across the area's projects, newest first, with the notes named", async () => {
    const DAY = 86_400_000;
    let now = 100 * DAY;
    const store = await SqliteStore.open(await tempDir());
    const service = new ProjectService(store, () => now);
    const music = await service.createWorld('Music');
    const coding = await service.createWorld('Coding');
    const song = await service.create({
      title: 'Song',
      status: 'active',
      worldIds: [music.id],
      path: null,
    });
    const app = await service.create({
      title: 'App',
      status: 'active',
      worldIds: [coding.id],
      path: null,
    });
    const old = await service.create({
      title: 'Old',
      status: 'active',
      worldIds: [music.id],
      path: null,
    });

    now += 10 * DAY; // project_created events are now more than a week old
    await service.addNote(song.id, 'Chorus', 'Try it in D');
    await service.addNote(app.id, 'Bug', 'Crash on save');
    now += DAY;
    await service.archive(old.id);

    const activity = service.areaActivity(music.id);
    expect(activity.events.map((e) => e.type)).toEqual(['note_added']);
    expect(activity.events[0].projectId).toBe(song.id);
    expect(activity.entries.map((e) => e.title)).toEqual(['Chorus']);
  });
});
