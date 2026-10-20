// Pure helpers for the Ignite screen, kept out of the component so they can be unit tested
// without a DOM. Validation reuses the IPC schema so inline errors match what main enforces.
import { igniteInput, type IgniteInput } from '../../../shared/schemas';
import { suggestBlueprint } from '../../../shared/blueprints';
import type { Blueprint } from '../../../shared/types';

export const MAX_MODULES = 12;
export const MAX_CHECKLIST = 30;
export const MAX_MODULE_LENGTH = 60;
export const MAX_STEP_LENGTH = 200;
const MAX_TITLE_LENGTH = 60;
const MAX_TITLE_WORDS = 6;

/** A module or checklist row. The id keeps React keys (and animations) stable across edits. */
export interface ListItem {
  id: string;
  text: string;
}

/** The selected blueprint's modules, checklist and parts bin as the user is shaping them. */
export interface Assembly {
  blueprintId: string;
  modules: ListItem[];
  checklist: ListItem[];
  partsBin: boolean;
}

const BLUEPRINT_ITEM_PREFIX = 'bp:';

export function blueprintAssembly(blueprint: Blueprint): Assembly {
  const items = (kind: string, texts: readonly string[]) =>
    texts.map((text, i) => ({ id: `${BLUEPRINT_ITEM_PREFIX}${blueprint.id}:${kind}${i}`, text }));
  return {
    blueprintId: blueprint.id,
    modules: items('m', blueprint.modules),
    checklist: items('c', blueprint.checklist),
    partsBin: blueprint.partsBin,
  };
}

/**
 * Items that came from a blueprint assemble with a stagger; ones the user adds appear at once,
 * otherwise a 12th module would wait most of a second before showing up.
 */
export function isBlueprintItem(item: ListItem): boolean {
  return item.id.startsWith(BLUEPRINT_ITEM_PREFIX);
}

/** Blank is the fallback when nothing is suggested; it ships last, so fall back to the end. */
export function fallbackBlueprint(blueprints: readonly Blueprint[]): Blueprint | null {
  return blueprints.find((b) => b.id === 'blank') ?? blueprints.at(-1) ?? null;
}

/**
 * The suggestion follows the idea text until the user picks a blueprint themselves (manualId);
 * after that their choice wins even if the idea starts matching something else.
 */
export function resolveBlueprint(
  blueprints: readonly Blueprint[],
  idea: string,
  manualId: string | null,
): { selected: Blueprint | null; suggested: Blueprint | null } {
  const suggested = suggestBlueprint(idea, blueprints);
  const manual = manualId ? (blueprints.find((b) => b.id === manualId) ?? null) : null;
  return { selected: manual ?? suggested ?? fallbackBlueprint(blueprints), suggested };
}

export function addItem(items: readonly ListItem[], item: ListItem, max: number): ListItem[] {
  return items.length >= max ? [...items] : [...items, item];
}

export function removeItem(items: readonly ListItem[], id: string): ListItem[] {
  return items.filter((item) => item.id !== id);
}

/**
 * Renames an item; a blank name is ignored so a cleared field never makes an invalid row. The
 * text is kept as typed (renames apply on every keystroke, and trimming then would eat the
 * space before the next word); the schema trims on submit.
 */
export function renameItem(items: readonly ListItem[], id: string, text: string): ListItem[] {
  if (!text.trim()) return [...items];
  return items.map((item) => (item.id === id ? { ...item, text } : item));
}

// Lead-ins people type before the actual thing ("I want to build a …").
const WISH =
  /^(?:i|we)\s+(?:want|need|would\s+like|'d\s+like|plan|am\s+going|'m\s+going|wanna|hope)\s+to\s+/i;
const WISH_SHORT = /^(?:i|we)\s+(?:wanna|gonna)\s+/i;
const LETS = /^(?:let'?s|lets)\s+/i;
// A making-verb is only filler when an article follows: "build a robot" vs "design system".
const VERB_THEN_ARTICLE =
  /^(?:build|make|create|design|write|start|code|develop|craft|program|record|draw|paint|learn|study|research)\s+(?=(?:a|an|the|my|our|some)\s)/i;
const ARTICLE = /^(?:a|an|the|my|our|some)\s+/i;
// A title stops where a clause starts ("…station that tweets the forecast").
const CLAUSE_WORDS = new Set(['that', 'which', 'who', 'so', 'because', 'where', 'when', 'using']);
const SMALL_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'nor',
  'for',
  'of',
  'to',
  'in',
  'on',
  'at',
  'by',
  'with',
  'from',
  'as',
  'vs',
  'via',
]);

