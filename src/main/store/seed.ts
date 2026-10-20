// Benchmark data: many projects with many notes, so speed can be checked at a realistic worst
// case (see `npm run seed` and tests/sqlite-perf.test.ts). Deterministic for a given size.
import type { Entry, Project, World } from '../../shared/types';
import { emptyStoreData } from './json-store';
import type { StoreData } from './repository';

const WORDS = (
  'motor sensor servo battery sketch chord melody verse chapter draft lesson grammar route ' +
  'interval budget invoice recipe garden shelf frame bracket solder firmware parser cache ' +
  'render shader camera lens mixer tempo bridge harmony outline scene character deadline'
).split(' ');

const DAY = 24 * 60 * 60 * 1000;

/** `projects` projects with `entriesPerProject` notes each, spread over the last year. */
export function benchmarkData(
  projects = 500,
  entriesPerProject = 100,
  now = Date.now(),
): StoreData {
  const data = emptyStoreData();
  data.settings.onboarded = true;
  let seed = 1;
  // Small deterministic generator, so runs are comparable.
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const pick = () => WORDS[Math.floor(rand() * WORDS.length)];
  const id = (prefix: string, n: number) => `${prefix}${String(n).padStart(8, '0')}`;

  const worlds: World[] = ['Coding', 'Hardware', 'Music', 'Writing', 'Health'].map((name, i) => ({
    id: id('w', i),
    name,
    color: '#5b8fd1',
    icon: null,
    sortOrder: i,
  }));
  data.worlds = worlds;

  for (let p = 0; p < projects; p++) {
    const createdAt = now - Math.floor(rand() * 365) * DAY;
    const project: Project = {
      id: id('p', p),
      title: `${pick()} ${pick()} ${p}`,
      path: null,
      status: rand() < 0.7 ? 'active' : rand() < 0.5 ? 'idea' : 'done',
      kind: 'other',
      blueprintId: null,
      partsBin: false,
      color: null,
      isWork: false,
      isSample: false,
      worldIds: [worlds[p % worlds.length].id],
      createdAt,
      updatedAt: createdAt,
      lastEventAt: createdAt + Math.floor(rand() * 200) * DAY,
      archivedAt: null,
      git: null,
    };
    data.projects.push(project);
    for (let e = 0; e < entriesPerProject; e++) {
      const entry: Entry = {
        id: id(`e${p}-`, e),
        projectId: project.id,
        type: 'note',
        title: `${pick()} notes`,
        body: Array.from({ length: 30 }, pick).join(' '),
        url: null,
        checklist: null,
        file: null,
        moduleId: null,
        createdAt: createdAt + e * 60_000,
      };
      data.entries.push(entry);
    }
  }
  return data;
}
