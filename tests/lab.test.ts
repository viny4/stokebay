import fs from 'node:fs/promises';
import { STORE_VERSION } from '../src/main/store/repository';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getBlueprint } from '../src/main/services/blueprints';
import { LabService, ZONE } from '../src/main/services/lab';
import { COPY_LIMIT_BYTES, MediaStore } from '../src/main/services/media';
import { ProjectService, UserError } from '../src/main/services/projects';
import { DATA_FILE, JsonStore } from '../src/main/store/json-store';
import { migrateStoreData } from '../src/main/store/migrate';
import { tempDir } from './helpers';

const NOW = Date.UTC(2026, 9, 20, 12);

async function setup() {
  const dir = await tempDir();
  const store = await JsonStore.open(dir);
  const media = new MediaStore(path.join(dir, 'media'));
  const projects = new ProjectService(store, () => NOW);
  const lab = new LabService(store, projects, media, () => NOW);
  return { dir, store, media, projects, lab };
}

const part = {
  name: 'MG996R servo',
  qty: 4,
  unitCostMinor: 800,
  currency: 'USD',
  supplierUrl: null,
  status: 'needed' as const,
  notes: '',
};

async function ignited(lab: LabService, blueprintId = 'hardware-build') {
  const blueprint = getBlueprint(blueprintId)!;
  return lab.ignite(
    {
      title: 'Robot arm',
      idea: 'A robot arm that sorts Lego',
      blueprintId,
      worldIds: [],
      path: null,
      modules: blueprint.modules,
      checklist: blueprint.checklist,
      partsBin: blueprint.partsBin,
    },
    blueprint,
  );
}

describe('migrateStoreData', () => {
  it('upgrades a first-prototype file without losing anything', () => {
    const v1 = {
      version: 1,
      worlds: [],
      projects: [{ id: 'p', title: 'Old', status: 'active' }],
      pauses: [],
      entries: [
        { id: 'e', projectId: 'p', type: 'note', title: '', body: 'hi', url: null, createdAt: 1 },
      ],
      events: [],
    };
    const data = migrateStoreData(v1)!;
    expect(data.version).toBe(STORE_VERSION);
    expect(data.projects[0]).toMatchObject({
      title: 'Old',
      kind: 'other',
      blueprintId: null,
      partsBin: false,
    });
    expect(data.entries[0]).toMatchObject({
      body: 'hi',
      checklist: null,
      file: null,
      moduleId: null,
    });
    expect(data.parts).toEqual([]);
    expect(data.nodes).toEqual([]);
  });

  it('rejects files that are not Stokebay data', () => {
    expect(migrateStoreData({ version: 9 })).toBeNull();
    expect(migrateStoreData([])).toBeNull();
    expect(migrateStoreData({ version: 1, worlds: [] })).toBeNull();
  });

  it('opens an old data file and saves it in the new format', async () => {
    const dir = await tempDir();
    const v1 = { version: 1, worlds: [], projects: [], pauses: [], entries: [], events: [] };
    await fs.writeFile(path.join(dir, DATA_FILE), JSON.stringify(v1));
    const store = await JsonStore.open(dir);
    const projects = new ProjectService(store, () => NOW);
    await projects.create({ title: 'New', status: 'active', worldIds: [], path: null });
    const saved = JSON.parse(await fs.readFile(path.join(dir, DATA_FILE), 'utf8'));
    expect(saved.version).toBe(STORE_VERSION);
    expect(saved.modules).toEqual([]);
  });
});

