import { NodeResizer, type NodeProps, type OnResizeEnd } from '@xyflow/react';
import { memo, useCallback, useEffect, useState, type CSSProperties } from 'react';
import { labMoveNodesInput, labRenameZoneInput } from '../../../shared/schemas';
import { guard, useHud } from '../../store/useHud';
import { withAlpha } from '../ui';
import { firstIssue } from './lab-actions';
import type { ZoneNode as ZoneNodeType } from './lab-nodes';
import { Handles } from './LabFrame';

const DEFAULT_COLOR = '#38bdf8';
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
      className="relative h-full w-full"
      style={
        {
          border: `1px dashed ${withAlpha(color, selected ? 0.9 : 0.45)}`,
          background: `linear-gradient(180deg, ${withAlpha(color, 0.09)}, ${withAlpha(color, 0.03)})`,
          boxShadow: selected ? `0 0 24px -4px ${withAlpha(color, 0.5)} inset` : undefined,
        } as CSSProperties
      }
    >
      <NodeResizer
        isVisible={selected}
        minWidth={ZONE_MIN.w}
        minHeight={ZONE_MIN.h}
        color={color}
        onResizeEnd={onResizeEnd}
      />
      <Handles />
      <div
        className="absolute -top-px left-0 flex max-w-full items-center gap-2 px-3 py-1 font-hud text-xs tracking-[0.25em] uppercase"
        style={{
          background: withAlpha(color, 0.16),
          color,
          clipPath: 'polygon(0 0, 100% 0, calc(100% - 10px) 100%, 0 100%)',
        }}
      >
        <span aria-hidden>◇</span>
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
            className="nodrag w-44 bg-black/40 px-1.5 py-0.5 tracking-[0.15em] text-hud-text uppercase outline-none"
          />
        ) : (
          <span
            className="truncate pr-3"
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
