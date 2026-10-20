// Business rules for projects. Every user action is one repository transaction: the change
// plus its activity event, saved together.
import type { ProjectPatch } from '../../shared/schemas';
import type {
  AppSettings,
  BootstrapData,
  EpochMs,
  GitInfo,
  GitWorkState,
  Id,
  Project,
  ProjectDetail,
  ProjectSummary,
  SearchHit,
  AreaActivity,
  ScanCandidate,
  SettableStatus,
  World,
} from '../../shared/types';
import { DAY as DAY_MS } from '../../shared/time';
import { newId } from '../store/ids';
import type { ProjectChanges, ProjectRepository } from '../store/repository';
import { createSampleData, WORLD_PALETTE } from '../store/sample-data';
import { recordEvent } from './activity';

/** An error whose message is safe and useful to show the user as-is. */
export class UserError extends Error {}

export class ProjectService {
  constructor(
    private readonly repo: ProjectRepository,
    private readonly clock: () => number = Date.now,
  ) {}

  bootstrap(): BootstrapData {
    return {
      worlds: this.repo.listWorlds(),
      projects: this.summaries(),
      settings: this.repo.getSettings(),
    };
  }

  async updateSettings(changes: Partial<AppSettings>): Promise<AppSettings> {
    return this.repo.transaction((tx) => tx.updateSettings(changes));
  }

  /**
   * Ends first-run setup: creates the chosen worlds and, if asked, adds the example projects.
   * Examples land in the user's matching worlds (by name) instead of duplicating them.
   */
  async finishOnboarding(worldNames: string[], addSamples: boolean): Promise<BootstrapData> {
    const byName = new Map(this.repo.listWorlds().map((w) => [w.name.toLowerCase(), w.id]));
    const sample = addSamples ? createSampleData(this.clock(), newId) : null;

    await this.repo.transaction((tx) => {
      let created = byName.size;
      for (const raw of worldNames) {
        const name = raw.trim();
        if (!name || byName.has(name.toLowerCase())) continue;
        const color = WORLD_PALETTE[created++ % WORLD_PALETTE.length];
        byName.set(name.toLowerCase(), tx.createWorld({ name, color }).id);
      }

      if (sample) {
        const remap = new Map<Id, Id>();
        const newWorlds = sample.worlds.filter((w) => {
          const existing = byName.get(w.name.toLowerCase());
          remap.set(w.id, existing ?? w.id);
          if (existing) return false;
          byName.set(w.name.toLowerCase(), w.id);
          return true;
        });
        tx.importData({
          worlds: newWorlds.map((w, i) => ({ ...w, sortOrder: created + i })),
          projects: sample.projects.map((p) => ({
            ...p,
            worldIds: p.worldIds.map((id) => remap.get(id) ?? id),
          })),
          pauses: sample.pauses,
          entries: sample.entries,
          events: sample.events,
        });
      }
      tx.updateSettings({ onboarded: true });
    });
    return this.bootstrap();
  }

  summaries(): ProjectSummary[] {
    return this.repo.listProjects().map((p) => this.toSummary(p));
  }

  summary(id: Id): ProjectSummary {
    return this.toSummary(this.require(id));
  }

  /** The last week of activity across an area's projects (archived ones left out). */
  areaActivity(worldId: Id, days = 7, limit = 12): AreaActivity {
    const ids = this.repo
      .listProjects()
      .filter((p) => p.archivedAt === null && p.worldIds.includes(worldId))
      .map((p) => p.id);
    const events = this.repo.listRecentEvents(ids, this.clock() - days * DAY_MS, limit);
    const entries = events.flatMap((e) => {
      const entryId = e.payload.entryId;
      const entry = typeof entryId === 'string' ? this.repo.getEntry(entryId) : undefined;
      return entry ? [entry] : [];
    });
    return { events, entries };
  }

  search(query: string): SearchHit[] {
    return this.repo.search(query);
  }

  detail(id: Id): ProjectDetail {
    const project = this.require(id);
    return {
      project: this.toSummary(project),
      entries: this.repo.listEntries(id),
      events: this.repo.listEvents(id),
    };
  }

  /** Projects with a folder, for Git refresh and launching. */
  projectsWithFolders(): { id: Id; path: string; git: GitInfo | null }[] {
    return this.repo
      .listProjects()
      .filter((p): p is Project & { path: string } => p.path !== null && p.archivedAt === null)
      .map((p) => ({ id: p.id, path: p.path, git: p.git }));
  }

