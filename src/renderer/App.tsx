import { AnimatePresence, MotionConfig } from 'framer-motion';
import { useEffect, useMemo, useRef } from 'react';
import { ConfirmDialog } from './components/ConfirmDialog';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PauseDialog } from './components/PauseDialog';
import { ProjectDialog } from './components/ProjectDialog';
import { ScanDialog } from './components/ScanDialog';
import { SearchBox } from './components/SearchBox';
import { SettingsDialog } from './components/SettingsDialog';
import { Button } from './components/ui';
import { subscribeToMain, useHud } from './store/useHud';
import { subscribeToTerminals, useTerminals } from './store/useTerminals';
import { TerminalPanel, TerminalToggle } from './components/terminal/TerminalPanel';
import { reviewCandidates, reviewDue } from '../shared/review';
import { ArchivedView } from './views/ArchivedView';
import { HudGrid } from './views/HudGrid';
import { Universe } from './views/Universe';
import { Ignite } from './views/Ignite';
import { Lab } from './views/Lab';
import { Onboarding } from './views/Onboarding';
import type { View } from './store/useHud';
import { ProjectDetail } from './views/ProjectDetail';
import { WeeklyReview } from './views/WeeklyReview';

export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <ErrorBoundary>
        <Shell />
      </ErrorBoundary>
    </MotionConfig>
  );
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

function Shell() {
  const status = useHud((s) => s.status);
  const onboarded = useHud((s) => s.settings.onboarded);
  const loadError = useHud((s) => s.loadError);
  const view = useHud((s) => s.view);
  const selectedId = useHud((s) => s.selectedId);
  const dialog = useHud((s) => s.dialog);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void useHud.getState().load();
    const unsubscribe = subscribeToMain();
    const unsubscribeTerminals = subscribeToTerminals();
    const timer = setInterval(() => useHud.getState().tick(), 60_000);
    return () => {
      unsubscribe();
      unsubscribeTerminals();
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const state = useHud.getState();
      // First-run setup owns the keyboard until it's finished.
      if (!state.settings.onboarded) return;
      // ⌃` shows or hides the terminal from anywhere, as in VS Code.
      if (event.ctrlKey && event.key === '`') {
        event.preventDefault();
        void useTerminals.getState().toggle();
        return;
      }
      if (state.dialog.kind !== 'none' || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'Escape' && state.selectedId) {
        state.closeProject();
        return;
      }
      // The Lab owns its own keys (it has its own shortcuts and text editing).
      if (isTyping(event.target) || state.view === 'lab') return;
      if (event.key === 'n') {
        event.preventDefault();
        state.openDialog({ kind: 'ignite' });
      } else if (event.key === '/') {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex h-full bg-canvas">
      {status === 'ready' && !onboarded ? (
        <div className="flex min-w-0 flex-1 flex-col">
          <Onboarding />
        </div>
      ) : view === 'lab' ? (
        <div className="flex min-w-0 flex-1 flex-col">
          <Lab />
        </div>
      ) : (
        <>
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <Toolbar searchRef={searchRef} />
            <main className="relative flex-1 overflow-y-auto">
              <MainView status={status} loadError={loadError} view={view} />
            </main>
          </div>
        </>
      )}

      {status === 'ready' && onboarded ? <TerminalPanel /> : null}

      <AnimatePresence>{selectedId ? <ProjectDetail key={selectedId} /> : null}</AnimatePresence>

      <AnimatePresence>
        {dialog.kind === 'ignite' ? (
          <Ignite key="ignite" />
        ) : dialog.kind === 'project' ? (
          <ProjectDialog key="project" dialog={dialog} />
        ) : dialog.kind === 'pause' ? (
          <PauseDialog key="pause" projectId={dialog.projectId} />
        ) : dialog.kind === 'settings' ? (
          <SettingsDialog key="settings" />
        ) : dialog.kind === 'scan' ? (
          <ScanDialog key="scan" />
        ) : dialog.kind === 'confirm' ? (
          <ConfirmDialog key="confirm" dialog={dialog} />
        ) : null}
      </AnimatePresence>

      <ToastHost />
    </div>
  );
}

function MainView({
  status,
  loadError,
  view,
}: {
  status: 'loading' | 'ready' | 'error';
  loadError: string | null;
  view: View;
}) {
  return (
    <>
      {status === 'loading' ? (
        <p className="p-10 text-center text-sm text-muted">Loading projects…</p>
      ) : status === 'error' ? (
        <div className="p-10 text-center">
          <p className="text-sm font-medium text-danger">Couldn&apos;t load your projects.</p>
          <p className="mt-2 text-sm text-muted">{loadError}</p>
        </div>
      ) : view === 'universe' ? (
        <Universe />
      ) : view === 'grid' ? (
        <HudGrid />
      ) : view === 'review' ? (
        <WeeklyReview />
      ) : (
        <ArchivedView />
      )}
    </>
  );
}

function Sidebar() {
  const view = useHud((s) => s.view);
  const setView = useHud((s) => s.setView);
  const openDialog = useHud((s) => s.openDialog);
  const worlds = useHud((s) => s.worlds);
  const projects = useHud((s) => s.projects);
  const worldFilter = useHud((s) => s.worldFilter);
  const setWorldFilter = useHud((s) => s.setWorldFilter);
  const now = useHud((s) => s.now);
  const lastReviewAt = useHud((s) => s.settings.lastReviewAt);

  const live = projects.filter((p) => p.archivedAt === null);
  const toReview = useMemo(() => reviewCandidates(projects, now), [projects, now]);
  const reviewIsDue = reviewDue({ lastReviewAt }, toReview, now);
  const archivedCount = projects.length - live.length;
  // Worlds filter the grid; picking one from the map or archive goes back to the grid.
  const pickWorld = (id: string | null) => {
    setWorldFilter(id);
    if (view === 'archived' || view === 'review') setView('grid');
  };

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-sidebar">
      {/* Room for the macOS traffic lights; also the window's drag handle. */}
      <div className="drag h-12 shrink-0" />
      <div className="flex items-center gap-2 px-4 pb-4">
        <Logo />
        <span className="text-[15px] font-semibold text-ink">Stokebay</span>
      </div>

      <nav aria-label="Library" className="flex flex-col gap-0.5 px-2">
        <NavItem
          active={view === 'grid' && worldFilter === null}
          count={live.length}
          onClick={() => {
            setWorldFilter(null);
            setView('grid');
          }}
        >
          All projects
        </NavItem>
        <NavItem active={view === 'universe'} onClick={() => setView('universe')}>
          Map
        </NavItem>
        <NavItem
          active={view === 'archived'}
          count={archivedCount}
          onClick={() => setView('archived')}
        >
          Archived
        </NavItem>
        <NavItem
          active={view === 'review'}
          count={toReview.length}
          onClick={() => setView('review')}
        >
          Weekly review
          {reviewIsDue ? (
            <span
              role="img"
              aria-label="(due)"
              title="Due"
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
            />
          ) : null}
        </NavItem>
      </nav>

      <p className="mt-6 mb-1 px-4 text-[11px] font-semibold text-muted">Areas</p>
      <nav aria-label="Areas" className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2">
        {worlds.map((w) => (
          <NavItem
            key={w.id}
            active={view !== 'archived' && view !== 'review' && worldFilter === w.id}
            count={live.filter((p) => p.worldIds.includes(w.id)).length}
            onClick={() => pickWorld(worldFilter === w.id ? null : w.id)}
          >
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: w.color }}
            />
            <span className="truncate">{w.name}</span>
          </NavItem>
        ))}
        {worlds.length === 0 ? (
          <p className="px-2 text-xs text-muted">Add areas in Settings.</p>
        ) : null}
      </nav>

      <div className="flex flex-col gap-0.5 border-t border-line p-2">
        <NavItem active={false} onClick={() => openDialog({ kind: 'scan' })}>
          Find code projects…
        </NavItem>
        <NavItem active={false} onClick={() => openDialog({ kind: 'settings' })}>
          Settings
        </NavItem>
      </div>
    </aside>
  );
}

