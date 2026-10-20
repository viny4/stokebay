// The map: every project as a dot around you. World = slice, distance = time since you last
// touched it, colour = status. Scroll to zoom, drag to move, click a dot to open it.
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { formatRelative } from '../../shared/time';
import type { Glow } from '../../shared/glow';
import { layoutUniverse, UNIVERSE_RADIUS, type Star } from '../../shared/universe';
import { STATUS_COLOR, STATUS_LABEL, Button, withAlpha } from '../components/ui';
import { guard, useHud } from '../store/useHud';

const VIEW = UNIVERSE_RADIUS + 140;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 6;

const STAR_SIZE: Record<Glow, number> = { bright: 17, medium: 15, dim: 13, cold: 12, none: 14 };

interface ViewState {
  k: number;
  x: number;
  y: number;
}

function wedge(r: number, a1: number, a2: number): string {
  const large = a2 - a1 > Math.PI ? 1 : 0;
  return `M0 0 L${r * Math.cos(a1)} ${r * Math.sin(a1)} A${r} ${r} 0 ${large} 1 ${r * Math.cos(a2)} ${r * Math.sin(a2)} Z`;
}

export function Universe() {
  const projects = useHud((s) => s.projects);
  const worlds = useHud((s) => s.worlds);
  const now = useHud((s) => s.now);
  const search = useHud((s) => s.search);
  const searchMatches = useHud((s) => s.searchMatches);
  const worldFilter = useHud((s) => s.worldFilter);
  const openProject = useHud((s) => s.openProject);
  const openDialog = useHud((s) => s.openDialog);

  const layout = useMemo(() => layoutUniverse(projects, worlds, now), [projects, worlds, now]);
  const byId = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const [view, setView] = useState<ViewState>({ k: 1, x: 0, y: 0 });
  const [hover, setHover] = useState<{ star: Star; left: number; top: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(
    null,
  );

  const query = search.trim().toLowerCase();
  const matches = (star: Star) =>
    (query === '' || star.title.toLowerCase().includes(query) || searchMatches.has(star.id)) &&
    (worldFilter === null || (byId.get(star.id)?.worldIds.includes(worldFilter) ?? false));
  const filtering = query !== '' || worldFilter !== null;

  // Screen pixels → galaxy units, so zoom stays anchored under the pointer.
  const toGalaxy = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };

  // React's wheel listener is passive, so preventDefault (no page scroll) needs a native one.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const at = toGalaxy(event.clientX, event.clientY);
      setView((v) => {
        const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.k * Math.exp(-event.deltaY * 0.0015)));
        // Keep the galaxy point under the pointer fixed while zooming.
        const gx = (at.x - v.x) / v.k;
        const gy = (at.y - v.y) / v.k;
        return { k, x: at.x - gx * k, y: at.y - gy * k };
      });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    const at = toGalaxy(event.clientX, event.clientY);
    drag.current = { x: at.x, y: at.y, vx: view.x, vy: view.y, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    const at = toGalaxy(event.clientX, event.clientY);
    const dx = at.x - d.x;
    const dy = at.y - d.y;
    if (Math.hypot(dx, dy) > 4) d.moved = true;
    if (d.moved) {
      setHover(null);
      setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
    }
  };
  const endDrag = () => {
    // Keep `moved` readable by the click handler that fires right after pointerup.
    setTimeout(() => (drag.current = null), 0);
  };

  const zoomBy = (factor: number) =>
    setView((v) => {
      const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.k * factor));
      return { k, x: (v.x * k) / v.k, y: (v.y * k) / v.k };
    });

  const open = (star: Star) => {
    if (drag.current?.moved) return;
    guard(() => openProject(star.id));
  };

  if (layout.stars.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <p className="text-[15px] font-semibold text-ink">Nothing on the map yet</p>
        <p className="max-w-xs text-sm text-muted">
          Every project you add shows up here, closer to the middle the more recently you worked on
          it.
        </p>
        <Button variant="primary" onClick={() => openDialog({ kind: 'ignite' })}>
          New project
        </Button>
      </div>
    );
  }

  const labelSize = 26 / view.k;

  return (
    <div className="relative h-full min-h-[480px] overflow-hidden">
      <svg
        ref={svgRef}
        role="img"
        aria-label="Map of your projects. Dots closer to the centre were worked on more recently."
        viewBox={`${-VIEW} ${-VIEW} ${VIEW * 2} ${VIEW * 2}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full cursor-grab touch-none select-none active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          <circle
            r={UNIVERSE_RADIUS}
            style={{ fill: 'var(--surface)', stroke: 'var(--line)' }}
            strokeWidth={1.5 / view.k}
          />

          {layout.sectors.map((s) => {
            const mid = (s.startAngle + s.endAngle) / 2;
            const lr = UNIVERSE_RADIUS + 70;
            return (
              <g key={s.worldId ?? 'none'}>
                <path
                  d={wedge(UNIVERSE_RADIUS, s.startAngle, s.endAngle)}
                  fill={withAlpha(s.color, 0.06)}
                />
                {layout.sectors.length > 1 ? (
                  <line
                    x1={0}
                    y1={0}
                    x2={UNIVERSE_RADIUS * Math.cos(s.startAngle)}
                    y2={UNIVERSE_RADIUS * Math.sin(s.startAngle)}
                    style={{ stroke: 'var(--line)' }}
                    strokeWidth={1.5 / view.k}
                  />
                ) : null}
                <text
                  x={lr * Math.cos(mid)}
                  y={lr * Math.sin(mid)}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  style={{ fill: 'var(--muted)' }}
                  fontSize={34 / Math.sqrt(view.k)}
                  fontWeight={600}
                >
                  <tspan fill={s.color}>● </tspan>
                  {s.name} ({s.count})
                </text>
              </g>
            );
          })}

          {layout.orbits.map((o) => (
            <g key={o.days}>
              <circle
                r={o.radius}
                fill="none"
                style={{ stroke: 'var(--line-strong)' }}
                strokeWidth={1.2 / view.k}
                strokeDasharray={`${4 / view.k} ${6 / view.k}`}
              />
              <text
                x={0}
                y={-o.radius - 8 / view.k}
                textAnchor="middle"
                style={{ fill: 'var(--muted)', paintOrder: 'stroke', stroke: 'var(--surface)' }}
                strokeWidth={5 / view.k}
                fontSize={24 / Math.sqrt(view.k)}
              >
                {o.label}
              </text>
            </g>
          ))}

          {/* You, at the centre. */}
          <circle r={44} style={{ fill: 'var(--ink)' }} />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            style={{ fill: 'var(--canvas)' }}
            fontSize={24}
            fontWeight={600}
          >
            You
          </text>

          {layout.stars.map((star) => {
            const dimmed = filtering && !matches(star);
            const size = STAR_SIZE[star.glow];
            const showLabel = view.k >= 1.4 || star.glow === 'bright' || hover?.star.id === star.id;
            const p = byId.get(star.id);
            return (
              <g
                key={star.id}
                transform={`translate(${star.x} ${star.y})`}
                role="button"
                tabIndex={0}
                aria-label={`${star.title}, ${STATUS_LABEL[star.status]}, last active ${p ? formatRelative(p.lastActivityAt, now) : ''}`}
                opacity={dimmed ? 0.15 : star.glow === 'cold' ? 0.55 : 1}
                className="cursor-pointer focus:outline-none [&:focus-visible>circle:nth-child(2)]:stroke-[var(--accent)]"
                onClick={() => open(star)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    guard(() => openProject(star.id));
                  }
                }}
                onPointerEnter={(e) => setHover({ star, left: e.clientX, top: e.clientY })}
                onPointerLeave={() => setHover((h) => (h?.star.id === star.id ? null : h))}
              >
                {/* Big invisible hit area so small dots are easy to click. */}
                <circle r={Math.max(22, size * 2) / Math.sqrt(view.k)} fill="transparent" />
                <circle
                  r={size / Math.sqrt(view.k)}
                  style={{ fill: STATUS_COLOR[star.status], stroke: 'var(--surface)' }}
                  strokeWidth={3 / view.k}
                />
                {showLabel ? (
                  <text
                    y={size / Math.sqrt(view.k) + 6 / view.k + labelSize}
                    textAnchor="middle"
                    fontSize={labelSize}
                    fontWeight={500}
                    style={{ fill: 'var(--ink)', paintOrder: 'stroke', stroke: 'var(--surface)' }}
                    strokeWidth={4 / view.k}
                  >
                    {star.title}
                  </text>
                ) : null}
              </g>
            );
          })}
        </g>
      </svg>

      {hover ? <StarTooltip star={hover.star} left={hover.left} top={hover.top} /> : null}

      <div className="pointer-events-none absolute top-5 left-6 flex max-w-xs flex-col gap-2">
        <p className="text-[13px] text-muted">
          The closer to the middle, the more recently you worked on it. Projects you leave alone
          drift outward.
        </p>
        <div className="flex flex-wrap gap-3 text-xs text-muted">
          {(['active', 'paused', 'idea', 'done'] as const).map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[s] }} />
              {STATUS_LABEL[s]}
            </span>
          ))}
        </div>
      </div>

      <div className="absolute right-6 bottom-6 flex gap-1.5">
        <Button aria-label="Zoom out" onClick={() => zoomBy(1 / 1.4)} className="w-8 px-0">
          −
        </Button>
        <Button aria-label="Zoom in" onClick={() => zoomBy(1.4)} className="w-8 px-0">
          +
        </Button>
        <Button onClick={() => setView({ k: 1, x: 0, y: 0 })}>Reset</Button>
      </div>
    </div>
  );
}

function StarTooltip({ star, left, top }: { star: Star; left: number; top: number }) {
  const project = useHud((s) => s.projects.find((p) => p.id === star.id));
  const worlds = useHud((s) => s.worlds);
  const now = useHud((s) => s.now);
  if (!project) return null;
  const world = worlds.find((w) => w.id === star.worldId);
  return (
    <div
      className="pointer-events-none fixed z-30 w-64 rounded-lg border border-line bg-raised px-3 py-2.5 shadow-pop"
      style={{ left: left + 16, top: top + 12 }}
    >
      <p className="font-semibold text-sm text-ink">{project.title}</p>
      <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted">
        <span
          className="h-2 w-2 rounded-full"
          style={{ background: STATUS_COLOR[project.status] }}
        />
        {STATUS_LABEL[project.status]}
        {star.glow === 'cold' ? ` · untouched for ${star.days} days` : ''}
      </p>
      <p className="mt-1 text-xs text-muted">
        {world ? `${world.name} · ` : ''}last activity {formatRelative(project.lastActivityAt, now)}
      </p>
      {project.activePause?.whereIStopped ? (
        <p className="mt-1 line-clamp-2 text-xs text-muted">
          Stopped at: {project.activePause.whereIStopped}
        </p>
      ) : null}
    </div>
  );
}