function capitalize(word: string, force: boolean): string {
  // Leave words the user already cased on purpose (API, iOS, IoT, LoRa).
  if (/[A-Z]/.test(word.slice(1))) return word;
  const lower = word.toLowerCase();
  if (!force && SMALL_WORDS.has(lower)) return lower;
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** A short title-cased name from the idea text: "I want to build a weather station for my garden that tweets" → "Weather Station for My Garden". */
export function titleFromIdea(idea: string): string {
  let text = (idea.split(/[.!?\n]/)[0] ?? '').trim().replace(/\s+/g, ' ');
  text = text.replace(WISH, '').replace(WISH_SHORT, '').replace(LETS, '');
  text = text.replace(VERB_THEN_ARTICLE, '').replace(ARTICLE, '');

  const words: string[] = [];
  for (const raw of text.split(' ')) {
    const word = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}+#]+$/gu, '');
    if (!word) continue;
    if (words.length > 0 && CLAUSE_WORDS.has(word.toLowerCase())) break;
    words.push(word);
    if (words.length === MAX_TITLE_WORDS) break;
  }
  // Don't end on a dangling "for" / "and" after cutting the sentence short.
  while (words.length > 1 && SMALL_WORDS.has(words[words.length - 1].toLowerCase())) words.pop();

  let title = words.map((w, i) => capitalize(w, i === 0 || i === words.length - 1)).join(' ');
  if (title.length > MAX_TITLE_LENGTH) {
    const cut = title.slice(0, MAX_TITLE_LENGTH);
    const space = cut.lastIndexOf(' ');
    title = space > 0 ? cut.slice(0, space) : cut;
  }
  return title;
}

export interface IgniteValues {
  title: string;
  idea: string;
  blueprintId: string | null;
  worldIds: string[];
  path: string | null;
  assembly: Assembly | null;
}

export type IgniteField =
  'title' | 'idea' | 'blueprintId' | 'worldIds' | 'path' | 'modules' | 'checklist';

export type IgniteResult =
  { ok: true; value: IgniteInput } | { ok: false; field: IgniteField | null; message: string };

// Zod's defaults for array items read like "Too big: expected string to have <=60 characters";
// these say what to do instead.
const FRIENDLY: Partial<Record<IgniteField, string>> = {
  idea: 'Keep the idea under 2000 characters.',
  blueprintId: 'Pick a blueprint.',
  worldIds: 'Pick up to 20 worlds.',
  modules: `Use up to ${MAX_MODULES} modules with names under ${MAX_MODULE_LENGTH} characters.`,
  checklist: `Use up to ${MAX_CHECKLIST} steps, each under ${MAX_STEP_LENGTH} characters.`,
};

const FIELDS: readonly IgniteField[] = [
  'title',
  'idea',
  'blueprintId',
  'worldIds',
  'path',
  'modules',
  'checklist',
];

/** Validates the screen's values and returns the payload, or the first problem to show. */
export function buildIgniteInput(values: IgniteValues): IgniteResult {
  const result = igniteInput.safeParse({
    title: values.title,
    idea: values.idea,
    blueprintId: values.blueprintId ?? '',
    worldIds: values.worldIds,
    path: values.path,
    modules: values.assembly?.modules.map((m) => m.text) ?? [],
    checklist: values.assembly?.checklist.map((c) => c.text) ?? [],
    partsBin: values.assembly?.partsBin ?? false,
  });
  if (result.success) return { ok: true, value: result.data };
  const issue = result.error.issues[0];
  const field = FIELDS.find((f) => f === issue?.path[0]) ?? null;
  const message = (field && FRIENDLY[field]) ?? issue?.message ?? 'Check the form and try again.';
  return { ok: false, field, message };
}
