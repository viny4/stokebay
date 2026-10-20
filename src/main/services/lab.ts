// The Lab: a project's canvas. Every object is an entry, part or module plus a canvas node
// for its position; lines are canvas edges. Each action is one transaction (one save).
import type { IgniteInput, PartFields } from '../../shared/schemas';
import type {
  Blueprint,
  CanvasNode,
  CanvasRefType,
  ChecklistItem,
  EventType,
  FileRef,
  Id,
  LabData,
  Project,
  ProjectSummary,
} from '../../shared/types';
import { newId } from '../store/ids';
import type { EntryChanges, ProjectRepository, RepositoryTx } from '../store/repository';
import { recordEvent } from './activity';
import { isDisplayableImage, type MediaStore } from './media';
import { UserError, type ProjectService } from './projects';

/** Layout Ignite uses for a new Lab: notes on top, module zones in rows below. */
export const ZONE = { width: 380, height: 280, gap: 40, columns: 3, top: 240 };

export interface Position {
  x: number;
  y: number;
}

export interface NodeMove extends Position {
  nodeId: Id;
  w?: number | null;
  h?: number | null;
  /** Zone the object was dropped in; null = outside every zone. */
  moduleId?: Id | null;
}

export class LabService {
  constructor(
    private readonly repo: ProjectRepository,
    private readonly projects: ProjectService,
    private readonly media: MediaStore,
    private readonly clock: () => number = Date.now,
  ) {}

  lab(projectId: Id): LabData {
    return {
      project: this.projects.summary(projectId),
      modules: this.repo.listModules(projectId),
      entries: this.repo.listEntries(projectId),
      parts: this.repo.listParts(projectId),
      nodes: this.repo.listNodes(projectId),
      edges: this.repo.listEdges(projectId),
    };
  }

  /** Creates a project from a blueprint with its modules, checklist and canvas laid out. */
  async ignite(input: IgniteInput, blueprint: Blueprint): Promise<ProjectSummary> {
    const now = this.clock();
    const knownWorlds = new Set(this.repo.listWorlds().map((w) => w.id));
    const project = await this.repo.transaction((tx) => {
      const p = tx.createProject({
        title: input.title,
        status: 'active',
        worldIds: input.worldIds.filter((id) => knownWorlds.has(id)),
        path: input.path,
        kind: blueprint.kind,
        blueprintId: blueprint.id,
        partsBin: input.partsBin,
        createdAt: now,
      });
      recordEvent(tx, 'project_created', p.id, now, {
        source: 'ignite',
        blueprintId: blueprint.id,
      });

      if (input.checklist.length > 0) {
        const checklist = tx.addEntry({
          projectId: p.id,
          type: 'checklist',
          title: 'First steps',
          body: '',
          url: null,
          checklist: input.checklist.map((text) => ({ id: newId(), text, done: false })),
          createdAt: now,
        });
        tx.addNode({
          projectId: p.id,
          refType: 'entry',
          refId: checklist.id,
          x: 0,
          y: 0,
          w: null,
          h: null,
        });
      }
      if (input.idea && input.idea !== input.title) {
        const idea = tx.addEntry({
          projectId: p.id,
          type: 'note',
          title: 'The idea',
          body: input.idea,
          url: null,
          createdAt: now,
        });
        tx.addNode({
          projectId: p.id,
          refType: 'entry',
          refId: idea.id,
          x: 320,
          y: 0,
          w: null,
          h: null,
        });
      }
      input.modules.forEach((title, i) => {
        const module = tx.createModule({ projectId: p.id, title, color: null });
        tx.addNode({
          projectId: p.id,
          refType: 'module',
          refId: module.id,
          x: (i % ZONE.columns) * (ZONE.width + ZONE.gap),
          y: ZONE.top + Math.floor(i / ZONE.columns) * (ZONE.height + ZONE.gap),
          w: ZONE.width,
          h: ZONE.height,
        });
      });
      return p;
    });
    return this.projects.summary(project.id);
  }

  async addNote(projectId: Id, title: string, body: string, at: Position): Promise<LabData> {
    return this.addEntryAt(projectId, at, 'note_added', (tx) =>
      tx.addEntry({ projectId, type: 'note', title, body, url: null, createdAt: this.clock() }),
    );
  }

  async addChecklist(
    projectId: Id,
    title: string,
    items: string[],
    at: Position,
  ): Promise<LabData> {
    const checklist: ChecklistItem[] = items.map((text) => ({ id: newId(), text, done: false }));
    return this.addEntryAt(projectId, at, 'checklist_added', (tx) =>
      tx.addEntry({
        projectId,
        type: 'checklist',
        title,
        body: '',
        url: null,
        checklist,
        createdAt: this.clock(),
      }),
    );
  }

