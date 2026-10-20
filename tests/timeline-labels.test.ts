import { describe, expect, it } from 'vitest';
import {
  SNIPPET_MAX,
  entriesById,
  noteSnippet,
  timelineLabel,
  truncate,
} from '../src/renderer/components/timeline-labels';
import type { ActivityEvent, Entry } from '../src/shared/types';

function event(type: ActivityEvent['type'], payload: ActivityEvent['payload'] = {}): ActivityEvent {
  return { id: `ev-${type}`, type, projectId: 'p1', payload, createdAt: 0 };
}

function entry(partial: Partial<Entry> & Pick<Entry, 'id'>): Entry {
  return {
    projectId: 'p1',
    type: 'note',
    title: '',
    body: '',
    url: null,
    checklist: null,
    file: null,
    moduleId: null,
    createdAt: 0,
    ...partial,
  };
}

const none = entriesById([]);

describe('timelineLabel', () => {
  it('names where a project came from', () => {
    expect(timelineLabel(event('project_created', { source: 'manual' }), none)).toBe(
      'Project created',
    );
    expect(timelineLabel(event('project_created', { source: 'scan' }), none)).toBe(
      'Imported from a folder scan',
    );
    expect(timelineLabel(event('project_created', { source: 'sample' }), none)).toBe(
      'Added as a sample',
    );
    expect(timelineLabel(event('project_created'), none)).toBe('Project created');
  });

  it('lists edited fields in user words', () => {
    expect(timelineLabel(event('project_updated', { fields: ['title', 'worldIds'] }), none)).toBe(
      'Edited title, worlds',
    );
    expect(timelineLabel(event('project_updated', { fields: ['path', 'status'] }), none)).toBe(
      'Edited folder, status',
    );
    expect(timelineLabel(event('project_updated', { fields: ['somethingNew'] }), none)).toBe(
      'Edited somethingNew',
    );
    expect(timelineLabel(event('project_updated'), none)).toBe('Edited');
  });

  it('labels lifecycle events', () => {
    expect(timelineLabel(event('project_archived'), none)).toBe('Archived');
    expect(timelineLabel(event('project_restored'), none)).toBe('Restored');
    expect(timelineLabel(event('project_paused', { pauseId: 'x' }), none)).toBe('Paused');
    expect(timelineLabel(event('project_resumed', { pauseId: null }), none)).toBe('Resumed');
    expect(timelineLabel(event('opened_in_editor'), none)).toBe('Opened in the editor');
  });

  it('uses the note title, or the first non-empty line of its body', () => {
    const entries = entriesById([
      entry({ id: 'n1', title: 'Retry ideas', body: 'ignored' }),
      entry({ id: 'n2', title: '  ', body: '\n\n  First real line \nsecond' }),
    ]);
    expect(timelineLabel(event('note_added', { entryId: 'n1' }), entries)).toBe(
      'Note added: Retry ideas',
    );
    expect(timelineLabel(event('note_added', { entryId: 'n2' }), entries)).toBe(
      'Note added: First real line',
    );
  });

  it('falls back when the entry is gone', () => {
    expect(timelineLabel(event('note_added', { entryId: 'missing' }), none)).toBe('Note added');
    expect(timelineLabel(event('link_added', { entryId: 'missing' }), none)).toBe('Link added');
  });

  it('uses the link title', () => {
    const entries = entriesById([
      entry({ id: 'l1', type: 'link', title: 'Outbox pattern', url: 'https://example.com' }),
    ]);
    expect(timelineLabel(event('link_added', { entryId: 'l1' }), entries)).toBe(
      'Link added: Outbox pattern',
    );
  });
});

describe('truncate', () => {
  it('keeps short text and cuts long text with an ellipsis', () => {
    expect(truncate('  short  ')).toBe('short');
    const long = 'a'.repeat(SNIPPET_MAX + 10);
    const cut = truncate(long);
    expect(cut).toHaveLength(SNIPPET_MAX);
    expect(cut.endsWith('…')).toBe(true);
  });

  it('applies to long note titles', () => {
    const label = noteSnippet(entry({ id: 'n', title: 'word '.repeat(30) }));
    expect(label.length).toBeLessThanOrEqual(SNIPPET_MAX);
    expect(label.endsWith('…')).toBe(true);
  });
});
