// "Pick up": one click from a paused (or simply idle) project back to work. Resumes it, then
// opens what the user works in. Anything that can't be opened is reported, never fatal: the
// project is resumed either way.
import fs from 'node:fs/promises';
import type { AppSettings, Entry, Id, LaunchResult, PickUpResult } from '../../shared/types';
import type { ProjectService } from './projects';
import { UserError } from './projects';

/** At most this many links open at once, so a link-heavy project doesn't flood the browser. */
export const PICK_UP_LINKS = 3;

export interface PickUpDeps {
  service: Pick<ProjectService, 'summary' | 'resume' | 'detail' | 'recordOpenedInEditor'>;
  settings: () => AppSettings;
  openEditor: (dir: string) => Promise<LaunchResult>;
  openTerminal: (dir: string) => Promise<LaunchResult>;
  openUrl: (url: string) => Promise<void>;
  /** True when `dir` is an existing folder. */
  isFolder?: (dir: string) => Promise<boolean>;
}

export async function pickUp(id: Id, deps: PickUpDeps): Promise<PickUpResult> {
  const { service } = deps;
  const project = service.summary(id);
  if (project.archivedAt !== null) throw new UserError('Restore this project to pick it up.');
  if (project.status === 'paused') await service.resume(id);

  const settings = deps.settings();
  const problems: string[] = [];

  // Links first and the editor last, so the editor is most likely the window in front.
  if (settings.pickUpLinks) {
    for (const link of newestLinks(service.detail(id).entries)) {
      try {
        await deps.openUrl(link);
      } catch {
        problems.push("A link couldn't be opened.");
      }
    }
  }

  if (project.path) {
    const isFolder = deps.isFolder ?? folderExists;
    if (!(await isFolder(project.path))) {
      problems.push("The project folder wasn't found. Pick it again with Edit.");
    } else {
      if (settings.pickUpTerminal) {
        const terminal = await deps.openTerminal(project.path);
        if (!terminal.ok) problems.push(terminal.message ?? "Couldn't open a terminal.");
      }
      const editor = await deps.openEditor(project.path);
      if (editor.ok) await service.recordOpenedInEditor(id);
      else problems.push(editor.message ?? "Couldn't open the editor.");
    }
  }

  return { project: service.summary(id), problems };
}

/**
 * The newest web links of a project. Stored links were validated on the way in; the protocol is
 * checked again before anything is handed to the OS.
 */
export function newestLinks(entries: Entry[], limit = PICK_UP_LINKS): string[] {
  const urls: string[] = [];
  const newest = [...entries].sort((a, b) => b.createdAt - a.createdAt);
  for (const entry of newest) {
    if (urls.length >= limit) break;
    if (entry.type !== 'link' || !entry.url) continue;
    try {
      const protocol = new URL(entry.url).protocol;
      if (protocol === 'http:' || protocol === 'https:') urls.push(entry.url);
    } catch {
      // Not a URL at all; skip it.
    }
  }
  return urls;
}

async function folderExists(dir: string): Promise<boolean> {
  try {
    return (await fs.stat(dir)).isDirectory();
  } catch {
    return false;
  }
}
