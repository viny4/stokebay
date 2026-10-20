import { memo, type CSSProperties } from 'react';
import type { Part } from '../../../shared/types';
import { withAlpha } from '../ui';
import { PART_STATUS_HEX, PART_STATUS_LABEL, formatMoney, hostOf } from './parts-math';

/**
 * The card a part shows on the Lab canvas. Presentational; the canvas wraps it in a node.
 * Styled like the other Lab objects (LabFrame), with the status colour as its accent so a
 * glance at the canvas shows what's still missing.
 */
// Memoised because canvas nodes re-render on every drag frame while the part rarely changes.
export const PartCard = memo(function PartCard({
  part,
  selected,
}: {
  part: Part;
  selected: boolean;
}) {
  const hex = PART_STATUS_HEX[part.status];
  return (
    <div
      className="hud-frame hud-frame-sm w-[220px] px-3 pt-2 pb-2.5"
      style={
        {
          '--frame-color': selected ? hex : withAlpha(hex, 0.38),
          '--frame-fill': 'var(--color-hud-raised)',
          filter: selected ? `drop-shadow(0 0 10px ${withAlpha(hex, 0.55)})` : undefined,
        } as CSSProperties
      }
    >
      <div
        className="flex items-center gap-1.5 font-hud text-[10px] tracking-[0.25em] uppercase"
        style={{ color: withAlpha(hex, 0.85) }}
      >
        <GearIcon />
        Part
      </div>
      <p className="mt-1 truncate font-hud text-sm text-hud-text" title={part.name}>
        {part.name}
      </p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="truncate font-hud text-[13px] tabular-nums text-hud-text/90">
          {part.qty} ×{' '}
          {part.unitCostMinor === null ? (
            <span className="text-hud-muted">no price</span>
          ) : (
            formatMoney(part.unitCostMinor, part.currency)
          )}
        </span>
        <span
          className="shrink-0 rounded px-2 py-0.5 font-hud text-[11px] tracking-wider uppercase"
          style={{ color: hex, background: withAlpha(hex, 0.14) }}
        >
          {PART_STATUS_LABEL[part.status]}
        </span>
      </div>
      {part.supplierUrl ? (
        <p className="mt-1 truncate text-[11px] text-hud-muted">{hostOf(part.supplierUrl)}</p>
      ) : null}
    </div>
  );
});

/** Marks the card as a physical part, next to notes and links on the canvas. */
function GearIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="6.5" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
    </svg>
  );
}
