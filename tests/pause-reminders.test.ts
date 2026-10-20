import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  reminderText,
  startReminders,
  takeDueReminders,
  type NotificationLike,
} from '../src/main/services/reminders';
import { ProjectService } from '../src/main/services/projects';
import { DATA_FILE, emptyStoreData, JsonStore } from '../src/main/store/json-store';
import { SqliteStore } from '../src/main/store/sqlite-store';
import type { GitWorkState } from '../src/shared/types';
import { tempDir } from './helpers';

const NOW = new Date(2026, 9, 20, 12).getTime();
const HOUR = 60 * 60 * 1000;

const CONTEXT: GitWorkState = {
  branch: 'feature/login',
  lastCommitAt: NOW - 2 * HOUR,
  lastCommitMsg: 'Add token refresh',
  changedFiles: ['src/auth.ts', 'src/api.ts'],
  changedCount: 2,
};

async function setup() {
  const dir = await tempDir();
  const store = await SqliteStore.open(dir);
  const service = new ProjectService(store, () => NOW);
  await service.updateSettings({ onboarded: true });
  return { dir, store, service };
}

async function pausedProject(
  service: ProjectService,
  title: string,
  options: { remindAt?: number | null; gitContext?: GitWorkState | null } = {},
) {
  const p = await service.create({ title, status: 'active', worldIds: [], path: null });
  await service.pause(p.id, 'half way', 'write the tests', options);
  return p;
}

describe('pausing with Git context and a reminder', () => {
  it('stores both and reads them back after reopening the database', async () => {
    const { dir, store, service } = await setup();
    const p = await pausedProject(service, 'Login', {
      gitContext: CONTEXT,
      remindAt: NOW + 24 * HOUR,
    });
    store.close();

    const reopened = await SqliteStore.open(dir);
    expect(reopened.activePause(p.id)).toMatchObject({
      whereIStopped: 'half way',
      gitContext: CONTEXT,
      remindAt: NOW + 24 * HOUR,
    });
    reopened.close();
  });

  it('keeps the old three-argument pause working (no context, no reminder)', async () => {
    const { store, service } = await setup();
    const p = await service.create({ title: 'Old', status: 'active', worldIds: [], path: null });
    const paused = await service.pause(p.id, 'a', 'b');
    expect(paused.activePause).toMatchObject({ gitContext: null, remindAt: null });
    store.close();
  });

  it('loads old data files whose pauses have neither field', async () => {
    const dir = await tempDir();
    const old = emptyStoreData();
    old.settings.onboarded = true;
    const raw = {
      ...old,
      version: 3,
      projects: [
        {
          id: 'p1',
          title: 'Old project',
          path: null,
          status: 'paused',
          color: null,
          isWork: false,
          isSample: false,
          worldIds: [],
          createdAt: NOW,
          updatedAt: NOW,
          lastEventAt: NOW,
          archivedAt: null,
          git: null,
        },
      ],
      // Written before Git context and reminders existed.
      pauses: [
        {
          id: 'z1',
          projectId: 'p1',
          pausedAt: NOW,
          resumedAt: null,
          whereIStopped: 'x',
          nextStep: 'y',
        },
      ],
    };
    await fs.writeFile(path.join(dir, DATA_FILE), JSON.stringify(raw));

    const json = await JsonStore.open(dir);
    expect(json.activePause('p1')).toMatchObject({ gitContext: null, remindAt: null });

    const store = await SqliteStore.open(dir);
    expect(store.activePause('p1')).toMatchObject({
      whereIStopped: 'x',
      gitContext: null,
      remindAt: null,
    });
    expect(store.listDueReminders(NOW + 365 * 24 * HOUR)).toEqual([]);
    store.close();
  });
});

describe('due reminders', () => {
  it('selects only open pauses whose time has come, earliest first', async () => {
    const { store, service } = await setup();
    const later = await pausedProject(service, 'Later', { remindAt: NOW - HOUR });
    const earlier = await pausedProject(service, 'Earlier', { remindAt: NOW - 2 * HOUR });
    await pausedProject(service, 'Future', { remindAt: NOW + HOUR });
    await pausedProject(service, 'None');
    const resumed = await pausedProject(service, 'Resumed', { remindAt: NOW - HOUR });
    await service.resume(resumed.id);

    expect(store.listDueReminders(NOW).map((p) => p.projectId)).toEqual([earlier.id, later.id]);
    store.close();
  });

  it('fires each reminder once', async () => {
    const { store, service } = await setup();
    const p = await pausedProject(service, 'Robot arm', { remindAt: NOW - 1 });

    expect(await takeDueReminders(store, NOW)).toEqual([
      {
        pauseId: store.activePause(p.id)!.id,
        projectId: p.id,
        title: 'Robot arm',
        nextStep: 'write the tests',
      },
    ]);
    expect(await takeDueReminders(store, NOW)).toEqual([]);
    expect(store.activePause(p.id)?.remindAt).toBeNull();
    store.close();
  });

  it('clears reminders of archived projects without showing them', async () => {
    const { store, service } = await setup();
    const p = await pausedProject(service, 'Archived', { remindAt: NOW - 1 });
    await service.archive(p.id);
    expect(await takeDueReminders(store, NOW)).toEqual([]);
    expect(store.listDueReminders(NOW)).toEqual([]);
    store.close();
  });

  it('works the same with the JSON store', async () => {
    const dir = await tempDir();
    const store = await JsonStore.open(dir);
    const service = new ProjectService(store, () => NOW);
    await pausedProject(service, 'Json', { remindAt: NOW - 1 });
    expect(await takeDueReminders(store, NOW)).toHaveLength(1);
    expect(await takeDueReminders(store, NOW)).toEqual([]);
  });

  it('asks the question in the title and gives the next step as the body', () => {
    const base = { pauseId: 'z', projectId: 'p', title: 'Robot arm' };
    expect(reminderText({ ...base, nextStep: '  Wire the\nservo ' })).toEqual({
      title: 'Time to pick up Robot arm?',
      body: 'Next step: Wire the servo',
    });
    expect(reminderText({ ...base, nextStep: '' }).body).toBe('Open it to see where you stopped.');
  });

  it('shows a notification that opens the project when clicked', async () => {
    const { store, service } = await setup();
    const p = await pausedProject(service, 'Robot arm', { remindAt: NOW - 1 });
    const shown: FakeNotification[] = [];
    const opened: string[] = [];

    class FakeNotification implements NotificationLike {
      static isSupported = () => true;
      handlers = new Map<string, () => void>();
      constructor(readonly options: { title: string; body: string }) {
        shown.push(this);
      }
      on(event: 'click' | 'close', listener: () => void) {
        this.handlers.set(event, listener);
      }
      show() {}
    }

    const stop = startReminders({
      repo: store,
      Notification: FakeNotification,
      onOpen: (id) => opened.push(id),
      clock: () => NOW,
      intervalMs: 60_000,
    });
    await waitUntil(() => shown.length > 0);
    stop();

    expect(shown).toHaveLength(1);
    expect(shown[0].options.title).toBe('Time to pick up Robot arm?');
    shown[0].handlers.get('click')?.();
    expect(opened).toEqual([p.id]);
    store.close();
  });
});

async function waitUntil(check: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
