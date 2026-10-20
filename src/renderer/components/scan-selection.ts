// Pure helpers for the scan dialog's checklist, kept out of the component so they can be
// unit-tested without a DOM.
import type { ScanCandidate } from '../../shared/types';

/** Returns a new set with `key` added or removed; sets are treated as immutable React state. */
export function toggle<T>(selected: ReadonlySet<T>, key: T): Set<T> {
  const next = new Set(selected);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

export function selectAll(candidates: readonly ScanCandidate[]): Set<string> {
  return new Set(candidates.map((c) => c.path));
}

export function selectNone(): Set<string> {
  return new Set();
}

/**
 * Selected paths in the order the scanner listed them. Filtering through `candidates` also
 * drops any stale paths from a previous scan, since main rejects paths it didn't just find.
 */
export function selectedPaths(
  candidates: readonly ScanCandidate[],
  selected: ReadonlySet<string>,
): string[] {
  return candidates.filter((c) => selected.has(c.path)).map((c) => c.path);
}

/**
 * Path of a candidate relative to the scanned root, for display only. Handles both `/` and
 * `\` because the renderer can't ask Node's `path` module which OS it is on.
 */
export function relativePath(root: string, path: string): string {
  const trimmedRoot = root.replace(/[\\/]+$/, '');
  if (path === trimmedRoot || path === root) return '.';
  const sep = path.charAt(trimmedRoot.length);
  if (path.startsWith(trimmedRoot) && (sep === '/' || sep === '\\')) {
    return path.slice(trimmedRoot.length + 1);
  }
  return path;
}

export function importLabel(count: number): string {
  return `Import ${count} ${count === 1 ? 'project' : 'projects'}`;
}
