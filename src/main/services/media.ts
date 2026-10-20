// Files a user adds to a Lab. Small files are copied into the app's media folder so they
// survive the original being moved or deleted; huge ones (videos, CAD) are linked in place.
import fs from 'node:fs/promises';
import path from 'node:path';
import type { FileRef, Id } from '../../shared/types';

export const COPY_LIMIT_BYTES = 200 * 1024 * 1024;

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  heic: 'image/heic',
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  zip: 'application/zip',
  stl: 'model/stl',
  obj: 'model/obj',
  step: 'model/step',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
};

export function mimeFor(name: string): string {
  return MIME[path.extname(name).slice(1).toLowerCase()] ?? 'application/octet-stream';
}

/** Images Chromium can draw on the canvas (HEIC can't be shown, so it stays a file card). */
export function isDisplayableImage(mime: string): boolean {
  return mime.startsWith('image/') && mime !== 'image/heic';
}

function safeName(name: string): string {
  const cleaned = path
    .basename(name)
    .replace(/[^\w.\- ]+/g, '_')
    .trim();
  return (cleaned || 'file').slice(0, 100);
}

export class MediaStore {
  constructor(readonly dir: string) {}

  /** Copies (or links, if over the limit) a file from disk into a project's media. */
  async importFile(projectId: Id, source: string): Promise<FileRef> {
    const stat = await fs.stat(source);
    if (!stat.isFile()) throw new Error('Only files can be added, not folders.');
    const name = path.basename(source);
    const mime = mimeFor(name);
    if (stat.size > COPY_LIMIT_BYTES) {
      return { name, storage: 'link', path: path.resolve(source), mime, size: stat.size };
    }
    const relative = await this.reserve(projectId, name);
    await fs.copyFile(source, path.join(this.dir, relative));
    return { name, storage: 'copy', path: relative, mime, size: stat.size };
  }

  /** Stores bytes that have no file on disk yet (a pasted screenshot). */
  async importBytes(projectId: Id, name: string, bytes: Uint8Array): Promise<FileRef> {
    const relative = await this.reserve(projectId, name);
    await fs.writeFile(path.join(this.dir, relative), bytes);
    return { name, storage: 'copy', path: relative, mime: mimeFor(name), size: bytes.byteLength };
  }

  /** Absolute path of a stored file. Copied paths can't escape the media folder. */
  resolve(ref: FileRef): string {
    if (ref.storage === 'link') return ref.path;
    const full = path.resolve(this.dir, ref.path);
    if (!full.startsWith(path.resolve(this.dir) + path.sep)) {
      throw new Error('File path is outside the media folder');
    }
    return full;
  }

  /** Deletes a copied file; linked files belong to the user and are never touched. */
  async remove(ref: FileRef): Promise<void> {
    if (ref.storage !== 'copy') return;
    await fs.rm(this.resolve(ref), { force: true });
  }

  async removeProject(projectId: Id): Promise<void> {
    await fs.rm(path.join(this.dir, safeName(projectId)), { recursive: true, force: true });
  }

  private async reserve(projectId: Id, name: string): Promise<string> {
    const folder = safeName(projectId);
    await fs.mkdir(path.join(this.dir, folder), { recursive: true });
    // A time + random prefix keeps two files with the same name apart.
    const unique = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    return path.join(folder, `${unique}-${safeName(name)}`);
  }
}
