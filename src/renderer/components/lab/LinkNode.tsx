import type { NodeProps } from '@xyflow/react';
import { memo } from 'react';
import { guard, useHud } from '../../store/useHud';
import { hostOf } from './lab-geometry';
import type { LinkNode as LinkNodeType } from './lab-nodes';
import { LabFrame } from './LabFrame';

const ACCENT = 'var(--idea)';

function LinkNodeView({ data, selected }: NodeProps<LinkNodeType>) {
  const { entry } = data;
  const host = hostOf(entry.url);
  const open = () => guard(() => useHud.getState().openLink(entry.id));

  return (
    <LabFrame label="Link" glyph="↗" accent={ACCENT} selected={selected} className="w-60">
      {/* The text is the open button; the frame around it stays a drag handle. */}
      <button
        type="button"
        onClick={open}
        title={entry.url ?? undefined}
        aria-label={`Open ${entry.title || host} in the browser`}
        className="nodrag block w-full px-3 pt-1 pb-3 text-left"
      >
        <span className="block truncate font-medium text-sm text-ink underline-offset-2 hover:underline">
          {entry.title || host}
        </span>
        <span className="block truncate text-xs text-muted">{host}</span>
      </button>
    </LabFrame>
  );
}

export const LinkNode = memo(LinkNodeView);
