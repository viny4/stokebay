import { NodeResizer, type NodeProps, type OnResizeEnd } from '@xyflow/react';
import { memo, useCallback, useEffect, useState } from 'react';
import { labMoveNodesInput, labRenameZoneInput } from '../../../shared/schemas';
import { guard, useHud } from '../../store/useHud';
import { firstIssue } from './lab-actions';
import type { ZoneNode as ZoneNodeType } from './lab-nodes';
import { Handles } from './LabFrame';

const DEFAULT_COLOR = '#4f7cac';
export const ZONE_MIN = { w: 160, h: 100 };

function ZoneNodeView({ id, data, selected }: NodeProps<ZoneNodeType>) {
  const { module, autoEdit } = data;
  const color = module.color && /^#[0-9a-f]{6}$/i.test(module.color) ? module.color : DEFAULT_COLOR;
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(module.title);

  useEffect(() => {
    if (autoEdit) {
      setTitle(module.title);
      setEditing(true);
    }
    // Only when the flag turns on; a later rename must not reopen the editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEdit]);

  const commit = () => {
    setEditing(false);
    if (title.trim() === module.title) return;
    const parsed = labRenameZoneInput.safeParse({ id: module.id, title });
    if (!parsed.success) {
      useHud.getState().showToast(firstIssue(parsed.error), 'error');
      return;
    }
    guard(() => useHud.getState().runLab(() => window.api.labRenameZone(parsed.data)));
  };

  // Resizing is saved once, when the user lets go.
  const onResizeEnd = useCallback<OnResizeEnd>(
    (_event, params) => {
      const parsed = labMoveNodesInput.safeParse({
        projectId: module.projectId,
        moves: [
          {
            nodeId: id,
            x: Math.round(params.x),
            y: Math.round(params.y),
            w: Math.round(params.width),
            h: Math.round(params.height),
          },
        ],
      });
      if (!parsed.success) return;
      guard(() => useHud.getState().runLab(() => window.api.labMoveNodes(parsed.data)));
    },
    [id, module.projectId],
  );

  return (
    <div
      className={`relative h-full w-full rounded-xl border transition-[border-color,box-shadow] ${
        selected ? 'border-accent ring-2 ring-accent/25' : 'border-line-strong'
      }`}
      style={{ background: 'color-mix(in srgb, var(--sunken) 55%, transparent)' }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={ZONE_MIN.w}
        minHeight={ZONE_MIN.h}
        color="var(--accent)"
        onResizeEnd={onResizeEnd}
      />
      <Handles />
      <div className="absolute top-2 left-3 flex max-w-[calc(100%-1.5rem)] items-center gap-2 text-xs font-medium text-ink">
        {/* The zone's own colour, kept to a small dot so the canvas stays calm. */}
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
        {editing ? (
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') {
                setTitle(module.title);
                setEditing(false);
              }
            }}
            aria-label="Zone name"
            maxLength={60}
            className="nodrag w-44 rounded border border-accent bg-surface px-1.5 py-0.5 text-ink outline-none"
          />
        ) : (
          <span
            className="truncate"
            title="Double-click to rename"
            onDoubleClick={() => {
              setTitle(module.title);
              setEditing(true);
            }}
          >
            {module.title}
          </span>
        )}
      </div>
    </div>
  );
}

export const ZoneNode = memo(ZoneNodeView);
