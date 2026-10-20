// Shown above the cards when an area is picked in the sidebar: what's going on in this part of
// your life at a glance. Counts, paused projects with their next step, projects going cold,
// and the last week of activity. Every row opens its project.
import { useEffect, useMemo, useState } from 'react';
import { glowFor } from '../../shared/glow';
import { daysSince, formatRelative } from '../../shared/time';
import {
  PROJECT_STATUSES,
  type AreaActivity,
  type Entry,
  type Id,
  type ProjectSummary,
  type World,
} from '../../shared/types';
import { guard, useHud } from '../store/useHud';
import { timelineLabel } from './timeline-labels';
import { STATUS_COLOR, STATUS_LABEL } from './ui';

const MAX_ROWS = 5;

export function AreaOverview({ area, projects }: { area: World; projects: ProjectSummary[] }) {
  const now = useHud((s) => s.now);
  const openProject = useHud((s) => s.openProject);
  const [activity, setActivity] = useState<AreaActivity | null>(null);

  // Refetch when the area or any of its projects changes (a note added, a pause…).
  useEffect(() => {
    let current = true;
    window.api
      .areaActivity(area.id)
      .then((a) => current && setActivity(a))
      .catch(() => current && setActivity({ events: [], entries: [] }));
    return () => {
      current = false;
    };
  }, [area.id, projects]);

  const live = projects.filter((p) => p.archivedAt === null);
  const paused = live
    .filter((p) => p.status === 'paused')
    .sort((a, b) => (b.activePause?.pausedAt ?? 0) - (a.activePause?.pausedAt ?? 0));
  const cold = live
    .filter((p) => p.status !== 'paused' && glowFor(p, now) === 'cold')
    .sort((a, b) => a.lastActivityAt - b.lastActivityAt);
  const titles = useMemo(() => new Map<Id, string>(live.map((p) => [p.id, p.title])), [live]);
  const entries = useMemo(
    () => new Map<Id, Entry>((activity?.entries ?? []).map((e) => [e.id, e])),
    [activity],
  );
  const open = (id: Id) => guard(() => openProject(id));

  return (
    <section aria-label={`${area.name} overview`} className="flex flex-col gap-3">
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
        {PROJECT_STATUSES.map((status) => {
          const n = live.filter((p) => p.status === status).length;
          if (n === 0) return null;
          return (
            <span key={status} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="h-2 w-2 rounded-full"
                style={{ background: STATUS_COLOR[status] }}
              />
              <span className="text-ink tabular-nums">{n}</span>{' '}
              {STATUS_LABEL[status].toLowerCase()}
            </span>
          );
        })}
        {live.length === 0 ? <span>No projects in this area yet.</span> : null}
      </p>

      <div className="grid gap-3 @3xl:grid-cols-3">
        <Card title="Pick up where you left off" empty="Nothing paused here.">
          {paused.slice(0, MAX_ROWS).map((p) => (
            <Row key={p.id} onClick={() => open(p.id)}>
              <span className="truncate text-sm font-medium text-ink">{p.title}</span>
              <span className="line-clamp-2 text-xs text-muted">
                {p.activePause?.nextStep
                  ? `Next: ${p.activePause.nextStep}`
                  : p.activePause?.whereIStopped
                    ? `Stopped at: ${p.activePause.whereIStopped}`
                    : `Paused ${formatRelative(p.activePause?.pausedAt ?? p.updatedAt, now)}`}
              </span>
            </Row>
          ))}
        </Card>

        <Card title="Going cold" empty="Nothing going cold. Nice.">
          {cold.slice(0, MAX_ROWS).map((p) => (
            <Row key={p.id} onClick={() => open(p.id)}>
              <span className="truncate text-sm font-medium text-ink">{p.title}</span>
              <span className="text-xs text-muted">
                Untouched for {daysSince(p.lastActivityAt, now)} days
              </span>
            </Row>
          ))}
        </Card>

        <Card title="This week" empty={activity ? 'No activity in the last 7 days.' : 'Loading…'}>
          {(activity?.events ?? []).slice(0, MAX_ROWS + 2).map((e) =>
            e.projectId && titles.has(e.projectId) ? (
              <Row key={e.id} onClick={() => open(e.projectId!)}>
                <span className="truncate text-sm text-ink">{timelineLabel(e, entries)}</span>
                <span className="truncate text-xs text-muted">
                  {titles.get(e.projectId)} · {formatRelative(e.createdAt, now)}
                </span>
              </Row>
            ) : null,
          )}
        </Card>
      </div>

      <h2 className="mt-3 text-[13px] font-semibold text-ink">Projects</h2>
    </section>
  );
}

function Card({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode[];
}) {
  const rows = children.filter(Boolean);
  return (
    <div className="panel flex flex-col p-3">
      <h3 className="px-1 pb-2 text-[13px] font-semibold text-ink">{title}</h3>
      {rows.length === 0 ? (
        <p className="px-1 pb-1 text-xs text-muted">{empty}</p>
      ) : (
        <ul className="flex flex-col">{rows}</ul>
      )}
    </div>
  );
}

function Row({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full flex-col gap-0.5 rounded-md px-1 py-1.5 text-left hover:bg-hover"
      >
        {children}
      </button>
    </li>
  );
}
