// Turns activity events into the sentences shown on a project's timeline. Event payloads hold
// ids and field names only (never note text), so note/link labels look the entry up instead.
import type { ActivityEvent, Entry, Id } from '../../shared/types';

/** Longest note/link snippet shown on one timeline row before it is cut with an ellipsis. */
export const SNIPPET_MAX = 48;

// Payload field names are storage keys; users think in the words the edit dialog uses.
const FIELD_LABEL: Record<string, string> = {
  title: 'title',
  status: 'status',
  worldIds: 'worlds',
  path: 'folder',
};

export function truncate(text: string, max = SNIPPET_MAX): string {
  const clean = text.trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

/** A note's title, or its first non-empty line when it has none. */
export function noteSnippet(entry: Entry): string {
  if (entry.title.trim()) return truncate(entry.title);
  const firstLine = entry.body.split('\n').find((line) => line.trim() !== '') ?? '';
  return truncate(firstLine);
}

function stringList(value: ActivityEvent['payload'][string]): string[] {
  return Array.isArray(value) ? value : [];
}

export function timelineLabel(event: ActivityEvent, entries: ReadonlyMap<Id, Entry>): string {
  const entry =
    typeof event.payload.entryId === 'string' ? entries.get(event.payload.entryId) : undefined;

  switch (event.type) {
    case 'project_created':
      if (event.payload.source === 'scan') return 'Imported from a folder scan';
      if (event.payload.source === 'sample') return 'Added as a sample';
      if (event.payload.source === 'ignite') return 'Created from a blueprint';
      return 'Project created';
    case 'project_updated': {
      const fields = stringList(event.payload.fields).map((f) => FIELD_LABEL[f] ?? f);
      return fields.length > 0 ? `Edited ${fields.join(', ')}` : 'Edited';
    }
    case 'project_archived':
      return 'Archived';
    case 'project_restored':
      return 'Restored';
    case 'project_paused':
      return 'Paused';
    case 'project_resumed':
      return 'Resumed';
    case 'note_added': {
      const snippet = entry ? noteSnippet(entry) : '';
      return snippet ? `Note added: ${snippet}` : 'Note added';
    }
    case 'link_added': {
      const snippet = entry ? truncate(entry.title) : '';
      return snippet ? `Link added: ${snippet}` : 'Link added';
    }
    case 'checklist_added': {
      const snippet = entry ? truncate(entry.title) : '';
      return snippet ? `Checklist added: ${snippet}` : 'Checklist added';
    }
    case 'file_attached': {
      const snippet = entry ? truncate(entry.title) : '';
      const noun = entry?.type === 'image' ? 'Image' : 'File';
      return snippet ? `${noun} added: ${snippet}` : `${noun} added`;
    }
    case 'part_added':
      return 'Part added';
    case 'part_status_changed':
      return typeof event.payload.to === 'string'
        ? `Part marked ${event.payload.to}`
        : 'Part updated';
    case 'zone_added':
      return 'Zone added in the Lab';
    case 'lab_item_removed':
      return 'Removed something from the Lab';
    case 'opened_in_editor':
      return 'Opened in the editor';
    default: {
      // Keeps the switch exhaustive: a new event type fails typecheck until it gets a label.
      const unknown: never = event.type;
      return String(unknown).replace(/_/g, ' ');
    }
  }
}

/** Index entries by id once per render so labelling a long timeline stays O(n). */
export function entriesById(entries: readonly Entry[]): Map<Id, Entry> {
  return new Map(entries.map((e) => [e.id, e]));
}
