// Upgrades data files written by older versions. Changes are additive, so older files just
// gain the new fields with safe defaults: nothing is lost or rewritten.
//   v1 → v2: project kind/blueprint/partsBin, entry checklist/file/module, Lab tables.
//   v2 → v3: app settings (an existing file counts as already set up).
import { STORE_VERSION, type StoreData } from './repository';

type Raw = Record<string, unknown>;

const isObject = (value: unknown): value is Raw =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const array = (value: unknown): Raw[] => (Array.isArray(value) ? value.filter(isObject) : []);

/** Returns upgraded data, or null when the file isn't Stokebay data at all. */
export function migrateStoreData(raw: unknown): StoreData | null {
  if (!isObject(raw)) return null;
  const version = raw.version;
  if (version !== 1 && version !== 2 && version !== STORE_VERSION) return null;
  const required = ['worlds', 'projects', 'pauses', 'entries', 'events'];
  if (!required.every((key) => Array.isArray(raw[key]))) return null;

  const projects = array(raw.projects).map((p) => ({
    kind: 'other',
    blueprintId: null,
    partsBin: false,
    ...p,
  }));
  const entries = array(raw.entries).map((e) => ({
    checklist: null,
    file: null,
    moduleId: null,
    ...e,
  }));
  // Someone upgrading already has data, so first-run setup would only get in their way.
  const settings = {
    onboarded: true,
    backupFolder: null,
    lastExternalBackupAt: null,
    editor: 'vscode',
    ...(isObject(raw.settings) ? raw.settings : {}),
  };

  return {
    ...raw,
    version: STORE_VERSION,
    settings,
    projects,
    entries,
    modules: array(raw.modules),
    parts: array(raw.parts),
    nodes: array(raw.nodes),
    edges: array(raw.edges),
  } as unknown as StoreData;
}