  async addLink(projectId: Id, title: string, url: string, at: Position): Promise<LabData> {
    return this.addEntryAt(projectId, at, 'link_added', (tx) =>
      tx.addEntry({
        projectId,
        type: 'link',
        title: title || new URL(url).hostname,
        body: '',
        url,
        createdAt: this.clock(),
      }),
    );
  }

  /** Adds files from disk, fanned out a little so a multi-file drop doesn't stack exactly. */
  async addFiles(projectId: Id, paths: string[], at: Position): Promise<LabData> {
    this.requireEditable(projectId);
    const refs: FileRef[] = [];
    try {
      for (const source of paths) refs.push(await this.media.importFile(projectId, source));
    } catch (err) {
      await Promise.all(refs.map((ref) => this.media.remove(ref)));
      throw new UserError(
        err instanceof Error ? `Couldn't add that file: ${err.message}` : "Couldn't add that file.",
      );
    }
    await this.saveFiles(projectId, refs, at);
    return this.lab(projectId);
  }

  async addImageData(
    projectId: Id,
    name: string,
    bytes: Uint8Array,
    at: Position,
  ): Promise<LabData> {
    this.requireEditable(projectId);
    const ref = await this.media.importBytes(projectId, name, bytes);
    await this.saveFiles(projectId, [ref], at);
    return this.lab(projectId);
  }

  async addPart(projectId: Id, fields: PartFields, at: Position | null): Promise<LabData> {
    this.requireEditable(projectId);
    const now = this.clock();
    const spot = at ?? this.freeSpot(projectId);
    await this.repo.transaction((tx) => {
      const part = tx.addPart({
        projectId,
        moduleId: null,
        ...fields,
        createdAt: now,
        updatedAt: now,
      });
      tx.addNode({
        projectId,
        refType: 'part',
        refId: part.id,
        x: spot.x,
        y: spot.y,
        w: null,
        h: null,
      });
      // Adding a part is a sign the project is physical: show its Parts Bin from now on.
      tx.updateProject(projectId, { partsBin: true }, now);
      recordEvent(tx, 'part_added', projectId, now, { partId: part.id });
    });
    return this.lab(projectId);
  }

  async updatePart(partId: Id, patch: Partial<PartFields>): Promise<LabData> {
    const part = this.repo.getPart(partId);
    if (!part) throw new UserError('That part no longer exists.');
    this.requireEditable(part.projectId);
    const now = this.clock();
    // The store returns the live object, which updatePart mutates; read the old status first.
    const before = part.status;
    await this.repo.transaction((tx) => {
      tx.updatePart(partId, patch, now);
      if (patch.status !== undefined && patch.status !== before) {
        recordEvent(tx, 'part_status_changed', part.projectId, now, {
          partId,
          from: before,
          to: patch.status,
        });
      }
    });
    return this.lab(part.projectId);
  }

  async addZone(
    projectId: Id,
    title: string,
    at: Position & { w: number; h: number },
  ): Promise<LabData> {
    this.requireEditable(projectId);
    const now = this.clock();
    await this.repo.transaction((tx) => {
      const module = tx.createModule({ projectId, title, color: null });
      tx.addNode({
        projectId,
        refType: 'module',
        refId: module.id,
        x: at.x,
        y: at.y,
        w: at.w,
        h: at.h,
      });
      recordEvent(tx, 'zone_added', projectId, now, { moduleId: module.id });
    });
    return this.lab(projectId);
  }

  async renameZone(moduleId: Id, title: string): Promise<LabData> {
    const module = this.repo.getModule(moduleId);
    if (!module) throw new UserError('That zone no longer exists.');
    this.requireEditable(module.projectId);
    await this.repo.transaction((tx) => tx.updateModule(moduleId, { title }));
    return this.lab(module.projectId);
  }

  async updateItem(entryId: Id, patch: EntryChanges): Promise<LabData> {
    const entry = this.repo.getEntry(entryId);
    if (!entry) throw new UserError('That item no longer exists.');
    this.requireEditable(entry.projectId);
    await this.repo.transaction((tx) => tx.updateEntry(entryId, patch));
    return this.lab(entry.projectId);
  }

  /** Saves positions after a drag (no timeline event: rearranging isn't activity). */
  async moveNodes(projectId: Id, moves: NodeMove[]): Promise<LabData> {
    this.requireEditable(projectId);
    const zones = new Set(this.repo.listModules(projectId).map((m) => m.id));
    await this.repo.transaction((tx) => {
      for (const move of moves) {
        const node = this.requireNode(move.nodeId, projectId);
        const changes: Partial<CanvasNode> = { x: move.x, y: move.y };
        if (move.w !== undefined) changes.w = move.w;
        if (move.h !== undefined) changes.h = move.h;
        tx.updateNode(node.id, changes);
        if (move.moduleId !== undefined && node.refType !== 'module') {
          const moduleId =
            move.moduleId !== null && zones.has(move.moduleId) ? move.moduleId : null;
          if (node.refType === 'entry') tx.updateEntry(node.refId, { moduleId });
          else tx.updatePart(node.refId, { moduleId }, this.clock());
        }
      }
    });
    return this.lab(projectId);
  }

