import { describe, expect, it } from 'vitest';
import {
  centsToInput,
  formatAmounts,
  formatMoney,
  hostOf,
  lineTotal,
  normalizeCurrency,
  normalizeUrl,
  parseMoney,
  parseQty,
  summarizeParts,
  totalsByCurrency,
} from '../src/renderer/components/lab/parts-math';
import type { PartStatus } from '../src/shared/types';

function part(
  status: PartStatus,
  qty: number,
  unitCostMinor: number | null,
  currency = 'USD',
): { status: PartStatus; qty: number; unitCostMinor: number | null; currency: string } {
  return { status, qty, unitCostMinor, currency };
}

describe('parseMoney', () => {
  it('reads prices into cents', () => {
    expect(parseMoney('8.50')).toBe(850);
    expect(parseMoney('8')).toBe(800);
    expect(parseMoney('8.5')).toBe(850);
    expect(parseMoney('8.')).toBe(800);
    expect(parseMoney('.99')).toBe(99);
    expect(parseMoney('0')).toBe(0);
    expect(parseMoney('1,299.99')).toBe(129999);
    expect(parseMoney('12,345,678')).toBe(1234567800);
    expect(parseMoney('  4.20 ')).toBe(420);
  });

  it('ignores a leading currency symbol', () => {
    expect(parseMoney('$8.50')).toBe(850);
    expect(parseMoney('€ 3')).toBe(300);
  });

  it('returns null for an empty price', () => {
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('   ')).toBeNull();
  });

  it('returns undefined for text that is not a price', () => {
    for (const bad of ['abc', '8.505', '-3', '1,29', '1,2345', '.', '$', '8 50', '1e3', '0x10']) {
      expect(parseMoney(bad), bad).toBeUndefined();
    }
  });

  it('round-trips through centsToInput', () => {
    for (const cents of [0, 5, 99, 850, 129999]) {
      expect(parseMoney(centsToInput(cents))).toBe(cents);
    }
    expect(centsToInput(null)).toBe('');
    expect(centsToInput(805)).toBe('8.05');
  });
});

describe('parseQty / normalizeCurrency', () => {
  it('accepts whole numbers only', () => {
    expect(parseQty('4')).toBe(4);
    expect(parseQty(' 12 ')).toBe(12);
    expect(parseQty('0')).toBe(0);
    expect(parseQty('1.5')).toBeUndefined();
    expect(parseQty('-1')).toBeUndefined();
    expect(parseQty('')).toBeUndefined();
  });

  it('upper-cases currency codes', () => {
    expect(normalizeCurrency(' eur ')).toBe('EUR');
  });
});

describe('formatMoney', () => {
  it('formats cents with Intl', () => {
    expect(formatMoney(850, 'USD', 'en-US')).toBe('$8.50');
    expect(formatMoney(129999, 'USD', 'en-US')).toBe('$1,299.99');
    expect(formatMoney(800, 'EUR', 'en-US')).toBe('€8.00');
  });

  it('falls back for a malformed currency code', () => {
    expect(formatMoney(850, 'dollars', 'en-US')).toBe('8.50 dollars');
  });
});

describe('lineTotal', () => {
  it('multiplies quantity by the price of one', () => {
    expect(lineTotal({ qty: 4, unitCostMinor: 800 })).toBe(3200);
    expect(lineTotal({ qty: 0, unitCostMinor: 800 })).toBe(0);
  });

  it('is null when the price is unknown', () => {
    expect(lineTotal({ qty: 4, unitCostMinor: null })).toBeNull();
  });
});

describe('totals', () => {
  it('never adds different currencies together', () => {
    const totals = totalsByCurrency([
      part('needed', 2, 500, 'USD'),
      part('needed', 1, 1000, 'EUR'),
      part('installed', 3, 100, 'USD'),
      part('needed', 5, null, 'GBP'),
    ]);
    expect(totals).toEqual([
      { currency: 'USD', minor: 1300 },
      { currency: 'EUR', minor: 1000 },
    ]);
    expect(formatAmounts(totals, 'en-US')).toBe('$13.00 + €10.00');
  });

  it('is empty for an empty bin', () => {
    expect(totalsByCurrency([])).toEqual([]);
    expect(formatAmounts([], 'en-US')).toBe('');
  });
});

describe('summarizeParts', () => {
  it('counts statuses and what is left to spend', () => {
    const summary = summarizeParts([
      part('needed', 4, 800),
      part('needed', 1, null),
      part('ordered', 2, 1500),
      part('arrived', 1, 2000, 'EUR'),
      part('installed', 1, 300),
      part('installed', 0, null),
    ]);
    expect(summary).toEqual({
      count: 6,
      installed: 2,
      missing: 3,
      toOrder: 2,
      unpriced: 1,
      total: [
        { currency: 'USD', minor: 3200 + 3000 + 300 },
        { currency: 'EUR', minor: 2000 },
      ],
      toSpend: [{ currency: 'USD', minor: 3200 }],
    });
  });

  it('handles an empty bin', () => {
    expect(summarizeParts([])).toEqual({
      count: 0,
      installed: 0,
      missing: 0,
      toOrder: 0,
      unpriced: 0,
      total: [],
      toSpend: [],
    });
  });
});

describe('supplier links', () => {
  it('adds https:// when the scheme is missing', () => {
    expect(normalizeUrl('shop.com/servo')).toBe('https://shop.com/servo');
    expect(normalizeUrl(' http://shop.com ')).toBe('http://shop.com');
    expect(normalizeUrl('HTTPS://Shop.com')).toBe('HTTPS://Shop.com');
    expect(normalizeUrl('  ')).toBeNull();
  });

  it('shows the host without www', () => {
    expect(hostOf('https://www.adafruit.com/product/123')).toBe('adafruit.com');
    expect(hostOf('https://shop.example.co.uk/x?y=1')).toBe('shop.example.co.uk');
    expect(hostOf('not a url')).toBe('not a url');
  });
});
