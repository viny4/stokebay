// Creates a benchmark data folder: 500 projects with 100 notes each (50,000 notes).
//   npm run seed                 → ./.seed-data
//   npm run seed -- <folder>     → that folder (must not already hold a database)
// Then try the app against it:  STOKEBAY_DATA_DIR=<folder> npm start
import fs from 'node:fs';
import path from 'node:path';
import { benchmarkData } from '../src/main/store/seed';
import { DB_FILE, SqliteStore } from '../src/main/store/sqlite-store';

async function main() {
  const dir = path.resolve(process.argv[2] ?? '.seed-data');
  if (fs.existsSync(path.join(dir, DB_FILE))) {
    console.error(`${dir} already has a database; pick an empty folder.`);
    process.exit(1);
  }
  const started = performance.now();
  const store = await SqliteStore.open(dir, { seed: () => benchmarkData(500, 100) });
  const { projects, entries } = store.snapshot();
  store.close();
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  console.log(`${projects.length} projects, ${entries.length} notes → ${dir} (${seconds}s)`);
}

void main();
