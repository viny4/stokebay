// The cut-corner card every Lab object sits in, plus the four connection handles.
import { Handle, Position } from '@xyflow/react';
import type { CSSProperties, ReactNode } from 'react';
import { withAlpha } from '../ui';

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
  /** `#rrggbb`, so the glow can add alpha. */
  accent: string;
  selected: boolean;
  className?: string;
  onDoubleClick?: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className={`hud-frame hud-frame-sm group ${className}`}
      style={
        {
          '--frame-color': selected ? accent : withAlpha(accent, 0.38),
          '--frame-fill': 'var(--color-hud-raised)',
          filter: selected ? `drop-shadow(0 0 10px ${withAlpha(accent, 0.55)})` : undefined,
        } as CSSProperties
      }
      onDoubleClick={onDoubleClick}
    >
      <Handles />
      <div
        className="flex items-center gap-1.5 px-3 pt-2 font-hud text-[10px] tracking-[0.25em] uppercase"
        style={{ color: withAlpha(accent, 0.85) }}
      >
        <span aria-hidden>{glyph}</span>
        {label}
      </div>
      {children}
    </div>
  );
}
