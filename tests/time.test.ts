import { describe, expect, it } from 'vitest';
import { DAY, HOUR, MINUTE, daysSince, formatRelative } from '../src/shared/time';

const NOW = Date.UTC(2026, 9, 19, 12, 0, 0);

describe('daysSince', () => {
  it('floors partial days', () => {
    expect(daysSince(NOW - 3 * DAY - 23 * HOUR, NOW)).toBe(3);
  });

  it('never goes negative for future timestamps', () => {
    expect(daysSince(NOW + DAY, NOW)).toBe(0);
  });
});

describe('formatRelative', () => {
  it.each([
    [30_000, 'just now'],
    [5 * MINUTE, '5m ago'],
    [2 * HOUR, '2h ago'],
    [3 * DAY, '3d ago'],
    [21 * DAY, '3w ago'],
    [120 * DAY, '4mo ago'],
    [800 * DAY, '2y ago'],
  ])('formats %d ms ago as %s', (ago, label) => {
    expect(formatRelative(NOW - ago, NOW)).toBe(label);
  });
});
