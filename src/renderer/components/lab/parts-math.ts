// Money, counts and small text helpers for the Parts Bin. Kept pure so the panel and the
// canvas card always agree and the arithmetic is unit tested. Amounts are integer hundredths
// of the currency (cents), never floats, and different currencies are never added together.
import type { Part, PartStatus } from '../../../shared/types';

/**
 * Status colours as hex (callers may add alpha). Mid-tone and muted so they read on both the
 * light and dark themes; the UI uses them for small dots and thin bars only.
 */
export const PART_STATUS_HEX: Record<PartStatus, string> = {
  needed: '#c8862a',
  ordered: '#4f86c0',
  arrived: '#8a8580',
  installed: '#3d9a66',
};

export const PART_STATUS_LABEL: Record<PartStatus, string> = {
  needed: 'Needed',
  ordered: 'Ordered',
  arrived: 'Arrived',
  installed: 'Installed',
};

// Whole part: plain digits or properly grouped thousands ("1,299"), so "1,29" is rejected
// rather than silently read as 129.
const MONEY = /^(\d{1,3}(?:,\d{3})+|\d+)?(?:\.(\d{0,2}))?$/;

/**
 * Reads a typed price into cents. `null` means "no price" (empty input); `undefined` means
 * the text isn't a price, so the UI can show an error instead of guessing.
 */
export function parseMoney(input: string): number | null | undefined {
  // People often type the symbol they see on the shop page; it carries no extra meaning here.
  const text = input.trim().replace(/^[$€£¥₹]\s*/, '');
  if (text === '') return input.trim() === '' ? null : undefined;
  const match = MONEY.exec(text);
  if (!match || (match[1] === undefined && !match[2])) return undefined;
  const whole = Number((match[1] ?? '0').replace(/,/g, ''));
  const fraction = Number((match[2] ?? '').padEnd(2, '0'));
  const cents = whole * 100 + fraction;
  return Number.isSafeInteger(cents) ? cents : undefined;
}

/** Cents back into editable text ("8.50"), without grouping so it parses again unchanged. */
export function centsToInput(cents: number | null): string {
  if (cents === null) return '';
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

/** A typed quantity: a whole number, or `undefined` when it isn't one. */
export function parseQty(input: string): number | undefined {
  const text = input.trim();
  return /^\d+$/.test(text) ? Number(text) : undefined;
}

export function normalizeCurrency(input: string): string {
  return input.trim().toUpperCase();
}

const formatters = new Map<string, Intl.NumberFormat>();

/** Formats cents in the user's locale; formatters are cached because tables call this a lot. */
export function formatMoney(cents: number, currency: string, locale?: string): string {
  const key = `${locale ?? ''}|${currency}`;
  let format = formatters.get(key);
  if (!format) {
    try {
      format = new Intl.NumberFormat(locale, { style: 'currency', currency });
    } catch {
      // A malformed code (only possible from old or hand-edited data) shouldn't break the view.
      return `${centsToInput(cents)} ${currency}`;
    }
    formatters.set(key, format);
  }
  return format.format(cents / 100);
}

/** Qty × price of one, or null when the price is unknown. */
export function lineTotal(part: Pick<Part, 'qty' | 'unitCostMinor'>): number | null {
  return part.unitCostMinor === null ? null : part.qty * part.unitCostMinor;
}

export interface CurrencyAmount {
  currency: string;
  minor: number;
}

type PricedFields = Pick<Part, 'qty' | 'unitCostMinor' | 'currency'>;

/** Sums line totals per currency, in order of first appearance; unpriced parts are skipped. */
export function totalsByCurrency(parts: readonly PricedFields[]): CurrencyAmount[] {
  const sums = new Map<string, number>();
  for (const part of parts) {
    const total = lineTotal(part);
    if (total === null) continue;
    sums.set(part.currency, (sums.get(part.currency) ?? 0) + total);
  }
  return [...sums].map(([currency, minor]) => ({ currency, minor }));
}

export interface PartsSummary {
  /** Rows in the bin (a row of 4 servos counts once, like its status). */
  count: number;
  installed: number;
  /** Not in hand yet: needed or ordered. */
  missing: number;
  /** Still to buy: needed only. */
  toOrder: number;
  /** Rows with a quantity but no price, so totals are known to be incomplete. */
  unpriced: number;
  total: CurrencyAmount[];
  /** Cost of the parts still to order. */
  toSpend: CurrencyAmount[];
}

export function summarizeParts(
  parts: readonly (PricedFields & Pick<Part, 'status'>)[],
): PartsSummary {
  const needed = parts.filter((p) => p.status === 'needed');
  return {
    count: parts.length,
    installed: parts.filter((p) => p.status === 'installed').length,
    missing: parts.filter((p) => p.status === 'needed' || p.status === 'ordered').length,
    toOrder: needed.length,
    unpriced: parts.filter((p) => p.unitCostMinor === null && p.qty > 0).length,
    total: totalsByCurrency(parts),
    toSpend: totalsByCurrency(needed),
  };
}

/** "$12.00 + €4.50"; never a single number across currencies. */
export function formatAmounts(amounts: readonly CurrencyAmount[], locale?: string): string {
  return amounts.map((a) => formatMoney(a.minor, a.currency, locale)).join(' + ');
}

/** Shop address as people recognise it ("amazon.com"), falling back to the raw text. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '') || url;
  } catch {
    return url;
  }
}

/** Typed supplier link: empty → null; "shop.com/x" → "https://shop.com/x". */
export function normalizeUrl(input: string): string | null {
  const text = input.trim();
  if (text === '') return null;
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
}
