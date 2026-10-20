export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** Whole days elapsed between two instants, floored and never negative. */
export function daysSince(then: number, now: number): number {
  return Math.max(0, Math.floor((now - then) / DAY));
}

/** Short relative label for cards and timelines, e.g. "just now", "5m ago", "3d ago". */
export function formatRelative(then: number, now: number): string {
  const diff = Math.max(0, now - then);
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  const days = Math.floor(diff / DAY);
  if (days < 14) return `${days}d ago`;
  if (days < 60) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}
