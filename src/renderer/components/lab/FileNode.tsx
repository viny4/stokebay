import type { NodeProps } from '@xyflow/react';
import { memo } from 'react';
import { openEntryFile } from './lab-actions';
import { fileTypeLabel, formatBytes } from './lab-geometry';
import type { FileNode as FileNodeType } from './lab-nodes';
import { LabFrame } from './LabFrame';

const ACCENT = '#60a5fa';

function FileNodeView({ data, selected }: NodeProps<FileNodeType>) {
  const { entry } = data;
  const file = entry.file;
  const name = file?.name ?? entry.title;

  return (
    <LabFrame
      label="File"
      glyph="▤"
      accent={ACCENT}
      selected={selected}
      className="w-60"
      onDoubleClick={() => openEntryFile(entry.id)}
    >
      <div className="flex items-center gap-3 px-3 pt-1.5 pb-3" title="Double-click to open">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center border border-hud-line bg-black/30 font-hud text-[10px] text-status-active">
          {fileTypeLabel(name, file?.mime ?? '').slice(0, 4)}
        </span>
        <div className="min-w-0">
          <p className="truncate font-hud text-sm text-hud-text">{name}</p>
          <p className="truncate text-xs text-hud-muted">
            {file ? formatBytes(file.size) : 'Missing file'}
            {file?.storage === 'link' ? ' · linked, not copied' : ''}
          </p>
        </div>
      </div>
    </LabFrame>
  );
}

export const FileNode = memo(FileNodeView);
