import { daysSince } from './time';
import type { ProjectStatus } from './types';

export type Glow = 'bright' | 'medium' | 'dim' | 'cold' | 'none';

export const COLD_AFTER_DAYS = 30;

/**
 * Glow applies to active projects only. Paused projects stay a steady amber (they were
 * paused on purpose); done and idea projects keep their colour with no glow changes.
 */
export function glowFor(
  project: { status: ProjectStatus; lastActivityAt: number },
  now: number,
): Glow {
  if (project.status !== 'active') return 'none';
  const days = daysSince(project.lastActivityAt, now);
  if (days <= 3) return 'bright';
  if (days <= 14) return 'medium';
  if (days < COLD_AFTER_DAYS) return 'dim';
  return 'cold';
}
