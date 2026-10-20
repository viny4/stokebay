// The built-in terminal, docked on the right of the window: one tab per shell, a + to start
// another, and an edge to drag for width. Tabs opened for a project start in its folder.
import { useRef } from 'react';
import { useHud } from '../../store/useHud';
import { MIN_WIDTH, useTerminals, type TerminalTab } from '../../store/useTerminals';
import { TerminalView } from './TerminalView';

export function TerminalPanel() {
  const open = useTerminals((s) => s.open);
  const width = useTerminals((s) => s.width);
  const tabs = useTerminals((s) => s.tabs);
  const activeId = useTerminals((s) => s.activeId);
  const setActive = useTerminals((s) => s.setActive);
  const close = useTerminals((s) => s.close);
  const newTab = useTerminals((s) => s.newTab);
  const hide = useTerminals((s) => s.hide);
  const setWidth = useTerminals((s) => s.setWidth);
  const dragStart = useRef<{ x: number; width: number } | null>(null);

  // Tabs stay mounted while the panel is hidden so running programs keep their screens.
  if (tabs.length === 0) return null;

  // + opens next to what you're looking at: the shown tab's project, else the open project.
  const plus = () => {
    const shown = tabs.find((t) => t.info.id === activeId);
    void newTab(shown ? shown.info.projectId : useHud.getState().selectedId);
  };

  return (
    <aside
      aria-label="Terminal"
      // The chosen width is a preference: on a small window, with the project panel open too,
      // the terminal gives way (down to its minimum) before the project list gets too narrow.
      style={{ flexBasis: width }}
      className={`relative min-w-[320px] shrink flex-col border-l border-line bg-surface ${open ? 'flex' : 'hidden'}`}
    >
      {/* Drag the left edge to resize. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize terminal"
        aria-valuemin={MIN_WIDTH}
        aria-valuenow={width}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') setWidth(width + 24);
          if (e.key === 'ArrowRight') setWidth(width - 24);
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          dragStart.current = {
            x: e.clientX,
            width: e.currentTarget.parentElement?.offsetWidth ?? width,
          };
        }}
        onPointerMove={(e) => {
          if (dragStart.current) {
            setWidth(dragStart.current.width + dragStart.current.x - e.clientX);
          }
        }}
        onPointerUp={() => (dragStart.current = null)}
        className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize focus-visible:bg-accent/30"
      />

      <header className="drag flex h-14 shrink-0 items-center gap-1 border-b border-line pr-2 pl-3">
        <div
          role="tablist"
          aria-label="Terminals"
          className="no-drag flex min-w-0 items-center gap-1 overflow-x-auto"
        >
          {tabs.map((tab, index) => {
            const selected = tab.info.id === activeId;
            const label = tabLabel(tabs, index);
            return (
              <div
                key={tab.info.id}
                className={`group flex h-7 max-w-44 shrink-0 items-center rounded-md text-[13px] ${
                  selected ? 'bg-hover text-ink' : 'text-muted hover:bg-hover hover:text-ink'
                }`}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  title={tab.info.cwd}
                  onClick={() => setActive(tab.info.id)}
                  className={`min-w-0 truncate pl-2.5 ${tab.exited ? 'italic opacity-60' : ''}`}
                >
                  {label}
                </button>
                <button
                  type="button"
                  aria-label={`Close ${label}`}
                  onClick={() => close(tab.info.id)}
                  className="ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted opacity-0 group-hover:opacity-100 hover:bg-hover hover:text-ink focus-visible:opacity-100"
                >
                  <CloseIcon />
                </button>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          aria-label="New terminal"
          title="New terminal"
          onClick={plus}
          className="no-drag flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-ink"
        >
          <PlusIcon />
        </button>
        <button
          type="button"
          aria-label="Hide terminal"
          title="Hide terminal  ⌃`"
          onClick={hide}
          className="no-drag ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-ink"
        >
          <PanelIcon />
        </button>
      </header>

      <div data-terminal-body className="relative min-h-0 flex-1">
        {tabs.map((tab) => (
          <TerminalView
            cols={tab.info.cols}
            rows={tab.info.rows}
            key={tab.info.id}
            id={tab.info.id}
            active={open && tab.info.id === activeId}
          />
        ))}
      </div>
    </aside>
  );
}

/** A tab's name; a second tab for the same project is "Chess engine 2", and so on. */
export function tabLabel(tabs: readonly TerminalTab[], index: number): string {
  const title = tabs[index].info.title;
  const n = tabs.slice(0, index + 1).filter((t) => t.info.title === title).length;
  return n > 1 ? `${title} ${n}` : title;
}

/**
 * The toolbar button: a ">_" prompt mark. Given a project (the Lab), showing the panel goes to
 * that project's terminal.
 */
export function TerminalToggle({ projectId }: { projectId?: string }) {
  const open = useTerminals((s) => s.open);
  const toggle = useTerminals((s) => s.toggle);
  const openFor = useTerminals((s) => s.openFor);
  const hide = useTerminals((s) => s.hide);
  const onClick = () => {
    if (open) hide();
    else if (projectId) void openFor(projectId);
    else void toggle();
  };
  return (
    <button
      type="button"
      aria-label={open ? 'Hide terminal' : 'Show terminal'}
      aria-pressed={open}
      title="Terminal  ⌃`"
      onClick={onClick}
      className={`no-drag flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors ${
        open
          ? 'border-accent/40 bg-accent/10 text-ink'
          : 'border-line text-muted hover:bg-hover hover:text-ink'
      }`}
    >
      <PromptIcon />
    </button>
  );
}

function PromptIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 4.5 6.5 8 3 11.5M8.5 12h4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function PanelIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2" y="3" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10 3v10" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
