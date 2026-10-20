// State for the built-in terminal panel: which shells are open (as tabs), which one is shown,
// and how wide the panel is. The shells themselves live in main; output arrives through
// `subscribeToTerminals` and is handed to whichever xterm view registered for that tab.
import { create } from 'zustand';
import type { Id, TerminalInfo } from '../../shared/types';
import { usesBuiltInTerminal } from '../../shared/terminals';
import { errorMessage, guard, useHud } from './useHud';

export interface TerminalTab {
  info: TerminalInfo;
  /** The shell has ended (e.g. the user typed `exit`); the tab stays so its output can be read. */
  exited: boolean;
}

export const MIN_WIDTH = 320;
// Leaves room for two columns of cards on a 13-inch screen.
const DEFAULT_WIDTH = 440;
const WIDTH_KEY = 'stokebay.terminalWidth';

interface TerminalsState {
  open: boolean;
  width: number;
  tabs: TerminalTab[];
  activeId: Id | null;

  /** Shows or hides the panel; showing it with no tabs starts one. */
  toggle(): Promise<void>;
  /** Shows the project's terminal: its live tab if it has one, otherwise a new shell. */
  openFor(projectId: Id | null): Promise<void>;
  /** Always starts a new shell (the panel's + button). */
  newTab(projectId: Id | null): Promise<void>;
  close(id: Id): void;
  setActive(id: Id): void;
  setWidth(width: number): void;
  hide(): void;
}

export const useTerminals = create<TerminalsState>()((set, get) => ({
  open: false,
  width: readWidth(),
  tabs: [],
  activeId: null,

  async toggle() {
    if (get().open) {
      set({ open: false });
      return;
    }
    if (get().tabs.length > 0) {
      set({ open: true });
      return;
    }
    await get().newTab(useHud.getState().selectedId);
  },

  async openFor(projectId) {
    const live = get().tabs.find((t) => t.info.projectId === projectId && !t.exited);
    if (live) {
      set({ open: true, activeId: live.info.id });
      return;
    }
    await get().newTab(projectId);
  },

  async newTab(projectId) {
    try {
      const info = await window.api.terminalCreate(projectId);
      set((s) => ({ tabs: [...s.tabs, { info, exited: false }], activeId: info.id, open: true }));
    } catch (err) {
      useHud.getState().showToast(errorMessage(err), 'error');
    }
  },

  close(id) {
    void window.api.terminalKill(id).catch(() => undefined);
    forget(id);
    set((s) => {
      const index = s.tabs.findIndex((t) => t.info.id === id);
      const tabs = s.tabs.filter((t) => t.info.id !== id);
      // Like a browser: closing the shown tab shows its neighbour.
      const next = tabs[Math.min(index, tabs.length - 1)]?.info.id ?? null;
      return {
        tabs,
        activeId: s.activeId === id ? next : s.activeId,
        open: tabs.length > 0 && s.open,
      };
    });
  },

  setActive: (activeId) => set({ activeId }),
  hide: () => set({ open: false }),

  setWidth(width) {
    const clamped = Math.round(Math.max(MIN_WIDTH, Math.min(width, window.innerWidth * 0.7)));
    set({ width: clamped });
    try {
      localStorage.setItem(WIDTH_KEY, String(clamped));
    } catch {
      // A remembered width is a nicety; without storage it's just the default next time.
    }
  },
}));

/** "Open terminal" for a project: the built-in panel, or the terminal app chosen in Settings. */
export function openProjectTerminal(projectId: Id): void {
  if (usesBuiltInTerminal(useHud.getState().settings.terminal)) {
    void useTerminals.getState().openFor(projectId);
  } else {
    guard(() => useHud.getState().openInTerminal(projectId));
  }
}

/**
 * Pick up, plus the built-in terminal: main opens terminal apps itself, but the built-in one is
 * a tab in this window, so it's opened here once the project is resumed.
 */
export async function pickUpProject(id: Id): Promise<void> {
  await useHud.getState().pickUp(id);
  const { settings, projects } = useHud.getState();
  const project = projects.find((p) => p.id === id);
  if (settings.pickUpTerminal && project?.path && usesBuiltInTerminal(settings.terminal)) {
    await useTerminals.getState().openFor(id);
  }
}

function readWidth(): number {
  try {
    const saved = Number(localStorage.getItem(WIDTH_KEY));
    if (Number.isFinite(saved) && saved >= MIN_WIDTH) return saved;
  } catch {
    // fall through
  }
  return DEFAULT_WIDTH;
}

// ---- Output routing ----
// A shell prints its prompt straight away, often before its tab's view has mounted, so output
// for a tab without a view is kept until one attaches.

type Writer = { write: (data: string) => void; exited: (code: number) => void };
const writers = new Map<Id, Writer>();
const backlog = new Map<Id, string[]>();

/** Called by a tab's view; returns the detach function. Replays anything that came before. */
export function attachTerminal(id: Id, writer: Writer): () => void {
  writers.set(id, writer);
  for (const chunk of backlog.get(id) ?? []) writer.write(chunk);
  backlog.delete(id);
  return () => {
    if (writers.get(id) === writer) writers.delete(id);
  };
}

function forget(id: Id): void {
  writers.delete(id);
  backlog.delete(id);
}

export function subscribeToTerminals(): () => void {
  const offData = window.api.onTerminalData((id, data) => {
    const writer = writers.get(id);
    if (writer) writer.write(data);
    else backlog.set(id, [...(backlog.get(id) ?? []), data]);
  });
  const offExit = window.api.onTerminalExit((id, code) => {
    writers.get(id)?.exited(code);
    useTerminals.setState((s) => ({
      tabs: s.tabs.map((t) => (t.info.id === id ? { ...t, exited: true } : t)),
    }));
  });
  return () => {
    offData();
    offExit();
  };
}
