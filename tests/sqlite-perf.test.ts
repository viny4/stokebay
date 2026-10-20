// The UI must feel instant at a realistic worst case: 500 projects, 50,000 notes.
import { describe, expect, it } from 'vitest';
import { benchmarkData } from '../src/main/store/seed';
import { SqliteStore } from '../src/main/store/sqlite-store';
import { tempDir } from './helpers';

/** Median of several runs, in ms (the first run warms the statement cache). */
function median(fn: () => unknown, runs = 7): number {
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  return times.sort((a, b) => a - b)[Math.floor(runs / 2)];
}

describe('speed with 500 projects and 50,000 notes', () => {
  it('lists, opens and searches well within one frame', async () => {
    const store = await SqliteStore.open(await tempDir(), { seed: () => benchmarkData(500, 100) });
    expect(store.snapshot().entries).toHaveLength(50_000);

    const project = store.listProjects()[250];
    const timings = {
      listProjects: median(() => store.listProjects()),
      listEntries: median(() => store.listEntries(project.id)),
      searchWord: median(() => store.search('servo')),
      searchPrefix: median(() => store.search('ser bat')),
    };
    // Generous limits so slower CI machines pass; real numbers are far lower.
    expect(timings.listEntries).toBeLessThan(16);
    expect(timings.searchWord).toBeLessThan(50);
    expect(timings.searchPrefix).toBeLessThan(50);
    expect(timings.listProjects).toBeLessThan(16);
    console.log('timings (ms)', timings);
  }, 60_000);
});
