// The plain card every Lab object sits in, plus the four connection handles.
import { Handle, Position } from '@xyflow/react';
import type { ReactNode } from 'react';

const SIDES = [
  ['t', Position.Top],
  ['r', Position.Right],
  ['b', Position.Bottom],
  ['l', Position.Left],
] as const;

/**
 * One handle per side, all "source": the canvas runs in loose mode so a line can start or end
 * on any side, and lines pick their sides from where the objects are (see facingSides).
 */
export function Handles() {
  return (
    <>
      {SIDES.map(([id, position]) => (
        <Handle key={id} id={id} type="source" position={position} className="lab-handle" />
      ))}
    </>
  );
}

export function LabFrame({
  label,
  glyph,
  accent,
  selected,
  className = '',
  onDoubleClick,
  children,
}: {
  label: string;
  glyph: string;
  /** Any CSS colour; tints only the small type glyph so the card itself stays neutral. */
  accent: string;
  selected: boolean;
  className?: string;
  onDoubleClick?: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className={`group relative rounded-lg border bg-surface shadow-card transition-[border-color,box-shadow] ${
        selected ? 'border-accent ring-2 ring-accent/35' : 'border-line hover:border-line-strong'
      } ${className}`}
      onDoubleClick={onDoubleClick}
    >
      <Handles />
      <div className="flex items-center gap-1.5 px-3 pt-2 text-[11px] font-medium text-muted">
        <span aria-hidden style={{ color: accent }}>
          {glyph}
        </span>
        {label}
      </div>
      {children}
    </div>
  );
}