  async create(input: {
    title: string;
    status: SettableStatus;
    worldIds: Id[];
    path: string | null;
  }): Promise<ProjectSummary> {
    const now = this.clock();
    const project = await this.repo.transaction((tx) => {
      const p = tx.createProject({
        title: input.title,
        status: input.status,
        worldIds: this.knownWorlds(input.worldIds),
        path: input.path,
        createdAt: now,
      });
      recordEvent(tx, 'project_created', p.id, now, { source: 'manual' });
      return p;
    });
    return this.toSummary(project);
  }

  async update(id: Id, patch: ProjectPatch): Promise<ProjectSummary> {
    const current = this.require(id);
    if (patch.status !== undefined && current.status === 'paused') {
      throw new UserError('This project is paused. Resume it first, then change its status.');
    }
    const changes: ProjectChanges = {};
    if (patch.title !== undefined && patch.title !== current.title) changes.title = patch.title;
    if (patch.status !== undefined && patch.status !== current.status)
      changes.status = patch.status;
    if (patch.path !== undefined && patch.path !== current.path) changes.path = patch.path;
    if (patch.worldIds !== undefined) {
      const worldIds = this.knownWorlds(patch.worldIds);
      if (!sameSet(worldIds, current.worldIds)) changes.worldIds = worldIds;
    }
    const fields = Object.keys(changes);
    if (fields.length === 0) return this.toSummary(current);

    const now = this.clock();
    const project = await this.repo.transaction((tx) => {
      const p = tx.updateProject(id, changes, now);
      // A new or removed folder invalidates the cached Git info.
      if (changes.path !== undefined) tx.setGitInfo(id, null);
      recordEvent(tx, 'project_updated', id, now, { fields });
      return p;
    });
    return this.toSummary(project);
  }

  async archive(id: Id): Promise<ProjectSummary> {
    if (this.require(id).archivedAt !== null)
      throw new UserError('This project is already archived.');
    const now = this.clock();
    const project = await this.repo.transaction((tx) => {
      const p = tx.archiveProject(id, now);
      recordEvent(tx, 'project_archived', id, now);
      return p;
    });
    return this.toSummary(project);
  }

  async restore(id: Id): Promise<ProjectSummary> {
    if (this.require(id).archivedAt === null) throw new UserError('This project is not archived.');
    const now = this.clock();
    const project = await this.repo.transaction((tx) => {
      const p = tx.restoreProject(id, now);
      recordEvent(tx, 'project_restored', id, now);
      return p;
    });
    return this.toSummary(project);
  }

  /** Only archived projects can be deleted, so a delete is always a deliberate second step. */
  async deletePermanently(id: Id): Promise<void> {
    if (this.require(id).archivedAt === null) {
      throw new UserError(
        'Archive the project first; permanent delete lives in the Archived list.',
      );
    }
    await this.repo.transaction((tx) => tx.deleteProject(id));
  }

  async removeSamples(): Promise<ProjectSummary[]> {
    const samples = this.repo.listProjects().filter((p) => p.isSample);
    if (samples.length > 0) {
      await this.repo.transaction((tx) => samples.forEach((p) => tx.deleteProject(p.id)));
    }
    return this.summaries();
  }

  async pause(
    id: Id,
    whereIStopped: string,
    nextStep: string,
    options: { gitContext?: GitWorkState | null; remindAt?: EpochMs | null } = {},
  ): Promise<ProjectSummary> {
    const current = this.require(id);
    if (current.archivedAt !== null) throw new UserError('Restore this project before pausing it.');
    if (current.status !== 'active') throw new UserError('Only active projects can be paused.');
    const now = this.clock();
    const project = await this.repo.transaction((tx) => {
      const pause = tx.addPause({
        projectId: id,
        pausedAt: now,
        whereIStopped,
        nextStep,
        gitContext: options.gitContext ?? null,
        remindAt: options.remindAt ?? null,
      });
      const p = tx.updateProject(id, { status: 'paused' }, now);
      recordEvent(tx, 'project_paused', id, now, { pauseId: pause.id });
      return p;
    });
    return this.toSummary(project);
  }

  async resume(id: Id): Promise<ProjectSummary> {
    const current = this.require(id);
    if (current.status !== 'paused') throw new UserError('This project is not paused.');
    const open = this.repo.activePause(id);
    const now = this.clock();
    const project = await this.repo.transaction((tx) => {
      if (open) tx.closePause(open.id, now);
      const p = tx.updateProject(id, { status: 'active' }, now);
      recordEvent(tx, 'project_resumed', id, now, { pauseId: open?.id ?? null });
      return p;
    });
    return this.toSummary(project);
  }