describe('LabService.ignite', () => {
  it('creates the project with modules, checklist, idea note and a zone layout', async () => {
    const { lab } = await setup();
    const project = await ignited(lab);
    expect(project).toMatchObject({
      kind: 'hardware',
      blueprintId: 'hardware-build',
      partsBin: true,
      status: 'active',
    });

    const data = lab.lab(project.id);
    expect(data.modules.map((m) => m.title)).toEqual([
      'Design',
      'Mechanics',
      'Electronics',
      'Code',
      'Build log',
    ]);
    const checklist = data.entries.find((e) => e.type === 'checklist')!;
    expect(checklist.checklist?.map((i) => i.text)).toEqual([
      'Sketch the idea',
      'List the parts',
      'Order the parts',
      'Build Mark I',
    ]);
    expect(data.entries.find((e) => e.title === 'The idea')?.body).toBe(
      'A robot arm that sorts Lego',
    );

    const zones = data.nodes.filter((n) => n.refType === 'module');
    expect(zones).toHaveLength(5);
    // Three per row, below the notes.
    expect(zones.map((z) => [z.x, z.y])).toContainEqual([0, ZONE.top + ZONE.height + ZONE.gap]);
    expect(zones.every((z) => z.w === ZONE.width && z.h === ZONE.height)).toBe(true);
  });

  it('records one creation event for the whole Ignite', async () => {
    const { lab, store } = await setup();
    const project = await ignited(lab, 'blank');
    expect(store.listEvents(project.id).map((e) => e.type)).toEqual(['project_created']);
    expect(lab.lab(project.id).nodes).toHaveLength(1); // just the idea note
  });
});

