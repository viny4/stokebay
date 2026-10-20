import type { NodeProps } from '@xyflow/react';
import { memo, useEffect, useRef, useState } from 'react';
import type { ChecklistItem } from '../../../shared/types';
import { inputClass } from '../ui';
import { saveItem } from './lab-actions';
import { newItemId } from './lab-geometry';
import type { ChecklistNode as ChecklistNodeType } from './lab-nodes';
import { LabFrame } from './LabFrame';

const ACCENT = 'var(--done)';

function ChecklistNodeView({ data, selected }: NodeProps<ChecklistNodeType>) {
  const { entry, autoEdit } = data;
  // Ticks show at once; the saved list replaces this when it comes back.
  const [items, setItems] = useState<ChecklistItem[]>(entry.checklist ?? []);
  const [draft, setDraft] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(entry.title);
  const addRef = useRef<HTMLInputElement>(null);

  useEffect(() => setItems(entry.checklist ?? []), [entry.checklist]);

  // A checklist made from the toolbar is empty, so jump to adding its first item.
  useEffect(() => {
    if (autoEdit) addRef.current?.focus();
  }, [autoEdit]);

  const save = (next: ChecklistItem[]) => {
    setItems(next);
    saveItem(entry.id, { checklist: next });
  };

  const addItem = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    save([...items, { id: newItemId(), text, done: false }]);
  };

  const commitTitle = () => {
    setEditingTitle(false);
    const next = title.trim();
    if (next !== entry.title) saveItem(entry.id, { title: next });
  };

  const done = items.filter((i) => i.done).length;

  return (
    <LabFrame label="Checklist" glyph="☑" accent={ACCENT} selected={selected} className="w-64">
      <div className="px-3 pt-1 pb-3">
        <div className="flex items-baseline justify-between gap-2">
          {editingTitle ? (
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
              }}
              aria-label="Checklist title"
              maxLength={200}
              className={`nodrag ${inputClass} py-1 font-medium`}
            />
          ) : (
            <h3
              className="font-medium text-sm text-ink"
              title="Double-click to rename"
              onDoubleClick={() => {
                setTitle(entry.title);
                setEditingTitle(true);
              }}
            >
              {entry.title || 'Checklist'}
            </h3>
          )}
          <span className="shrink-0 text-[11px] tabular-nums text-muted">
            {done}/{items.length} done
          </span>
        </div>

        {items.length > 0 ? (
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-sunken" aria-hidden>
            <div
              className="h-full rounded-full bg-status-done transition-[width]"
              style={{ width: `${(done / items.length) * 100}%` }}
            />
          </div>
        ) : null}

        <ul className="nowheel mt-2 max-h-64 space-y-1 overflow-y-auto">
          {items.map((item) => (
            <li key={item.id} className="group/item flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                checked={item.done}
                onChange={() =>
                  save(items.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)))
                }
                aria-label={item.text}
                className="nodrag mt-0.5 accent-status-done"
              />
              <span
                className={`flex-1 break-words ${item.done ? 'text-muted line-through' : 'text-ink'}`}
              >
                {item.text}
              </span>
              <button
                type="button"
                aria-label={`Remove “${item.text}”`}
                onClick={() => save(items.filter((i) => i.id !== item.id))}
                className="nodrag px-1 text-muted opacity-0 group-hover/item:opacity-100 hover:text-danger focus-visible:opacity-100"
              >
                ×
              </button>
            </li>
          ))}
        </ul>

        <input
          ref={addRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addItem();
            if (e.key === 'Escape') e.currentTarget.blur();
          }}
          onBlur={addItem}
          placeholder="+ Add item"
          aria-label="Add checklist item"
          maxLength={300}
          className={`nodrag mt-2 ${inputClass} py-1 text-xs`}
        />
      </div>
    </LabFrame>
  );
}

export const ChecklistNode = memo(ChecklistNodeView);
