import type { NodeProps } from '@xyflow/react';
import { memo } from 'react';
import type { PartNode as PartNodeType } from './lab-nodes';
import { Handles } from './LabFrame';
import { PartCard } from './PartCard';

// PartCard (owned by the Parts Bin) draws the card so the bin and the canvas look the same;
// this node only adds the connection handles around it.
function PartNodeView({ data, selected }: NodeProps<PartNodeType>) {
  return (
    <div className="relative min-h-10 min-w-40">
      <Handles />
      <PartCard part={data.part} selected={selected} />
    </div>
  );
}

export const PartNode = memo(PartNodeView);
