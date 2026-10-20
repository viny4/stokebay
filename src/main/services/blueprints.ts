// Built-in blueprints are plain JSON so they read like data and can be edited without code.
// Bundled into the main process at build time; user-made blueprints come later.
import blank from '../../../resources/blueprints/blank.json';
import creative from '../../../resources/blueprints/creative.json';
import electronics from '../../../resources/blueprints/electronics.json';
import hardware from '../../../resources/blueprints/hardware.json';
import research from '../../../resources/blueprints/research.json';
import software from '../../../resources/blueprints/software.json';
import { PROJECT_KINDS, type Blueprint } from '../../shared/types';

const BUILT_IN: unknown[] = [software, hardware, electronics, creative, research, blank];

function isBlueprint(value: unknown): value is Blueprint {
  const b = value as Partial<Blueprint>;
  const strings = (v: unknown) => Array.isArray(v) && v.every((s) => typeof s === 'string');
  return (
    typeof b.id === 'string' &&
    typeof b.name === 'string' &&
    typeof b.description === 'string' &&
    PROJECT_KINDS.includes(b.kind as Blueprint['kind']) &&
    strings(b.keywords) &&
    strings(b.modules) &&
    strings(b.checklist) &&
    typeof b.partsBin === 'boolean'
  );
}

// Validated once so a typo in a JSON file shows up immediately instead of mid-Ignite.
const blueprints: Blueprint[] = BUILT_IN.map((b, i) => {
  if (!isBlueprint(b)) throw new Error(`Built-in blueprint #${i} is malformed`);
  return b;
});

export function listBlueprints(): Blueprint[] {
  return blueprints;
}

export function getBlueprint(id: string): Blueprint | undefined {
  return blueprints.find((b) => b.id === id);
}
