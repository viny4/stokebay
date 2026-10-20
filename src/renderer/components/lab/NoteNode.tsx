import type { NodeProps } from '@xyflow/react';
import { memo, useEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { inputClass } from '../ui';
import { saveItem } from './lab-actions';
import type { NoteNode as NoteNodeType } from './lab-nodes';
import { LabFrame } from './LabFrame';

const ACCENT = 'var(--paused)';

function NoteNodeView({ data, selected }: NodeProps<NoteNodeType>) {
  const { entry, autoEdit } = data;
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(entry.title);
  const [body, setBody] = useState(entry.body);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const startEditing = () => {
    setTitle(entry.title);
    setBody(entry.body);
    setEditing(true);
  };

  // A note made from the toolbar opens straight into editing.
  useEffect(() => {
    if (autoEdit) {
      setTitle(entry.title);
      setBody(entry.body);
      setEditing(true);
    }
    // Only when the flag turns on; later entry changes must not reset a draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEdit]);

  useEffect(() => {
    if (editing) bodyRef.current?.focus();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const nextTitle = title.trim();
    if (nextTitle === entry.title && body === entry.body) return;
    saveItem(entry.id, { title: nextTitle, body });
  };

  // Save when focus leaves the editor, not when it moves between its title and body.
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) commit();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' || (event.key === 'Enter' && (event.metaKey || event.ctrlKey))) {
      event.preventDefault();
      commit();
    }
  };

  return (
    <LabFrame
      label="Note"
      glyph="✎"
      accent={ACCENT}
      selected={selected}
      className="w-64"
      onDoubleClick={editing ? undefined : startEditing}
    >
      {editing ? (
        <div className="flex flex-col gap-2 px-3 pt-1.5 pb-3" onBlur={onBlur} onKeyDown={onKeyDown}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            aria-label="Note title"
            maxLength={200}
            className={`nodrag ${inputClass} py-1 font-medium`}
          />
          <textarea
            ref={bodyRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write anything…"
            aria-label="Note text"
            rows={6}
            className={`nodrag nowheel ${inputClass} resize-y py-1.5`}
          />
        </div>
      ) : (
        <div className="px-3 pt-1 pb-3" title="Double-click to edit">
          {entry.title ? <h3 className="font-medium text-sm text-ink">{entry.title}</h3> : null}
          {entry.body ? (
            <p className="nowheel mt-1 max-h-60 overflow-y-auto text-xs leading-relaxed whitespace-pre-wrap text-muted">
              {entry.body}
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted/60 italic">Double-click to write.</p>
          )}
        </div>
      )}
    </LabFrame>
  );
}

export const NoteNode = memo(NoteNodeView);
