import { memo, useMemo } from 'react';
import { formatRelative } from '../../shared/time';
import type { ActivityEvent, Entry } from '../../shared/types';
import { entriesById, timelineLabel } from './timeline-labels';

/** Activity events newest first, on a thin vertical rail. */
export const Timeline = memo(function Timeline({
  events,
  entries,
  now,
}: {
  events: ActivityEvent[];
  entries: Entry[];
  now: number;
}) {
  const byId = useMemo(() => entriesById(entries), [entries]);
  // The store already sends events newest first; sorting again keeps the order right if
  // that ever changes, and costs nothing at prototype sizes.
  const sorted = useMemo(() => [...events].sort((a, b) => b.createdAt - a.createdAt), [events]);

  if (sorted.length === 0) {
    return <p className="text-sm text-hud-muted">Nothing has happened here yet.</p>;
  }

  return (
    <ol className="relative ml-1.5 border-l border-status-active/25">
      {sorted.map((event) => (
        <li key={event.id} className="relative pb-3 pl-4 last:pb-0">
          <span
            aria-hidden
            className="absolute top-1.5 -left-[4.5px] h-2 w-2 rounded-full border border-status-active/70 bg-hud-bg shadow-[0_0_6px_rgb(34_211_238/0.6)]"
          />
          <p className="text-sm text-hud-text">{timelineLabel(event, byId)}</p>
          <time
            dateTime={new Date(event.createdAt).toISOString()}
            title={new Date(event.createdAt).toLocaleString()}
            className="font-hud text-[11px] text-hud-muted"
          >
            {formatRelative(event.createdAt, now)}
          </time>
        </li>
      ))}
    </ol>
  );
});