  /** `source` marks notes that came from somewhere other than the project panel (quick capture). */
  async addNote(
    projectId: Id,
    title: string,
    body: string,
    source?: 'capture',
  ): Promise<ProjectDetail> {
    this.requireEditable(projectId);
    const now = this.clock();
    await this.repo.transaction((tx) => {
      const entry = tx.addEntry({
        projectId,
        type: 'note',
        title,
        body,
        url: null,
        createdAt: now,
      });
      recordEvent(tx, 'note_added', projectId, now, {
        entryId: entry.id,
        ...(source ? { source } : {}),
      });
    });
    return this.detail(projectId);
  }

  async addLink(projectId: Id, title: string, url: string): Promise<ProjectDetail> {
    this.requireEditable(projectId);
    const now = this.clock();
    await this.repo.transaction((tx) => {
      const entry = tx.addEntry({
        projectId,
        type: 'link',
        title: title || new URL(url).hostname,
        body: '',
        url,
        createdAt: now,
      });
      recordEvent(tx, 'link_added', projectId, now, { entryId: entry.id });
    });
    return this.detail(projectId);
  }

  linkUrl(entryId: Id): string {
    const entry = this.repo.getEntry(entryId);
    if (!entry || entry.type !== 'link' || !entry.url)
      throw new UserError('That link no longer exists.');
    return entry.url;
  }

  async createWorld(name: string): Promise<World> {
    const existing = this.repo.listWorlds();
    if (existing.some((w) => w.name.toLowerCase() === name.toLowerCase())) {
      throw new UserError(`There's already an area called "${name}".`);
    }
    const color = WORLD_PALETTE[existing.length % WORLD_PALETTE.length];
    return this.repo.transaction((tx) => tx.createWorld({ name, color }));
  }

  async updateWorld(id: Id, changes: { name?: string; color?: string }): Promise<World> {
    const worlds = this.repo.listWorlds();
    if (!worlds.some((w) => w.id === id)) throw new UserError('That area no longer exists.');
    const name = changes.name?.trim();
    if (name && worlds.some((w) => w.id !== id && w.name.toLowerCase() === name.toLowerCase())) {
      throw new UserError(`There's already an area called "${name}".`);
    }
    return this.repo.transaction((tx) =>
      tx.updateWorld(id, {
        ...(name ? { name } : {}),
        ...(changes.color ? { color: changes.color } : {}),
      }),
    );
  }

  /** Removes the world; its projects stay and simply lose the tag. */
  async deleteWorld(id: Id): Promise<BootstrapData> {
    if (!this.repo.listWorlds().some((w) => w.id === id)) {
      throw new UserError('That area no longer exists.');
    }
    await this.repo.transaction((tx) => tx.deleteWorld(id));
    return this.bootstrap();
  }

  folderOf(id: Id): string {
    const path = this.require(id).path;
    if (!path) throw new UserError('This project has no folder. Add one with Edit.');
    return path;
  }

  /**
   * Weekly review "keep going": the event counts as activity, so the project stops looking
   * cold and isn't asked about again until it has been quiet for a while.
   */
  async reviewKeep(id: Id): Promise<ProjectSummary> {
    const project = this.requireEditable(id);
    const now = this.clock();
    await this.repo.transaction((tx) => {
      recordEvent(tx, 'project_reviewed', id, now, {
        choice: 'keep',
        paused: project.status === 'paused',
      });
    });
    return this.summary(id);
  }

  /** Marks the weekly review as finished; it's offered again a week later. */
  async finishReview(): Promise<AppSettings> {
    return this.updateSettings({ lastReviewAt: this.clock() });
  }

  async recordOpenedInEditor(id: Id): Promise<void> {
    const now = this.clock();
    await this.repo.transaction((tx) => recordEvent(tx, 'opened_in_editor', id, now));
  }

  /** Imports scanned folders as active projects, all in one save. */
  async importScanned(candidates: ScanCandidate[], worldIds: Id[]): Promise<ProjectSummary[]> {
    const taken = new Set(this.repo.listProjects().map((p) => p.path));
    const fresh = candidates.filter((c) => !taken.has(c.path));
    if (fresh.length === 0) return [];
    const now = this.clock();
    const worlds = this.knownWorlds(worldIds);
    const created = await this.repo.transaction((tx) =>
      fresh.map((c) => {
        const p = tx.createProject({
          title: c.name,
          status: 'active',
          worldIds: worlds,
          path: c.path,
          createdAt: now,
        });
        recordEvent(tx, 'project_created', p.id, now, { source: 'scan' });
        return p;
      }),
    );
    return created.map((p) => this.toSummary(p));
  }

