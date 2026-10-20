import { describe, expect, it } from 'vitest';
import { newestLinks, pickUp, type PickUpDeps } from '../src/main/services/pick-up';
import { ProjectService, UserError } from '../src/main/services/projects';
import { defaultSettings } from '../src/main/store/repository';
import { SqliteStore } from '../src/main/store/sqlite-store';
import type { AppSettings, Entry } from '../src/shared/types';
import { tempDir } from './helpers';

const NOW = new Date(2026, 9, 20, 12).getTime();

async function setup(settings: Partial<AppSettings> = {}) {
  const store = await SqliteStore.open(await tempDir());
  let clock = NOW;
  const service = new ProjectService(store, () => clock++);
  const opened: string[] = [];
  const deps = (overrides: Partial<PickUpDeps> = {}): PickUpDeps => ({
    service,
    settings: () => ({ ...defaultSettings(), ...settings }),
    openEditor: async (dir) => (opened.push(`editor ${dir}`), { ok: true, message: null }),
    openTerminal: async (dir) => (opened.push(`terminal ${dir}`), { ok: true, message: null }),
    openUrl: async (url) => void opened.push(`url ${url}`),
    isFolder: async () => true,
    ...overrides,
  });
  return { store, service, opened, deps };
}

describe('pickUp', () => {
  it('resumes a paused project and opens terminal and editor', async () => {
    const { store, service, opened, deps } = await setup();
    const p = await service.create({
      title: 'App',
      status: 'active',
      worldIds: [],
      path: '/code/app',
    });
    await service.pause(p.id, 'a', 'b');

    const result = await pickUp(p.id, deps());
    expect(result.problems).toEqual([]);
    expect(result.project.status).toBe('active');
    expect(opened).toEqual(['terminal /code/app', 'editor /code/app']);
    expect(service.detail(p.id).events.map((e) => e.type)).toContain('opened_in_editor');
    store.close();
  });

  it('leaves the terminal and links out unless asked', async () => {
    const { store, service, opened, deps } = await setup({ pickUpTerminal: false });
    const p = await service.create({ title: 'App', status: 'active', worldIds: [], path: '/p' });
    await service.addLink(p.id, '', 'https://example.com/a');
    await pickUp(p.id, deps());
    expect(opened).toEqual(['editor /p']);
    store.close();
  });

  it('opens the 3 newest web links when that setting is on', async () => {
    const { store, service, opened, deps } = await setup({
      pickUpLinks: true,
      pickUpTerminal: false,
    });
    const p = await service.create({ title: 'Notes', status: 'active', worldIds: [], path: null });
    for (const n of [1, 2, 3, 4]) await service.addLink(p.id, '', `https://example.com/${n}`);

    const result = await pickUp(p.id, deps());
    expect(result.problems).toEqual([]);
    expect(opened).toEqual([
      'url https://example.com/4',
      'url https://example.com/3',
      'url https://example.com/2',
    ]);
    store.close();
  });

  it('reports what failed but still resumes', async () => {
    const { store, service, deps } = await setup();
    const p = await service.create({ title: 'App', status: 'active', worldIds: [], path: '/p' });
    await service.pause(p.id, '', '');
    const result = await pickUp(
      p.id,
      deps({
        openEditor: async () => ({ ok: false, message: 'No editor.' }),
        openTerminal: async () => ({ ok: false, message: 'No terminal.' }),
      }),
    );
    expect(result.project.status).toBe('active');
    expect(result.problems).toEqual(['No terminal.', 'No editor.']);
    expect(service.detail(p.id).events.map((e) => e.type)).not.toContain('opened_in_editor');
    store.close();
  });

  it('does not launch anything for a folder that is gone', async () => {
    const { store, service, opened, deps } = await setup();
    const p = await service.create({ title: 'App', status: 'active', worldIds: [], path: '/gone' });
    const result = await pickUp(p.id, deps({ isFolder: async () => false }));
    expect(opened).toEqual([]);
    expect(result.problems).toHaveLength(1);
    store.close();
  });

  it('refuses archived projects', async () => {
    const { store, service, deps } = await setup();
    const p = await service.create({ title: 'Old', status: 'active', worldIds: [], path: null });
    await service.archive(p.id);
    await expect(pickUp(p.id, deps())).rejects.toBeInstanceOf(UserError);
    store.close();
  });
});

describe('newestLinks', () => {
  const link = (id: string, url: string | null, createdAt: number, type: Entry['type'] = 'link') =>
    ({
      id,
      projectId: 'p',
      type,
      title: id,
      body: '',
      url,
      checklist: null,
      file: null,
      moduleId: null,
      createdAt,
    }) satisfies Entry;

  it('keeps only http(s) links, newest first', () => {
    expect(
      newestLinks([
        link('a', 'https://a.example', 1),
        link('b', 'javascript:alert(1)', 5),
        link('c', 'file:///etc/passwd', 4),
        link('d', 'http://d.example', 3),
        link('e', null, 6),
        link('n', null, 7, 'note'),
        link('f', 'not a url', 8),
      ]),
    ).toEqual(['http://d.example', 'https://a.example']);
  });
});
