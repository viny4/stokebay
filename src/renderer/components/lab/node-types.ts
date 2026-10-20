// Defined once at module level: React Flow re-creates every node if this object changes.
import type { NodeTypes } from '@xyflow/react';
import { ChecklistNode } from './ChecklistNode';
import { FileNode } from './FileNode';
import { ImageNode } from './ImageNode';
import { LinkNode } from './LinkNode';
import { NoteNode } from './NoteNode';
import { PartNode } from './PartNode';
import { ZoneNode } from './ZoneNode';

export const nodeTypes: NodeTypes = {
  note: NoteNode,
  checklist: ChecklistNode,
  link: LinkNode,
  image: ImageNode,
  file: FileNode,
  part: PartNode,
  zone: ZoneNode,
};