  /**
   * Stores refreshed Git info; returns true if anything changed. A last commit that moved
   * forward is recorded as `commit_detected` with `newCommits`' count (at least 1). The first
   * read of a repo (nothing cached yet) and a move backwards (branch switch) record nothing.
   */
  async saveGitInfo(
    updates: Map<Id, GitInfo | null>,
    newCommits: ReadonlyMap<Id, number> = new Map(),
  ): Promise<boolean> {
    const changed = [...updates].flatMap(([id, git]) => {
      const project = this.repo.getProject(id);
      return project !== undefined && !sameGit(project.git, git)
        ? [{ id, git, before: project.git?.lastCommitAt ?? null }]
        : [];
    });
    if (changed.length === 0) return false;
    const now = this.clock();
    await this.repo.transaction((tx) =>
      changed.forEach(({ id, git, before }) => {
        tx.setGitInfo(id, git);
        const at = git?.lastCommitAt ?? null;
        if (before === null || at === null || at <= before || git?.error) return;
        const count = Math.max(1, Math.floor(newCommits.get(id) ?? 1));
        // Dated by the commit so the timeline reads in order; a clock running ahead can't
        // put it in the future.
        recordEvent(tx, 'commit_detected', id, Math.min(at, now), { count });
      }),
    );
    return true;
  }

  /**
   * Pauses active projects nobody has touched for `autoPauseDays` (0 = off), so the grid shows
   * what's really in progress. Sample projects are left alone: they exist to show each state.
   * Returns the ids it paused.
   */
  async autoPause(): Promise<Id[]> {
    const days = this.repo.getSettings().autoPauseDays;
    if (!(days > 0)) return [];
    const now = this.clock();
    const cutoff = now - days * DAY_MS;
    const cold = this.repo
      .listProjects()
      .filter(
        (p) =>
          p.archivedAt === null &&
          p.status === 'active' &&
          !p.isSample &&
          this.toSummary(p).lastActivityAt < cutoff,
      );
    if (cold.length === 0) return [];
    await this.repo.transaction((tx) =>
      cold.forEach((p) => {
        const pause = tx.addPause({
          projectId: p.id,
          pausedAt: now,
          whereIStopped: autoPauseNote(days, p.git),
          nextStep: '',
          gitContext: null,
        });
        tx.updateProject(p.id, { status: 'paused' }, now);
        recordEvent(tx, 'project_paused', p.id, now, { pauseId: pause.id, auto: true, days });
      }),
    );
    return cold.map((p) => p.id);
  }

  private toSummary(project: Project): ProjectSummary {
    return {
      ...project,
      worldIds: [...project.worldIds],
      lastActivityAt: Math.max(project.lastEventAt, project.git?.lastCommitAt ?? 0),
      activePause: project.status === 'paused' ? (this.repo.activePause(project.id) ?? null) : null,
    };
  }

  private require(id: Id): Project {
    const project = this.repo.getProject(id);
    if (!project) throw new UserError('That project no longer exists.');
    return project;
  }

  private requireEditable(id: Id): Project {
    const project = this.require(id);
    if (project.archivedAt !== null) throw new UserError('Restore this project to change it.');
    return project;
  }

  private knownWorlds(ids: Id[]): Id[] {
    const known = new Set(this.repo.listWorlds().map((w) => w.id));
    return [...new Set(ids)].filter((id) => known.has(id));
  }
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

/** The "where I stopped" text of an automatic pause: why, plus what Git last showed. */
function autoPauseNote(days: number, git: GitInfo | null): string {
  const why = `Paused automatically after ${days} days without activity.`;
  if (!git?.lastCommitMsg) return why;
  const msg = git.lastCommitMsg;
  const subject = msg.length > 200 ? `${msg.slice(0, 199)}…` : msg;
  const onBranch = git.branch && !git.branch.startsWith('detached') ? ` on ${git.branch}` : '';
  return `${why} Last commit${onBranch}: ${subject}`;
}

/** Equal apart from refresh time, so an unchanged repo doesn't cost a save. */
function sameGit(a: GitInfo | null, b: GitInfo | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.branch === b.branch &&
    a.lastCommitAt === b.lastCommitAt &&
    a.lastCommitMsg === b.lastCommitMsg &&
    a.error === b.error
  );
}