function Logo() {
  // A small ember: the one mark the app uses.
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path
        d="M9 1.5c.6 2.6 4.5 4.6 4.5 8.6A4.5 4.5 0 0 1 9 14.6a4.5 4.5 0 0 1-4.5-4.5c0-2 1.1-3.2 2-4.2.2 1.3.8 2.2 1.7 2.6C8.2 6.4 8.3 3.6 9 1.5Z"
        fill="var(--accent)"
      />
      <rect x="4" y="15.6" width="10" height="1.4" rx="0.7" fill="var(--accent)" opacity="0.45" />
    </svg>
  );
}

function NavItem({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count?: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      className={`flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] transition-colors ${
        active ? 'bg-hover font-medium text-ink' : 'text-ink/80 hover:bg-hover'
      }`}
    >
      {children}
      {count !== undefined ? (
        <span className="ml-auto text-xs text-muted tabular-nums">{count}</span>
      ) : null}
    </button>
  );
}

function Toolbar({ searchRef }: { searchRef: React.RefObject<HTMLInputElement | null> }) {
  const view = useHud((s) => s.view);
  const openDialog = useHud((s) => s.openDialog);
  const worlds = useHud((s) => s.worlds);
  const worldFilter = useHud((s) => s.worldFilter);

  const world = worldFilter ? worlds.find((w) => w.id === worldFilter) : undefined;
  const title =
    view === 'archived'
      ? 'Archived'
      : view === 'review'
        ? 'Weekly review'
        : view === 'universe'
          ? world
            ? `Map · ${world.name}`
            : 'Map'
          : (world?.name ?? 'All projects');

  return (
    <header className="drag flex h-14 shrink-0 items-center gap-3 border-b border-line px-6">
      <h1 className="text-[15px] font-semibold text-ink">{title}</h1>
      <div className="ml-auto flex items-center gap-2">
        <SearchBox inputRef={searchRef} />
        <TerminalToggle />
        <Button variant="primary" onClick={() => openDialog({ kind: 'ignite' })}>
          New project
        </Button>
      </div>
    </header>
  );
}

function ToastHost() {
  const toast = useHud((s) => s.toast);
  const dismiss = useHud((s) => s.dismissToast);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-6 left-1/2 z-[60] -translate-x-1/2"
    >
      {toast ? (
        <div
          key={toast.id}
          role={toast.kind === 'error' ? 'alert' : 'status'}
          className={`pointer-events-auto flex max-w-xl items-start gap-3 rounded-lg border px-4 py-2.5 text-sm shadow-pop ${
            toast.kind === 'error'
              ? 'border-danger/30 bg-raised text-danger'
              : 'border-line bg-ink text-canvas'
          }`}
        >
          <span>{toast.message}</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={dismiss}
            className="opacity-60 hover:opacity-100"
          >
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}
