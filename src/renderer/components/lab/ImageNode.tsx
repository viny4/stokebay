import type { NodeProps } from '@xyflow/react';
import { memo, useState } from 'react';
import { mediaUrl } from '../../../shared/ipc';
import { openEntryFile } from './lab-actions';
import type { ImageNode as ImageNodeType } from './lab-nodes';
import { LabFrame } from './LabFrame';

const ACCENT = '#7dd3fc';

function ImageNodeView({ data, selected }: NodeProps<ImageNodeType>) {
  const { entry } = data;
  const [broken, setBroken] = useState(false);

  return (
    <LabFrame
      label="Image"
      glyph="▣"
      accent={ACCENT}
      selected={selected}
      onDoubleClick={() => openEntryFile(entry.id)}
    >
      <div className="px-3 pt-1.5 pb-2.5" title="Double-click to open">
        {broken ? (
          <div className="flex h-24 w-48 items-center justify-center border border-dashed border-hud-line text-xs text-hud-muted">
            Image unavailable
          </div>
        ) : (
          // Not draggable: a native image drag would fight the canvas drag.
          <img
            src={mediaUrl(entry.id)}
            alt={entry.title}
            draggable={false}
            onError={() => setBroken(true)}
            className="block max-h-[260px] max-w-[320px] min-w-24 object-contain"
          />
        )}
        <p className="mt-1.5 max-w-[320px] truncate text-xs text-hud-muted">{entry.title}</p>
      </div>
    </LabFrame>
  );
}

export const ImageNode = memo(ImageNodeView);
