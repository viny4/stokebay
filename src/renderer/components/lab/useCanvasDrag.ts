// Dragging on the Lab canvas: zones carry the objects inside them, and when the user lets go
// every changed position (plus which zone each object ended up in) is saved in one call.
import { useCallback, useRef, type Dispatch, type SetStateAction } from 'react';
import { labMoveNodesInput } from '../../../shared/schemas';
import type { CanvasNode, Id } from '../../../shared/types';
import { guard, useHud } from '../../store/useHud';
import type { Point } from './lab-geometry';
import { nodeRect, zoneOf, zoneRects, type LabNode } from './lab-nodes';

interface DragState {
  /** Where each dragged zone started. */
  zoneStarts: Map<Id, Point>;
  /** Objects riding along with a dragged zone: which zone, and where they started. */
  riders: Map<Id, { zoneNodeId: Id; start: Point }>;
}

type Move = { nodeId: Id; x: number; y: number; w?: number; h?: number; moduleId?: Id | null };

const MAX_MOVES_PER_CALL = 500;

export function useCanvasDrag(
  projectId: Id,
  getNodes: () => LabNode[],
  setNodes: Dispatch<SetStateAction<LabNode[]>>,
) {
  const drag = useRef<DragState | null>(null);

  const onDragStart = useCallback(
    (dragged: LabNode[]) => {
      const all = getNodes();
      const draggedIds = new Set(dragged.map((n) => n.id));
      const zoneByModule = new Map<Id, Id>();
      const zoneStarts = new Map<Id, Point>();
      for (const n of dragged) {
        if (n.type !== 'zone') continue;
        zoneByModule.set(n.data.module.id, n.id);
        zoneStarts.set(n.id, { ...n.position });
      }
      const riders = new Map<Id, { zoneNodeId: Id; start: Point }>();
      if (zoneByModule.size > 0) {
        // Membership by where things are, so what looks inside a zone is what moves with it.
        const zones = zoneRects(all);
        for (const n of all) {
          if (n.type === 'zone' || draggedIds.has(n.id)) continue;
          const moduleId = zoneOf(n, zones);
          const zoneNodeId = moduleId ? zoneByModule.get(moduleId) : undefined;
          if (zoneNodeId) riders.set(n.id, { zoneNodeId, start: { ...n.position } });
        }
      }
      drag.current = { zoneStarts, riders };
    },
    [getNodes],
  );

  const onDrag = useCallback(
    (dragged: LabNode[]) => {
      const state = drag.current;
      if (!state || state.riders.size === 0) return;
      const deltas = zoneDeltas(state, dragged);
      setNodes((prev) =>
        prev.map((n) => {
          const rider = state.riders.get(n.id);
          const d = rider ? deltas.get(rider.zoneNodeId) : undefined;
          if (!rider || !d) return n;
          return { ...n, position: { x: rider.start.x + d.x, y: rider.start.y + d.y } };
        }),
      );
    },
    [setNodes],
  );

  const onDragStop = useCallback(
    (dragged: LabNode[]) => {
      const state = drag.current;
      drag.current = null;
      if (!state) return;
      const deltas = zoneDeltas(state, dragged);
      const finalPos = new Map<Id, Point>(dragged.map((n) => [n.id, n.position]));
      for (const [id, rider] of state.riders) {
        const d = deltas.get(rider.zoneNodeId);
        if (d) finalPos.set(id, { x: rider.start.x + d.x, y: rider.start.y + d.y });
      }
      const all = getNodes().map((n) => {
        const p = finalPos.get(n.id);
        return p ? ({ ...n, position: p } as LabNode) : n;
      });
      const zones = zoneRects(all);
      const stored = new Map(
        (useHud.getState().lab?.nodes ?? []).map((n): [Id, CanvasNode] => [n.id, n]),
      );

      const moves: Move[] = [];
      for (const n of all) {
        if (!finalPos.has(n.id)) continue;
        const x = Math.round(n.position.x);
        const y = Math.round(n.position.y);
        if (n.type === 'zone') {
          const rect = nodeRect(n);
          const w = Math.max(40, Math.round(rect.w));
          const h = Math.max(40, Math.round(rect.h));
          const old = stored.get(n.id);
          if (old && old.x === x && old.y === y && old.w === w && old.h === h) continue;
          moves.push({ nodeId: n.id, x, y, w, h });
        } else {
          const old = stored.get(n.id);
          if (old && old.x === x && old.y === y) continue;
          moves.push({ nodeId: n.id, x, y, moduleId: zoneOf(n, zones) });
        }
      }
      saveMoves(projectId, moves);
    },
    [getNodes, projectId],
  );

  /** True while a drag is under way, so a background re-sync doesn't yank nodes back. */
  const isDragging = useCallback(() => drag.current !== null, []);

  return { onDragStart, onDrag, onDragStop, isDragging };
}

function zoneDeltas(state: DragState, dragged: LabNode[]): Map<Id, Point> {
  const deltas = new Map<Id, Point>();
  for (const n of dragged) {
    const start = state.zoneStarts.get(n.id);
    if (start) deltas.set(n.id, { x: n.position.x - start.x, y: n.position.y - start.y });
  }
  return deltas;
}

/** Saves positions, splitting only if a huge selection exceeds what one call accepts. */
export function saveMoves(projectId: Id, moves: Move[]): void {
  if (moves.length === 0) return;
  guard(async () => {
    try {
      for (let i = 0; i < moves.length; i += MAX_MOVES_PER_CALL) {
        const parsed = labMoveNodesInput.safeParse({
          projectId,
          moves: moves.slice(i, i + MAX_MOVES_PER_CALL),
        });
        if (!parsed.success) throw new Error("Couldn't save where those objects are.");
        await useHud.getState().runLab(() => window.api.labMoveNodes(parsed.data));
      }
    } catch (err) {
      // Put the objects back where they are saved, so the screen never shows unsaved spots.
      const lab = useHud.getState().lab;
      if (lab) useHud.setState({ lab: { ...lab } });
      throw err;
    }
  });
}

/** Position saves for objects moved with the arrow keys (zone membership included). */
export function movesFor(nodes: LabNode[], all: LabNode[]): Move[] {
  const zones = zoneRects(all);
  return nodes.map((n) => {
    const x = Math.round(n.position.x);
    const y = Math.round(n.position.y);
    return n.type === 'zone'
      ? { nodeId: n.id, x, y }
      : { nodeId: n.id, x, y, moduleId: zoneOf(n, zones) };
  });
}
