import { describe, expect, it } from 'vitest';
import {
  addItem,
  blueprintAssembly,
  buildIgniteInput,
  fallbackBlueprint,
  isBlueprintItem,
  removeItem,
  renameItem,
  resolveBlueprint,
  titleFromIdea,
  type IgniteValues,
  type ListItem,
} from '../src/renderer/components/ignite/ignite-form';
import type { Blueprint } from '../src/shared/types';

function blueprint(over: Partial<Blueprint> & { id: string }): Blueprint {
  return {
    name: over.id,
    kind: 'other',
    description: '',
    keywords: [],
    modules: [],
    partsBin: false,
    checklist: [],
    ...over,
  };
}

const SOFTWARE = blueprint({
  id: 'software-app',
  keywords: ['app', 'website'],
  modules: ['Design', 'Frontend'],
  checklist: ['Sketch it'],
});
const HARDWARE = blueprint({
  id: 'hardware-build',
  keywords: ['robot'],
  modules: ['Frame'],
  partsBin: true,
});
const BLANK = blueprint({ id: 'blank' });
const ALL = [SOFTWARE, HARDWARE, BLANK];

describe('titleFromIdea', () => {
  it('drops lead-ins and title-cases a short name', () => {
    expect(titleFromIdea('I want to build a weather station for my garden that tweets')).toBe(
      'Weather Station for My Garden',
    );
    expect(titleFromIdea('make an app to track my plants')).toBe('App to Track My Plants');
    expect(titleFromIdea("let's record an album")).toBe('Album');
  });

  it('keeps a making-verb when no article follows it', () => {
    expect(titleFromIdea('design system for my blog')).toBe('Design System for My Blog');
  });

  it('keeps words the user cased on purpose', () => {
    expect(titleFromIdea('an iOS app for the API')).toBe('iOS App for the API');
  });

  it('stops at the first sentence and caps the length', () => {
    expect(titleFromIdea('Robot arm. It should pick up cups')).toBe('Robot Arm');
    expect(titleFromIdea('one two three four five six seven eight')).toBe(
      'One Two Three Four Five Six',
    );
    expect(titleFromIdea('a '.repeat(3) + 'x'.repeat(80)).length).toBeLessThanOrEqual(60);
  });

  it("doesn't end on a dangling small word", () => {
    expect(titleFromIdea('a lamp for and')).toBe('Lamp');
  });

  it('returns empty for empty input', () => {
    expect(titleFromIdea('   ')).toBe('');
  });
});

describe('resolveBlueprint', () => {
  it('suggests from the idea and selects the suggestion', () => {
    const r = resolveBlueprint(ALL, 'a robot that waters plants', null);
    expect(r.suggested?.id).toBe('hardware-build');
    expect(r.selected?.id).toBe('hardware-build');
  });

  it('falls back to Blank when nothing matches', () => {
    const r = resolveBlueprint(ALL, 'something', null);
    expect(r.suggested).toBeNull();
    expect(r.selected?.id).toBe('blank');
  });

  it('keeps a manual pick even when the idea suggests another', () => {
    const r = resolveBlueprint(ALL, 'a website', 'hardware-build');
    expect(r.suggested?.id).toBe('software-app');
    expect(r.selected?.id).toBe('hardware-build');
  });

  it('falls back to the last blueprint when Blank is missing', () => {
    expect(fallbackBlueprint([SOFTWARE, HARDWARE])?.id).toBe('hardware-build');
    expect(fallbackBlueprint([])).toBeNull();
  });
});

describe('list helpers', () => {
  const items: ListItem[] = [
    { id: 'a', text: 'One' },
    { id: 'b', text: 'Two' },
  ];

  it('adds up to the max', () => {
    expect(addItem(items, { id: 'c', text: 'Three' }, 3)).toHaveLength(3);
    expect(addItem(items, { id: 'c', text: 'Three' }, 2)).toHaveLength(2);
  });

  it('removes by id', () => {
    expect(removeItem(items, 'a')).toEqual([{ id: 'b', text: 'Two' }]);
  });

  it('renames as typed and ignores blank names', () => {
    expect(renameItem(items, 'a', 'Uno ')[0].text).toBe('Uno ');
    expect(renameItem(items, 'a', '   ')[0].text).toBe('One');
    expect(renameItem(items, 'a', 'Uno')[1]).toBe(items[1]);
  });

  it('trims item text when building the payload', () => {
    const r = buildIgniteInput({
      title: 'T',
      idea: '',
      blueprintId: 'blank',
      worldIds: [],
      path: null,
      assembly: {
        blueprintId: 'blank',
        modules: [{ id: 'u1', text: ' Frame ' }],
        checklist: [],
        partsBin: false,
      },
    });
    expect(r.ok && r.value.modules).toEqual(['Frame']);
  });

  it('builds an assembly from a blueprint with stable blueprint ids', () => {
    const a = blueprintAssembly(SOFTWARE);
    expect(a.modules.map((m) => m.text)).toEqual(['Design', 'Frontend']);
    expect(a.checklist.map((c) => c.text)).toEqual(['Sketch it']);
    expect(blueprintAssembly(SOFTWARE).modules[1].id).toBe(a.modules[1].id);
    expect(a.modules.every(isBlueprintItem)).toBe(true);
    expect(isBlueprintItem({ id: 'u1', text: 'x' })).toBe(false);
    expect(blueprintAssembly(HARDWARE).partsBin).toBe(true);
  });
});

describe('buildIgniteInput', () => {
  const values = (over: Partial<IgniteValues> = {}): IgniteValues => ({
    title: 'Plant Bot',
    idea: 'a robot that waters plants',
    blueprintId: 'hardware-build',
    worldIds: ['w1'],
    path: null,
    assembly: blueprintAssembly(HARDWARE),
    ...over,
  });

  it('returns the payload for valid values', () => {
    const r = buildIgniteInput(values());
    expect(r).toEqual({
      ok: true,
      value: {
        title: 'Plant Bot',
        idea: 'a robot that waters plants',
        blueprintId: 'hardware-build',
        worldIds: ['w1'],
        path: null,
        modules: ['Frame'],
        checklist: [],
        partsBin: true,
      },
    });
  });

  it('reports a missing title', () => {
    const r = buildIgniteInput(values({ title: '  ' }));
    expect(r).toEqual({ ok: false, field: 'title', message: 'Give the project a title.' });
  });

  it('reports a missing blueprint and too many modules in plain words', () => {
    const noBlueprint = buildIgniteInput(values({ blueprintId: null }));
    expect(noBlueprint.ok === false && noBlueprint.field).toBe('blueprintId');

    const modules = Array.from({ length: 13 }, (_, i) => ({ id: `u${i}`, text: `M${i}` }));
    const tooMany = buildIgniteInput(
      values({ assembly: { ...blueprintAssembly(HARDWARE), modules } }),
    );
    expect(tooMany.ok === false && tooMany.field).toBe('modules');
    expect(tooMany.ok === false && tooMany.message).toMatch(/up to 12 modules/);
  });

  it('rejects a relative folder path', () => {
    const r = buildIgniteInput(values({ path: 'code/plant-bot' }));
    expect(r.ok === false && r.field).toBe('path');
  });
});
