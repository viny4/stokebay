import { describe, expect, it } from 'vitest';
import {
  firstFieldErrors,
  initialValues,
  isEmptyPatch,
  toCreateInput,
  toggleId,
  toUpdateInput,
} from '../src/renderer/components/project-form';
import type { ProjectSummary } from '../src/shared/types';

const NOW = Date.UTC(2026, 9, 19, 12);

function project(over: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    id: 'p1',
    title: 'Rate limiter',
    path: '/code/rate-limiter',
    status: 'active',
    color: null,
    kind: 'other',
    blueprintId: null,
    partsBin: false,
    isWork: false,
    isSample: false,
    worldIds: ['w1', 'w2'],
    createdAt: NOW,
    updatedAt: NOW,
    lastEventAt: NOW,
    archivedAt: null,
    git: null,
    lastActivityAt: NOW,
    activePause: null,
    ...over,
  };
}

describe('initialValues', () => {
  it('defaults a new project to active with no worlds or folder', () => {
    expect(initialValues(null)).toEqual({ title: '', status: 'active', worldIds: [], path: null });
  });

  it('copies an existing project without sharing its worldIds array', () => {
    const p = project();
    const values = initialValues(p);
    expect(values).toEqual({
      title: 'Rate limiter',
      status: 'active',
      worldIds: ['w1', 'w2'],
      path: '/code/rate-limiter',
    });
    values.worldIds.push('w3');
    expect(p.worldIds).toEqual(['w1', 'w2']);
  });
});

describe('toCreateInput', () => {
  it('trims the title and accepts a null folder', () => {
    const result = toCreateInput({ title: '  Garden  ', status: 'idea', worldIds: [], path: null });
    expect(result).toEqual({
      ok: true,
      value: { title: 'Garden', status: 'idea', worldIds: [], path: null },
    });
  });

  it('reports the schema message for an empty title', () => {
    const result = toCreateInput({ title: '   ', status: 'active', worldIds: [], path: null });
    expect(result).toEqual({ ok: false, errors: { title: 'Give the project a title.' } });
  });

  it('rejects a relative folder and the paused status', () => {
    const result = toCreateInput({ title: 'X', status: 'paused', worldIds: [], path: 'code/x' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.path).toBe('Pick a folder with the folder picker.');
    expect(result.errors.status).toBeDefined();
  });
});

describe('toUpdateInput', () => {
  it('sends an empty patch when nothing changed, ignoring world order', () => {
    const p = project();
    const result = toUpdateInput(p, { ...initialValues(p), worldIds: ['w2', 'w1'] });
    expect(result.ok && isEmptyPatch(result.value.patch)).toBe(true);
  });

  it('sends only the changed fields', () => {
    const p = project();
    const result = toUpdateInput(p, { ...initialValues(p), title: ' Limiter v2 ', path: null });
    expect(result).toEqual({
      ok: true,
      value: { id: 'p1', patch: { title: 'Limiter v2', path: null } },
    });
  });

  it('includes status and worlds when they change', () => {
    const p = project();
    const result = toUpdateInput(p, { ...initialValues(p), status: 'done', worldIds: ['w1'] });
    expect(result).toEqual({
      ok: true,
      value: { id: 'p1', patch: { status: 'done', worldIds: ['w1'] } },
    });
  });

  it('never sends status for a paused project', () => {
    const p = project({ status: 'paused' });
    const result = toUpdateInput(p, { ...initialValues(p), status: 'active', title: 'New' });
    expect(result).toEqual({ ok: true, value: { id: 'p1', patch: { title: 'New' } } });
  });

  it('maps nested patch errors back to the form field', () => {
    const p = project();
    const result = toUpdateInput(p, { ...initialValues(p), title: '' });
    expect(result).toEqual({ ok: false, errors: { title: 'Give the project a title.' } });
  });
});

describe('firstFieldErrors', () => {
  it('keeps the first message per field and drops unknown paths', () => {
    expect(
      firstFieldErrors([
        { path: ['title'], message: 'first' },
        { path: ['title'], message: 'second' },
        { path: ['id'], message: 'not a field' },
        { path: ['patch', 'path'], message: 'folder' },
      ]),
    ).toEqual({ title: 'first', path: 'folder' });
  });
});

describe('toggleId', () => {
  it('adds a missing id and removes a present one', () => {
    expect(toggleId(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleId(['a', 'b'], 'a')).toEqual(['b']);
  });
});
