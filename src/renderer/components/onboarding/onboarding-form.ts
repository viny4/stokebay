// Pure state helpers for the first-run setup screen, kept out of React so they can be tested.
// Worlds are picked by name here (they don't exist yet); main creates them on finish.
import { onboardingInput, type OnboardingInput } from '../../../shared/schemas';

/** Generic interest areas: broad enough for coders and non-coders alike. */
export const SUGGESTED_WORLDS: readonly string[] = [
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
];

/** Mirror the limits in `onboardingInput` so the UI can explain them before saving. */
export const MAX_WORLDS = 20;
export const MAX_WORLD_NAME = 40;

export const STEPS = ['Welcome', 'Areas', 'Start'] as const;
export const LAST_STEP = STEPS.length - 1;

export interface WorldPicks {
  /** Names the user typed, shown as extra chips after the suggestions (selected or not). */
  custom: string[];
  /** Chosen names in click order; matches are case-insensitive. */
  selected: string[];
}

export const EMPTY_PICKS: WorldPicks = { custom: [], selected: [] };

export type PickResult = { ok: true; picks: WorldPicks } | { ok: false; message: string };

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Trims and collapses inner whitespace so "  my   music " and "My Music" dedupe. */
export function cleanWorldName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

export function isSelected(picks: WorldPicks, name: string): boolean {
  return picks.selected.some((s) => same(s, name));
}

/** Every chip on screen: suggestions first, then the user's own, in the order added. */
export function chipNames(picks: WorldPicks): string[] {
  return [...SUGGESTED_WORLDS, ...picks.custom];
}

const fullMessage = `You can pick up to ${MAX_WORLDS} areas for now. Add more later.`;

export function toggleWorld(picks: WorldPicks, name: string): PickResult {
  if (isSelected(picks, name)) {
    return {
      ok: true,
      picks: { ...picks, selected: picks.selected.filter((s) => !same(s, name)) },
    };
  }
  if (picks.selected.length >= MAX_WORLDS) return { ok: false, message: fullMessage };
  return { ok: true, picks: { ...picks, selected: [...picks.selected, name] } };
}

/**
 * Adds a typed world and selects it. A name that matches an existing chip (any case) selects
 * that chip instead of making a near-duplicate, so "music" picks the "Music" suggestion.
 */
export function addCustomWorld(picks: WorldPicks, raw: string): PickResult {
  const name = cleanWorldName(raw);
  if (!name) return { ok: false, message: 'Type a name for your area first.' };
  if (name.length > MAX_WORLD_NAME) {
    return { ok: false, message: `Area names can be up to ${MAX_WORLD_NAME} characters.` };
  }
  const existing = chipNames(picks).find((c) => same(c, name));
  if (existing && isSelected(picks, existing)) return { ok: true, picks };
  if (picks.selected.length >= MAX_WORLDS) return { ok: false, message: fullMessage };
  if (existing) return { ok: true, picks: { ...picks, selected: [...picks.selected, existing] } };
  return {
    ok: true,
    picks: { custom: [...picks.custom, name], selected: [...picks.selected, name] },
  };
}

export type BuildResult = { ok: true; value: OnboardingInput } | { ok: false; message: string };

/** Validates with the same schema main uses; worlds go in chip order so the HUD matches. */
export function buildOnboardingInput(picks: WorldPicks, addSamples: boolean): BuildResult {
  const worlds = chipNames(picks).filter((c) => isSelected(picks, c));
  const parsed = onboardingInput.safeParse({ worlds, addSamples });
  if (parsed.success) return { ok: true, value: parsed.data };
  const issue = parsed.error.issues[0];
  if (issue?.path[0] === 'worlds') {
    return {
      ok: false,
      message:
        issue.path.length > 1
          ? `Each area name needs 1–${MAX_WORLD_NAME} characters.`
          : `Pick up to ${MAX_WORLDS} worlds.`,
    };
  }
  return { ok: false, message: issue?.message ?? 'Something in the setup is not valid.' };
}
