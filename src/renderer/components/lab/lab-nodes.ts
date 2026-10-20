// Turns the stored Lab (canvas nodes joined to entries, parts and modules) into React Flow
// nodes and edges. Kept free of React so the canvas only does event wiring.
import type { Edge, Node } from '@xyflow/react';
import type { Entry, LabData, Module, Part } from '../../../shared/types';
import {
  DEFAULT_OBJECT_SIZE,
  containingZone,
  facingSides,
  type Rect,
  type ZoneRect,
} from './lab-geometry';

export type EntryNodeData = { entry: Entry; autoEdit: boolean };
export type PartNodeData = { part: Part };
export type ZoneNodeData = { module: Module; autoEdit: boolean };

export type NoteNode = Node<EntryNodeData, 'note'>;
export type ChecklistNode = Node<EntryNodeData, 'checklist'>;
export type LinkNode = Node<EntryNodeData, 'link'>;
export type ImageNode = Node<EntryNodeData, 'image'>;
export type FileNode = Node<EntryNodeData, 'file'>;
export type PartNode = Node<PartNodeData, 'part'>;
export type ZoneNode = Node<ZoneNodeData, 'zone'>;

export type LabNode =
  NoteNode | ChecklistNode | LinkNode | ImageNode | FileNode | PartNode | ZoneNode;

/**
 * Zones sit far below everything else. React Flow lifts a selected node by 1000, so this keeps
 * a selected zone behind unselected objects too.
 */
const ZONE_Z = -2000;

/**
 * Builds nodes for the current Lab. `previous` carries over what only React Flow knows
 * (selection and measured size); dropping `measured` would hide every node for a frame
 * while it is measured again.
 */
export function buildNodes(lab: LabData, previous: LabNode[], freshId: string | null): LabNode[] {
  const prev = new Map(previous.map((n) => [n.id, n]));
  const entries = new Map(lab.entries.map((e) => [e.id, e]));
  const parts = new Map(lab.parts.map((p) => [p.id, p]));
  const modules = new Map(lab.modules.map((m) => [m.id, m]));
  const out: LabNode[] = [];

  for (const n of lab.nodes) {
    const old = prev.get(n.id);
    const base = {
      id: n.id,
      position: { x: n.x, y: n.y },
      selected: old?.selected ?? false,
      ...(old?.measured ? { measured: old.measured } : {}),
    };
    if (n.refType === 'module') {
      const module = modules.get(n.refId);
      if (!module) continue;
      out.push({
        ...base,
        type: 'zone',
        width: n.w ?? 380,
        height: n.h ?? 280,
        zIndex: ZONE_Z,
        data: { module, autoEdit: n.id === freshId },
      });
    } else if (n.refType === 'part') {
      const part = parts.get(n.refId);
      if (!part) continue;
      out.push({ ...base, type: 'part', data: { part } });
    } else {
      const entry = entries.get(n.refId);
      if (!entry) continue;
      out.push({
        ...base,
        type: entry.type,
        data: { entry, autoEdit: n.id === freshId },
      } as LabNode);
    }
  }
  return out;
}

export function nodeRect(node: LabNode): Rect {
  return {
    x: node.position.x,
    y: node.position.y,
    w: node.measured?.width ?? node.width ?? DEFAULT_OBJECT_SIZE.w,
    h: node.measured?.height ?? node.height ?? DEFAULT_OBJECT_SIZE.h,
  };
}

export function zoneRects(nodes: LabNode[]): ZoneRect[] {
  return nodes
    .filter((n): n is ZoneNode => n.type === 'zone')
    .map((n) => ({ ...nodeRect(n), moduleId: n.data.module.id }));
}

/** The module id of the zone holding this object's centre, or null. */
export function zoneOf(node: LabNode, zones: ZoneRect[]): string | null {
  return containingZone(nodeRect(node), zones);
}

export function buildEdges(lab: LabData, nodes: LabNode[], selected: ReadonlySet<string>): Edge[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges: Edge[] = [];
  for (const e of lab.edges) {
    const from = byId.get(e.fromNodeId);
    const to = byId.get(e.toNodeId);
    if (!from || !to) continue;
    const sides = facingSides(nodeRect(from), nodeRect(to));
    edges.push({
      id: e.id,
      source: e.fromNodeId,
      target: e.toNodeId,
      sourceHandle: sides.source,
      targetHandle: sides.target,
      selected: selected.has(e.id),
      className: 'lab-edge',
    });
  }
  return edges;
}

/** The first node in `next` that wasn't in `before`: the object an action just created. */
export function newNodeId(before: LabData | null, next: LabData | null): string | null {
  if (!next) return null;
  const known = new Set(before?.nodes.map((n) => n.id) ?? []);
  return next.nodes.find((n) => !known.has(n.id))?.id ?? null;
}