  async connect(projectId: Id, fromNodeId: Id, toNodeId: Id): Promise<LabData> {
    this.requireEditable(projectId);
    if (fromNodeId === toNodeId) throw new UserError('A line needs two different objects.');
    this.requireNode(fromNodeId, projectId);
    this.requireNode(toNodeId, projectId);
    const exists = this.repo
      .listEdges(projectId)
      .some(
        (e) =>
          (e.fromNodeId === fromNodeId && e.toNodeId === toNodeId) ||
          (e.fromNodeId === toNodeId && e.toNodeId === fromNodeId),
      );
    if (!exists)
      await this.repo.transaction((tx) => tx.addEdge({ projectId, fromNodeId, toNodeId }));
    return this.lab(projectId);
  }

  async disconnect(edgeId: Id): Promise<LabData | null> {
    const project = this.repo
      .listProjects()
      .find((p) => this.repo.listEdges(p.id).some((e) => e.id === edgeId));
    if (!project) return null;
    this.requireEditable(project.id);
    await this.repo.transaction((tx) => tx.deleteEdge(edgeId));
    return this.lab(project.id);
  }

  /** Removes the object and what it holds (a copied file is deleted too). */
  async removeNode(nodeId: Id): Promise<LabData> {
    const node = this.repo.getNode(nodeId);
    if (!node) throw new UserError('That object no longer exists.');
    this.requireEditable(node.projectId);
    const file = node.refType === 'entry' ? (this.repo.getEntry(node.refId)?.file ?? null) : null;
    const now = this.clock();
    await this.repo.transaction((tx) => {
      tx.deleteNode(node.id);
      this.deleteRef(tx, node.refType, node.refId);
      recordEvent(tx, 'lab_item_removed', node.projectId, now, { refType: node.refType });
    });
    if (file) await this.media.remove(file);
    return this.lab(node.projectId);
  }

  async setPartsBin(projectId: Id, on: boolean): Promise<LabData> {
    this.requireEditable(projectId);
    await this.repo.transaction((tx) =>
      tx.updateProject(projectId, { partsBin: on }, this.clock()),
    );
    return this.lab(projectId);
  }

  /** Absolute path of an entry's file, for opening it or showing it on the canvas. */
  filePath(entryId: Id): string {
    const file = this.repo.getEntry(entryId)?.file;
    if (!file) throw new UserError('That file no longer exists.');
    return this.media.resolve(file);
  }

  private async addEntryAt(
    projectId: Id,
    at: Position,
    event: EventType,
    create: (tx: RepositoryTx) => { id: Id },
  ): Promise<LabData> {
    this.requireEditable(projectId);
    const now = this.clock();
    await this.repo.transaction((tx) => {
      const entry = create(tx);
      tx.addNode({
        projectId,
        refType: 'entry',
        refId: entry.id,
        x: at.x,
        y: at.y,
        w: null,
        h: null,
      });
      recordEvent(tx, event, projectId, now, { entryId: entry.id });
    });
    return this.lab(projectId);
  }

  private async saveFiles(projectId: Id, refs: FileRef[], at: Position): Promise<void> {
    const now = this.clock();
    await this.repo.transaction((tx) => {
      refs.forEach((ref, i) => {
        const entry = tx.addEntry({
          projectId,
          type: isDisplayableImage(ref.mime) ? 'image' : 'file',
          title: ref.name,
          body: '',
          url: null,
          file: ref,
          createdAt: now,
        });
        tx.addNode({
          projectId,
          refType: 'entry',
          refId: entry.id,
          x: at.x + i * 24,
          y: at.y + i * 24,
          w: null,
          h: null,
        });
        recordEvent(tx, 'file_attached', projectId, now, { entryId: entry.id });
      });
    });
  }

  private deleteRef(tx: RepositoryTx, refType: CanvasRefType, refId: Id): void {
    if (refType === 'entry') tx.deleteEntry(refId);
    else if (refType === 'part') tx.deletePart(refId);
    else tx.deleteModule(refId);
  }

  /** Below everything currently on the canvas, so a new part never lands on top of something. */
  private freeSpot(projectId: Id): Position {
    const nodes = this.repo.listNodes(projectId);
    const bottom = nodes.reduce((max, n) => Math.max(max, n.y + (n.h ?? 160)), -40);
    return { x: 0, y: bottom + 40 };
  }

  private requireNode(nodeId: Id, projectId: Id): CanvasNode {
    const node = this.repo.getNode(nodeId);
    if (!node || node.projectId !== projectId) throw new UserError('That object no longer exists.');
    return node;
  }

  private requireEditable(projectId: Id): Project {
    const project = this.repo.getProject(projectId);
    if (!project) throw new UserError('That project no longer exists.');
    if (project.archivedAt !== null) throw new UserError('Restore this project to change it.');
    return project;
  }
}
