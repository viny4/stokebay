import { describe, expect, it } from 'vitest';
import {
  importLabel,
  relativePath,
  selectAll,
  selectNone,
  selectedPaths,
  toggle,
} from '../src/renderer/components/scan-selection';
import type { ScanCandidate } from '../src/shared/types';

const candidates: ScanCandidate[] = [
  { path: '/code/alpha', name: 'alpha', hasGit: true },
  { path: '/code/group/beta', name: 'beta', hasGit: false },
  { path: '/code/group/gamma', name: 'gamma', hasGit: true },
];

describe('toggle', () => {
  it('adds a missing key and removes a present one without mutating the input', () => {
    const start = new Set(['a']);
    const added = toggle(start, 'b');
    expect([...added].sort()).toEqual(['a', 'b']);
    expect([...toggle(added, 'a')]).toEqual(['b']);
    expect([...start]).toEqual(['a']);
  });
});

describe('selectAll / selectNone', () => {
  it('selects every candidate path, or none', () => {
    expect([...selectAll(candidates)]).toEqual(candidates.map((c) => c.path));
    expect(selectNone().size).toBe(0);
    expect(selectAll([]).size).toBe(0);
  });
});

describe('selectedPaths', () => {
  it('keeps the scanner order regardless of click order', () => {
    let selected = selectNone();
    selected = toggle(selected, '/code/group/gamma');
    selected = toggle(selected, '/code/alpha');
    expect(selectedPaths(candidates, selected)).toEqual(['/code/alpha', '/code/group/gamma']);
  });

  it('drops paths that are not in the current scan', () => {
    const selected = new Set(['/old/scan/project', '/code/group/beta']);
    expect(selectedPaths(candidates, selected)).toEqual(['/code/group/beta']);
  });
});

describe('relativePath', () => {
  it('strips the root on POSIX paths', () => {
    expect(relativePath('/code', '/code/group/beta')).toBe('group/beta');
    expect(relativePath('/code/', '/code/alpha')).toBe('alpha');
  });

  it('strips the root on Windows paths', () => {
    expect(relativePath('C:\\code', 'C:\\code\\group\\beta')).toBe('group\\beta');
  });

  it('shows "." when the root itself is a project', () => {
    expect(relativePath('/code', '/code')).toBe('.');
    expect(relativePath('/code/', '/code')).toBe('.');
  });

  it('does not strip a root that is only a name prefix', () => {
    expect(relativePath('/code', '/codebase/x')).toBe('/codebase/x');
  });
});

describe('importLabel', () => {
  it('pluralises', () => {
    expect(importLabel(0)).toBe('Import 0 projects');
    expect(importLabel(1)).toBe('Import 1 project');
    expect(importLabel(3)).toBe('Import 3 projects');
  });
});