describe('LabService objects', () => {
  it('adds notes, checklists and links at a position, each with an event', async () => {
    const { lab, store } = await setup();
    const p = await ignited(lab, 'blank');
    await lab.addNote(p.id, 'Gripper', 'Use two servos', { x: 10, y: 20 });
    await lab.addChecklist(p.id, 'Buy', ['Screws', 'Bearings'], { x: 0, y: 0 });
    const data = await lab.addLink(p.id, '', 'https://example.com/servo', { x: 5, y: 5 });

    expect(data.entries.find((e) => e.type === 'link')?.title).toBe('example.com');
    const noteNode = data.nodes.find(
      (n) => n.refId === data.entries.find((e) => e.title === 'Gripper')!.id,
    );
    expect(noteNode).toMatchObject({ x: 10, y: 20 });
    expect(
      store
        .listEvents(p.id)
        .map((e) => e.type)
        .slice(0, 3),
    ).toEqual(['link_added', 'checklist_added', 'note_added']);
  });

  it('copies dropped files into media, shows images as images, and deletes the copy on remove', async () => {
    const { lab, media, dir } = await setup();
    const p = await ignited(lab, 'blank');
    const src = await tempDir();
    await fs.writeFile(path.join(src, 'sketch.png'), 'png-bytes');
    await fs.writeFile(path.join(src, 'notes.txt'), 'text');

    const data = await lab.addFiles(
      p.id,
      [path.join(src, 'sketch.png'), path.join(src, 'notes.txt')],
      { x: 0, y: 0 },
    );
    const image = data.entries.find((e) => e.title === 'sketch.png')!;
    expect(image.type).toBe('image');
    expect(data.entries.find((e) => e.title === 'notes.txt')?.type).toBe('file');
    expect(image.file?.storage).toBe('copy');

    const copy = lab.filePath(image.id);
    expect(copy.startsWith(path.join(dir, 'media'))).toBe(true);
    expect(await fs.readFile(copy, 'utf8')).toBe('png-bytes');

    // Original can go away; the Lab keeps its copy.
    await fs.rm(path.join(src, 'sketch.png'));
    expect(await fs.readFile(copy, 'utf8')).toBe('png-bytes');

    const node = data.nodes.find((n) => n.refId === image.id)!;
    await lab.removeNode(node.id);
    await expect(fs.access(copy)).rejects.toThrow();
    expect(media.resolve(data.entries.find((e) => e.title === 'notes.txt')!.file!)).toContain(
      'notes.txt',
    );
  });

  it('links huge files in place instead of copying them', async () => {
    const { media } = await setup();
    const src = path.join(await tempDir(), 'big.mov');
    const handle = await fs.open(src, 'w');
    await handle.truncate(COPY_LIMIT_BYTES + 1); // sparse file: no real disk use
    await handle.close();
    const ref = await media.importFile('p', src);
    expect(ref).toMatchObject({ storage: 'link', path: src, mime: 'video/quicktime' });
  });

  it('refuses media paths that escape the media folder', async () => {
    const { media } = await setup();
    expect(() =>
      media.resolve({ name: 'x', storage: 'copy', path: '../../etc/passwd', mime: '', size: 0 }),
    ).toThrow();
  });

  it('adds parts with a canvas card, turns on the Parts Bin, and logs status changes', async () => {
    const { lab, store } = await setup();
    const p = await ignited(lab, 'software-app');
    expect(p.partsBin).toBe(false);
    let data = await lab.addPart(p.id, part, null);
    expect(data.project.partsBin).toBe(true);
    const added = data.parts[0];
    expect(data.nodes.some((n) => n.refType === 'part' && n.refId === added.id)).toBe(true);

    data = await lab.updatePart(added.id, { status: 'ordered' });
    expect(data.parts[0].status).toBe('ordered');
    expect(store.listEvents(p.id)[0]).toMatchObject({
      type: 'part_status_changed',
      payload: { from: 'needed', to: 'ordered' },
    });
  });

  it('moves nodes, assigns zone membership, and ignores unknown zones', async () => {
    const { lab } = await setup();
    const p = await ignited(lab);
    let data = await lab.addNote(p.id, 'n', '', { x: 0, y: 0 });
    const noteEntry = data.entries.find((e) => e.title === 'n')!;
    const noteNode = data.nodes.find((n) => n.refId === noteEntry.id)!;
    const zone = data.modules[0];

    data = await lab.moveNodes(p.id, [{ nodeId: noteNode.id, x: 50, y: 300, moduleId: zone.id }]);
    expect(data.nodes.find((n) => n.id === noteNode.id)).toMatchObject({ x: 50, y: 300 });
    expect(data.entries.find((e) => e.id === noteEntry.id)?.moduleId).toBe(zone.id);

    data = await lab.moveNodes(p.id, [{ nodeId: noteNode.id, x: 0, y: 0, moduleId: 'not-a-zone' }]);
    expect(data.entries.find((e) => e.id === noteEntry.id)?.moduleId).toBeNull();
  });

  it('connects objects once, never to themselves, and drops lines with their objects', async () => {
    const { lab } = await setup();
    const p = await ignited(lab);
    let data = lab.lab(p.id);
    const [a, b] = data.nodes;
    await expect(lab.connect(p.id, a.id, a.id)).rejects.toBeInstanceOf(UserError);
    await lab.connect(p.id, a.id, b.id);
    data = await lab.connect(p.id, b.id, a.id);
    expect(data.edges).toHaveLength(1);
    data = await lab.removeNode(a.id);
    expect(data.edges).toHaveLength(0);
  });

  it('removing a zone keeps the objects that were in it', async () => {
    const { lab } = await setup();
    const p = await ignited(lab);
    let data = await lab.addNote(p.id, 'inside', '', { x: 0, y: 300 });
    const entry = data.entries.find((e) => e.title === 'inside')!;
    const zone = data.modules[0];
    await lab.moveNodes(p.id, [
      { nodeId: data.nodes.find((n) => n.refId === entry.id)!.id, x: 0, y: 300, moduleId: zone.id },
    ]);
    data = await lab.removeNode(lab.lab(p.id).nodes.find((n) => n.refId === zone.id)!.id);
    expect(data.entries.find((e) => e.id === entry.id)?.moduleId).toBeNull();
    expect(data.modules.some((m) => m.id === zone.id)).toBe(false);
  });

  it('refuses changes to archived projects', async () => {
    const { lab, projects } = await setup();
    const p = await ignited(lab, 'blank');
    await projects.archive(p.id);
    await expect(lab.addNote(p.id, '', 'x', { x: 0, y: 0 })).rejects.toBeInstanceOf(UserError);
  });
});
