import { describe, expect, it } from 'vitest';
import { getBlueprint, listBlueprints } from '../src/main/services/blueprints';
import { suggestBlueprint } from '../src/shared/blueprints';

const all = listBlueprints();

describe('built-in blueprints', () => {
  it('load and have unique ids, with Blank last', () => {
    const ids = all.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.at(-1)).toBe('blank');
    expect(getBlueprint('hardware-build')?.partsBin).toBe(true);
  });
});

describe('suggestBlueprint', () => {
  it.each([
    ['A robot arm that sorts Lego bricks by colour', 'hardware-build'],
    ['Smart plant pot with an ESP32 moisture sensor', 'electronics-iot'],
    ['A six song album', 'creative'],
    ['Weather dashboard web app', 'software-app'],
    ['Learn Japanese for my exam', 'research'],
    ['Drones!', 'hardware-build'],
  ])('suggests the right blueprint for "%s"', (idea, id) => {
    expect(suggestBlueprint(idea, all)?.id).toBe(id);
  });

  it('matches whole words only and returns null for no match', () => {
    expect(suggestBlueprint('carpet cleaning', all)).toBeNull();
    expect(suggestBlueprint('', all)).toBeNull();
  });
});
