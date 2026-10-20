import { describe, expect, it } from 'vitest';
import {
  EMPTY_PICKS,
  MAX_WORLDS,
  SUGGESTED_WORLDS,
  addCustomWorld,
  buildOnboardingInput,
  chipNames,
  cleanWorldName,
  isSelected,
  toggleWorld,
  type PickResult,
  type WorldPicks,
} from '../src/renderer/components/onboarding/onboarding-form';

function picksOf(result: PickResult): WorldPicks {
  if (!result.ok) throw new Error(`expected ok, got: ${result.message}`);
  return result.picks;
}

/** Picks with `n` custom worlds, all selected. */
function fullPicks(n: number): WorldPicks {
  const names = Array.from({ length: n }, (_, i) => `World ${i}`);
  return { custom: names, selected: [...names] };
}

describe('onboarding suggestions', () => {
  it('has the generic suggestions and nothing preselected', () => {
    expect(SUGGESTED_WORLDS).toEqual([
      'Coding',
      'Hardware',
      'Electronics',
      'Music',
      'Art',
      'Writing',
      'Video',
      'Learning',
      'Health',
      'Business',
      'Home',
    ]);
    expect(EMPTY_PICKS.selected).toEqual([]);
  });
});

describe('cleanWorldName', () => {
  it('trims and collapses whitespace', () => {
    expect(cleanWorldName('  3D   printing \n')).toBe('3D printing');
  });
});

describe('toggleWorld', () => {
  it('selects and deselects case-insensitively', () => {
    const on = picksOf(toggleWorld(EMPTY_PICKS, 'Music'));
    expect(isSelected(on, 'music')).toBe(true);
    const off = picksOf(toggleWorld(on, 'MUSIC'));
    expect(off.selected).toEqual([]);
  });

  it('refuses to go past the limit but still allows deselecting', () => {
    const full = fullPicks(MAX_WORLDS);
    const refused = toggleWorld(full, 'Music');
    expect(refused.ok).toBe(false);
    expect(picksOf(toggleWorld(full, 'World 0')).selected).toHaveLength(MAX_WORLDS - 1);
  });
});

describe('addCustomWorld', () => {
  it('adds a new chip and selects it', () => {
    const picks = picksOf(addCustomWorld(EMPTY_PICKS, '  Woodworking '));
    expect(picks.custom).toEqual(['Woodworking']);
    expect(picks.selected).toEqual(['Woodworking']);
    expect(chipNames(picks).at(-1)).toBe('Woodworking');
  });

  it('selects a matching suggestion instead of duplicating it', () => {
    const picks = picksOf(addCustomWorld(EMPTY_PICKS, 'music'));
    expect(picks.custom).toEqual([]);
    expect(picks.selected).toEqual(['Music']);
  });

  it('dedupes against earlier custom worlds, selected or not', () => {
    const added = picksOf(addCustomWorld(EMPTY_PICKS, 'Gardening'));
    expect(picksOf(addCustomWorld(added, 'GARDENING'))).toBe(added);
    const deselected = picksOf(toggleWorld(added, 'Gardening'));
    const again = picksOf(addCustomWorld(deselected, 'gardening'));
    expect(again.custom).toEqual(['Gardening']);
    expect(again.selected).toEqual(['Gardening']);
  });

  it('rejects blank and too-long names', () => {
    expect(addCustomWorld(EMPTY_PICKS, '   ').ok).toBe(false);
    expect(addCustomWorld(EMPTY_PICKS, 'x'.repeat(41)).ok).toBe(false);
    expect(addCustomWorld(EMPTY_PICKS, 'x'.repeat(40)).ok).toBe(true);
  });

  it('rejects a new world once the limit is reached', () => {
    expect(addCustomWorld(fullPicks(MAX_WORLDS), 'One more').ok).toBe(false);
  });
});

describe('buildOnboardingInput', () => {
  it('allows no worlds', () => {
    expect(buildOnboardingInput(EMPTY_PICKS, false)).toEqual({
      ok: true,
      value: { worlds: [], addSamples: false },
    });
  });

  it('orders worlds like the chips, not by click order', () => {
    let picks = picksOf(addCustomWorld(EMPTY_PICKS, 'Gardening'));
    picks = picksOf(toggleWorld(picks, 'Home'));
    picks = picksOf(toggleWorld(picks, 'Coding'));
    expect(buildOnboardingInput(picks, true)).toEqual({
      ok: true,
      value: { worlds: ['Coding', 'Home', 'Gardening'], addSamples: true },
    });
  });

  it('reports schema failures as a friendly message', () => {
    const tooMany = fullPicks(MAX_WORLDS + 1);
    const result = buildOnboardingInput(tooMany, false);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/up to 20/);
  });
});
