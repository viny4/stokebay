// Upgrades data files written by older versions. Changes are additive, so older files just
// gain the new fields with safe defaults: nothing is lost or rewritten.
//   v1 → v2: project kind/blueprint/partsBin, entry checklist/file/module, Lab tables.
//   v2 → v3: app settings (an existing file counts as already set up).
//   v3 → v4: worlds still on the old neon default colours get the calmer version of the same
//            colour. Colours the user picked themselves are left alone.
import { STORE_VERSION, type StoreData } from './repository';

type Raw = Record<string, unknown>;

/** Old default world colour → its calmer replacement (same hue order as WORLD_PALETTE). */
const OLD_WORLD_COLORS: Record<string, string> = {
  '#38bdf8': '#5b8fd1',
  '#f472b6': '#d2668f',
  '#facc15': '#c9a03a',
  '#4ade80': '#5fa77a',
  '#c084fc': '#9277cc',
  '#fb923c': '#d9733f',
  '#2dd4bf': '#3f9e9a',
  '#f87171': '#c75c5c',
};

const isObject = (value: unknown): value is Raw =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const array = (value: unknown): Raw[] => (Array.isArray(value) ? value.filter(isObject) : []);

/** Returns upgraded data, or null when the file isn't Stokebay data at all. */
export function migrateStoreData(raw: unknown): StoreData | null {
  if (!isObject(raw)) return null;
  const version = raw.version;
  if (version !== 1 && version !== 2 && version !== 3 && version !== STORE_VERSION) return null;
  const required = ['worlds', 'projects', 'pauses', 'entries', 'events'];
  if (!required.every((key) => Array.isArray(raw[key]))) return null;

  const worlds = array(raw.worlds).map((w) =>
    typeof version === 'number' && version < 4 && typeof w.color === 'string'
      ? { ...w, color: OLD_WORLD_COLORS[w.color.toLowerCase()] ?? w.color }
      : w,
  );
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
    worlds,
    projects,
    entries,
    modules: array(raw.modules),
    parts: array(raw.parts),
    nodes: array(raw.nodes),
    edges: array(raw.edges),
  } as unknown as StoreData;
}
