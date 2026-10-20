import { describe, expect, it, vi } from 'vitest';
import { CaptureShortcut, type ShortcutRegistry } from '../src/main/capture-shortcut';
import { ProjectService } from '../src/main/services/projects';
import { SqliteStore } from '../src/main/store/sqlite-store';
import { captureTargets, defaultTarget, filterTargets } from '../src/renderer/capture/picker';
import {
  acceleratorFromValue,
  SHORTCUT_PRESETS,
  shortcutLabel,
  shortcutOptions,
} from '../src/renderer/capture/shortcuts';
import type { ProjectSummary } from '../src/shared/types';
import { tempDir } from './helpers';

const NOW = Date.UTC(2026, 9, 20, 12);

function project(id: string, title: string, lastActivityAt: number, archived = false) {
  return {
    id,
    title,
    lastActivityAt,
    archivedAt: archived ? NOW : null,
  } as ProjectSummary;
}

describe('capture project picker', () => {
  const projects = [
    project('a', 'Robot arm', NOW - 3000),
    project('b', 'Chess engine', NOW - 1000),
    project('c', 'Old blog', NOW, true),
    project('d', 'Arm wrestling app', NOW - 2000),
  ];

  it('offers non-archived projects, most recently active first', () => {
    expect(captureTargets(projects).map((p) => p.id)).toEqual(['b', 'd', 'a']);
    // The input list is left as it was.
    expect(projects.map((p) => p.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('defaults to the last capture project, else the most recent', () => {
    const targets = captureTargets(projects);
    expect(defaultTarget(targets, 'a')?.id).toBe('a');
    expect(defaultTarget(targets, null)?.id).toBe('b');
    // Archived or deleted since: fall back.
    expect(defaultTarget(targets, 'c')?.id).toBe('b');
    expect(defaultTarget(targets, 'gone')?.id).toBe('b');
    expect(defaultTarget([], 'a')).toBeNull();
  });

  it('filters by every typed word, titles starting with the query first', () => {
    const targets = captureTargets(projects);
    expect(filterTargets(targets, '').map((p) => p.id)).toEqual(['b', 'd', 'a']);
    expect(filterTargets(targets, 'arm').map((p) => p.id)).toEqual(['d', 'a']);
    expect(filterTargets(targets, 'ROBOT').map((p) => p.id)).toEqual(['a']);
    expect(filterTargets(targets, 'arm app').map((p) => p.id)).toEqual(['d']);
    expect(filterTargets(targets, 'engine').map((p) => p.id)).toEqual(['b']);
    expect(filterTargets(targets, 'zzz')).toEqual([]);
  });
});

describe('capture shortcut presets', () => {
  it('reads as macOS symbols on a Mac and Ctrl names elsewhere', () => {
    expect(shortcutLabel('CommandOrControl+Shift+Space', true)).toBe('⌘⇧Space');
    expect(shortcutLabel('Alt+Space', true)).toBe('⌥Space');
    expect(shortcutLabel('CommandOrControl+Shift+K', true)).toBe('⌘⇧K');
    expect(shortcutLabel('Control+Space', true)).toBe('⌃Space');
    expect(shortcutLabel('CommandOrControl+Shift+Space', false)).toBe('Ctrl+Shift+Space');
    expect(shortcutLabel('Alt+Space', false)).toBe('Alt+Space');
    expect(shortcutLabel('Control+Space', false)).toBe('Ctrl+Space');
    expect(shortcutLabel(null, true)).toBe('Off');
  });

  it('maps options to accelerators and back', () => {
    const options = shortcutOptions('CommandOrControl+Shift+Space', true);
    expect(options.map((o) => o.accelerator)).toEqual([...SHORTCUT_PRESETS]);
    expect(options[0]).toEqual({ value: '', accelerator: null, label: 'Off' });
    for (const option of options) {
      expect(acceleratorFromValue(option.value)).toBe(option.accelerator);
    }
  });

  it('keeps a custom shortcut in the list', () => {
    const options = shortcutOptions('Alt+Shift+N', false);
    expect(options).toHaveLength(SHORTCUT_PRESETS.length + 1);
    expect(options.at(-1)).toEqual({
      value: 'Alt+Shift+N',
      accelerator: 'Alt+Shift+N',
      label: 'Alt+Shift+N',
    });
  });
});

function fakeRegistry(taken: string[] = []) {
  const registered = new Set<string>();
  const registry: ShortcutRegistry = {
    register: vi.fn((accelerator: string) => {
      if (accelerator === 'Bad+') throw new Error('Failed to parse accelerator');
      if (taken.includes(accelerator)) return false;
      registered.add(accelerator);
      return true;
    }),
    unregister: vi.fn((accelerator: string) => void registered.delete(accelerator)),
  };
  return { registry, registered };
}

describe('CaptureShortcut', () => {
  it('registers, swaps and turns off the shortcut', () => {
    const { registry, registered } = fakeRegistry();
    const press = vi.fn();
    const shortcut = new CaptureShortcut(registry, press);

    expect(shortcut.apply('CommandOrControl+Shift+Space')).toEqual({
      shortcut: 'CommandOrControl+Shift+Space',
      registered: true,
    });
    expect([...registered]).toEqual(['CommandOrControl+Shift+Space']);

    // Same value again (another setting changed): nothing re-registered.
    shortcut.apply('CommandOrControl+Shift+Space');
    expect(registry.register).toHaveBeenCalledTimes(1);

    shortcut.apply('Alt+Space');
    expect([...registered]).toEqual(['Alt+Space']);

    expect(shortcut.apply(null)).toEqual({ shortcut: null, registered: false });
    expect(registered.size).toBe(0);
  });

  it('reports a shortcut another app owns, and one the system rejects', () => {
    const { registry } = fakeRegistry(['Control+Space']);
    const failed = vi.fn();
    const shortcut = new CaptureShortcut(registry, () => undefined, failed);

    expect(shortcut.apply('Control+Space')).toEqual({
      shortcut: 'Control+Space',
      registered: false,
    });
    expect(failed).toHaveBeenCalledWith('Control+Space', 'taken by another app');
    // Picking it again tries again (the other app may have let go).
    shortcut.apply('Control+Space');
    expect(registry.register).toHaveBeenCalledTimes(2);

    expect(shortcut.apply('Bad+').registered).toBe(false);
    expect(failed).toHaveBeenLastCalledWith('Bad+', 'Failed to parse accelerator');
  });

  it('lets go of the shortcut on quit', () => {
    const { registry, registered } = fakeRegistry();
    const shortcut = new CaptureShortcut(registry, () => undefined);
    shortcut.apply('Alt+Space');
    shortcut.release();
    expect(registered.size).toBe(0);
    expect(shortcut.status()).toEqual({ shortcut: 'Alt+Space', registered: false });
  });
});

describe('capture save in ProjectService', () => {
  it('adds the note with source "capture" and remembers the project', async () => {
    const store = await SqliteStore.open(await tempDir());
    const service = new ProjectService(store, () => NOW);
    const p = await service.create({
      title: 'Robot arm',
      status: 'active',
      worldIds: [],
      path: null,
    });

    const detail = await service.addNote(p.id, '', 'try a stiffer servo horn', 'capture');
    await service.updateSettings({ lastCaptureProjectId: p.id });

    expect(detail.entries[0]).toMatchObject({
      type: 'note',
      title: '',
      body: 'try a stiffer servo horn',
    });
    const added = store.listEvents(p.id).find((e) => e.type === 'note_added');
    expect(added?.payload).toEqual({ entryId: detail.entries[0].id, source: 'capture' });
    expect(service.bootstrap().settings.lastCaptureProjectId).toBe(p.id);

    // Notes from the project panel keep their old payload.
    const plain = await service.addNote(p.id, 'Idea', 'body');
    const note = plain.entries.find((e) => e.title === 'Idea');
    const events = store.listEvents(p.id).filter((e) => e.type === 'note_added');
    expect(events.find((e) => e.payload.entryId === note?.id)?.payload).toEqual({
      entryId: note?.id,
    });
    store.close();
  });
});
