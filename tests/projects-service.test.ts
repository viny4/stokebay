import { describe, expect, it } from 'vitest';
import { ProjectService, UserError } from '../src/main/services/projects';
import { newId } from '../src/main/store/ids';
import { SqliteStore } from '../src/main/store/sqlite-store';
import { createSampleData } from '../src/main/store/sample-data';
import { DAY } from '../src/shared/time';
import { tempDir } from './helpers';

const NOW = Date.UTC(2026, 9, 19, 12);

async function setup(options: { samples?: boolean } = {}) {
  const dir = await tempDir();
  const store = await SqliteStore.open(dir, {
    seed: options.samples ? () => createSampleData(NOW, newId) : undefined,
  });
  let now = NOW;
  const service = new ProjectService(store, () => now);
  return { service, store, advance: (ms: number) => (now += ms) };
}

const manual = { status: 'active' as const, worldIds: [], path: null };

describe('ProjectService', () => {
  it('records project_created and uses it as last activity', async () => {
    const { service, store } = await setup();
    const p = await service.create({ ...manual, title: 'Robot arm' });
    expect(p.lastActivityAt).toBe(NOW);
    expect(store.listEvents(p.id).map((e) => e.type)).toEqual(['project_created']);
  });

  it('pauses with a note and resumes, closing the pause', async () => {
    const { service, store, advance } = await setup();
    const p = await service.create({ ...manual, title: 'Chess' });
    advance(DAY);
    const paused = await service.pause(p.id, 'castling half done', 'finish castling');
    expect(paused.status).toBe('paused');
    expect(paused.activePause).toMatchObject({
      whereIStopped: 'castling half done',
      nextStep: 'finish castling',
    });

    advance(DAY);
    const resumed = await service.resume(p.id);
    expect(resumed.status).toBe('active');
    expect(resumed.activePause).toBeNull();
    expect(store.activePause(p.id)).toBeUndefined();
    expect(store.listEvents(p.id).map((e) => e.type)).toEqual([
      'project_resumed',
      'project_paused',
      'project_created',
    ]);
  });

  it('only pauses active projects and only edits status after resuming', async () => {
    const { service } = await setup();
    const idea = await service.create({ ...manual, status: 'idea', title: 'Idea' });
    await expect(service.pause(idea.id, '', '')).rejects.toBeInstanceOf(UserError);

    const p = await service.create({ ...manual, title: 'Busy' });
    await service.pause(p.id, '', '');
    await expect(service.update(p.id, { status: 'done' })).rejects.toBeInstanceOf(UserError);
  });

  it('archives, restores, and deletes only from the archive', async () => {
    const { service, store } = await setup();
    const p = await service.create({ ...manual, title: 'Old' });
    await expect(service.deletePermanently(p.id)).rejects.toBeInstanceOf(UserError);

    expect((await service.archive(p.id)).archivedAt).toBe(NOW);
    expect((await service.restore(p.id)).archivedAt).toBeNull();
    await service.archive(p.id);
    await service.deletePermanently(p.id);
    expect(store.getProject(p.id)).toBeUndefined();
    expect(store.listEvents(p.id)).toHaveLength(0);
  });

  it('records which fields changed, and nothing when nothing changed', async () => {
    const { service, store } = await setup();
    const p = await service.create({ ...manual, title: 'A' });
    await service.update(p.id, { title: 'A' });
    expect(store.listEvents(p.id)).toHaveLength(1);
    await service.update(p.id, { title: 'B', status: 'done' });
    expect(store.listEvents(p.id)[0]).toMatchObject({
      type: 'project_updated',
      payload: { fields: ['title', 'status'] },
    });
  });

  it('adds notes and links with events, defaulting a link title to its host', async () => {
    const { service } = await setup();
    const p = await service.create({ ...manual, title: 'Site' });
    await service.addNote(p.id, '', 'Use a grid layout');
    const detail = await service.addLink(p.id, '', 'https://example.com/docs');
    expect(detail.entries.map((e) => e.title)).toEqual(['example.com', '']);
    expect(detail.events.map((e) => e.type)).toEqual([
      'link_added',
      'note_added',
      'project_created',
    ]);
  });

  it('uses the newer of last event and last commit as last activity', async () => {
    const { service } = await setup();
    const p = await service.create({ ...manual, title: 'Repo' });
    const commitAt = NOW + 3 * DAY;
    await service.saveGitInfo(
      new Map([
        [
          p.id,
          {
            branch: 'main',
            lastCommitAt: commitAt,
            lastCommitMsg: 'fix',
            refreshedAt: commitAt,
            error: null,
          },
        ],
      ]),
    );
    expect(service.summary(p.id).lastActivityAt).toBe(commitAt);
  });

  it('skips saving when Git info did not change', async () => {
    const { service } = await setup();
    const p = await service.create({ ...manual, title: 'Repo' });
    const info = {
      branch: 'main',
      lastCommitAt: NOW,
      lastCommitMsg: 'x',
      refreshedAt: NOW,
      error: null,
    };
    expect(await service.saveGitInfo(new Map([[p.id, info]]))).toBe(true);
    expect(await service.saveGitInfo(new Map([[p.id, { ...info, refreshedAt: NOW + 1 }]]))).toBe(
      false,
    );
  });

  it('removes all sample projects in one go', async () => {
    const { service } = await setup({ samples: true });
    await service.create({ ...manual, title: 'Mine' });
    const left = await service.removeSamples();
    expect(left.map((p) => p.title)).toEqual(['Mine']);
  });

  it('refuses duplicate world names, ignoring case', async () => {
    const { service } = await setup({ samples: true });
    await expect(service.createWorld('coding')).rejects.toBeInstanceOf(UserError);
    const world = await service.createWorld('Robotics');
    expect(service.bootstrap().worlds.at(-1)).toEqual(world);
  });

  it('imports scanned folders once, skipping ones already added', async () => {
    const { service } = await setup();
    const found = [
      { path: '/code/a', name: 'a', hasGit: true },
      { path: '/code/b', name: 'b', hasGit: false },
    ];
    expect(await service.importScanned(found, [])).toHaveLength(2);
    expect(await service.importScanned(found, [])).toHaveLength(0);
  });
});
