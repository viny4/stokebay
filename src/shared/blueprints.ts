import type { Blueprint } from './types';

/**
 * Suggests a blueprint for an idea by counting keyword hits (whole words, case-insensitive;
 * multi-word keywords match as phrases). Returns null when nothing matches, so the user picks.
 * This is the stand-in until AI drafting arrives.
 */
export function suggestBlueprint(idea: string, blueprints: readonly Blueprint[]): Blueprint | null {
  const text = ` ${idea.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  let best: Blueprint | null = null;
  let bestScore = 0;
  for (const blueprint of blueprints) {
    const score = blueprint.keywords.reduce((sum, keyword) => {
      const phrase = keyword
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
      if (!phrase) return sum;
      // Allow a plural "s" so "robots" still matches "robot".
      const hit = text.includes(` ${phrase} `) || text.includes(` ${phrase}s `);
      return hit ? sum + 1 : sum;
    }, 0);
    if (score > bestScore) {
      best = blueprint;
      bestScore = score;
    }
  }
  return best;
}
