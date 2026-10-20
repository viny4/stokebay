import { AnimatePresence, MotionConfig } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { ConfirmDialog } from './components/ConfirmDialog';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PauseDialog } from './components/PauseDialog';
import { ProjectDialog } from './components/ProjectDialog';
import { ScanDialog } from './components/ScanDialog';
import { Button, inputClass } from './components/ui';
import { subscribeToMain, useHud } from './store/useHud';
import { ArchivedView } from './views/ArchivedView';
import { HudGrid } from './views/HudGrid';
import { Ignite } from './views/Ignite';
import { Lab } from './views/Lab';
import { Onboarding } from './views/Onboarding';
import type { View } from './store/useHud';
import { ProjectDetail } from './views/ProjectDetail';

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
    const timer = setInterval(() => useHud.getState().tick(), 60_000);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const state = useHud.getState();
      // First-run setup owns the keyboard until it's finished.
      if (!state.settings.onboarded) return;
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
    <div className="hud-backdrop flex h-full flex-col">
      {status === 'ready' && !onboarded ? (
        <Onboarding />
      ) : view === 'lab' ? (
        <Lab />
      ) : (
        <>
          <TopBar searchRef={searchRef} />
          <main className="relative flex-1 overflow-y-auto">
            <MainView status={status} loadError={loadError} view={view} />
          </main>
        </>
      )}

      <AnimatePresence>{selectedId ? <ProjectDetail key={selectedId} /> : null}</AnimatePresence>

      <AnimatePresence>
        {dialog.kind === 'ignite' ? (
          <Ignite key="ignite" />
        ) : dialog.kind === 'project' ? (
          <ProjectDialog key="project" dialog={dialog} />
        ) : dialog.kind === 'pause' ? (
          <PauseDialog key="pause" projectId={dialog.projectId} />
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
        <p className="p-10 text-center font-hud text-sm text-hud-muted">Loading projects…</p>
      ) : status === 'error' ? (
        <div className="p-10 text-center">
          <p className="font-hud text-sm text-red-300">Couldn&apos;t load your projects.</p>
          <p className="mt-2 text-sm text-hud-muted">{loadError}</p>
        </div>
      ) : view === 'grid' ? (
        <HudGrid />
      ) : (
        <ArchivedView />
      )}
    </>
  );
}

function TopBar({ searchRef }: { searchRef: React.RefObject<HTMLInputElement | null> }) {
  const search = useHud((s) => s.search);
  const setSearch = useHud((s) => s.setSearch);
  const view = useHud((s) => s.view);
  const setView = useHud((s) => s.setView);
  const openDialog = useHud((s) => s.openDialog);
  const worlds = useHud((s) => s.worlds);
  const worldFilter = useHud((s) => s.worldFilter);
  const setWorldFilter = useHud((s) => s.setWorldFilter);
  const archivedCount = useHud((s) => s.projects.filter((p) => p.archivedAt !== null).length);

  return (
    <header className="border-b border-hud-line bg-black/20 px-6 pt-4 pb-3 backdrop-blur">
      <div className="flex items-center gap-4">
        <h1 className="font-display text-base font-bold tracking-[0.35em] text-status-active drop-shadow-[0_0_10px_rgb(56_214_255/0.7)]">
          STOKEBAY
        </h1>
        <div className="ml-auto flex items-center gap-2">
          <input
            ref={searchRef}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setSearch('');
                e.currentTarget.blur();
              }
            }}
            placeholder="Search projects   /"
            aria-label="Search projects by title"
            className={`${inputClass} w-64 py-1.5`}
          />
          <Button variant="primary" onClick={() => openDialog({ kind: 'ignite' })}>
            + Ignite
          </Button>
          <Button onClick={() => openDialog({ kind: 'scan' })}>Scan folder</Button>
          <Button
            aria-pressed={view === 'archived'}
            onClick={() => setView(view === 'archived' ? 'grid' : 'archived')}
          >
            {view === 'archived' ? '← Back to grid' : `Archived (${archivedCount})`}
          </Button>
        </div>
      </div>

      {view === 'grid' ? (
        <nav aria-label="Filter by world" className="mt-3 flex flex-wrap gap-2">
          <Chip active={worldFilter === null} onClick={() => setWorldFilter(null)}>
            All
          </Chip>
          {worlds.map((w) => (
            <Chip key={w.id} active={worldFilter === w.id} onClick={() => setWorldFilter(w.id)}>
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: w.color }}
              />
              {w.name}
            </Chip>
          ))}
        </nav>
      ) : null}
    </header>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1 text-xs transition-colors ${
        active
          ? 'border-status-active/70 bg-status-active/15 text-status-active'
          : 'border-hud-line text-hud-muted hover:text-hud-text'
      }`}
    >
      {children}
    </button>
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
          className={`pointer-events-auto flex max-w-xl items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg backdrop-blur ${
            toast.kind === 'error'
              ? 'border-red-400/50 bg-red-950/80 text-red-100'
              : 'border-status-active/40 bg-hud-raised text-hud-text'
          }`}
        >
          <span>{toast.message}</span>
          <button type="button" aria-label="Dismiss" onClick={dismiss} className="text-hud-muted">
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}
