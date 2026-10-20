import { describe, expect, it } from 'vitest';
import { mapLimit } from '../src/main/services/concurrency';

describe('mapLimit', () => {
  it('keeps result order and respects the limit', async () => {
    let inFlight = 0;
    let peak = 0;
    const results = await mapLimit([30, 10, 20, 5, 15], 2, async (ms) => {
      peak = Math.max(peak, ++inFlight);
      await new Promise((r) => setTimeout(r, ms));
      inFlight--;
      return ms * 2;
    });
    expect(results).toEqual([60, 20, 40, 10, 30]);
    expect(peak).toBe(2);
  });

  it('handles an empty list', async () => {
    expect(await mapLimit([], 4, async (x) => x)).toEqual([]);
  });
});
