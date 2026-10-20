// One shell's screen, drawn by xterm.js. Every tab keeps its view mounted (only hidden), so
// switching tabs keeps scrollback and whatever is running.
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { Terminal, type ITheme } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { useEffect, useRef } from 'react';
import type { Id } from '../../../shared/types';
import { attachTerminal } from '../../store/useTerminals';
import { TERMINAL_OPTIONS, TERMINAL_PADDING_CLASS } from './terminal-size';

// Warm, slightly muted ANSI colours that sit with the app's palette instead of a stock theme.
const LIGHT_ANSI = {
  black: '#1c1917',
  red: '#c2410c',
  green: '#3d8b5f',
  yellow: '#a16207',
  blue: '#4f7cac',
  magenta: '#8466c4',
  cyan: '#2f8a87',
  white: '#a8a29e',
  brightBlack: '#78716c',
  brightRed: '#d9571f',
  brightGreen: '#4c9e6f',
  brightYellow: '#b7791f',
  brightBlue: '#5b8fd1',
  brightMagenta: '#9277cc',
  brightCyan: '#3f9e9a',
  brightWhite: '#d6d3d1',
};
const DARK_ANSI = {
  black: '#3a3735',
  red: '#f08a5d',
  green: '#62b385',
  yellow: '#d6b25e',
  blue: '#7aa2cc',
  magenta: '#a68ee0',
  cyan: '#5cb8b2',
  white: '#d6d1ca',
  brightBlack: '#7d7771',
  brightRed: '#ff9e75',
  brightGreen: '#7cc99c',
  brightYellow: '#e8c877',
  brightBlue: '#94b8de',
  brightMagenta: '#bba6ec',
  brightCyan: '#79cdc7',
  brightWhite: '#f5f2ee',
};

function currentTheme(): ITheme {
  const css = getComputedStyle(document.documentElement);
  const token = (name: string) => css.getPropertyValue(name).trim();
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  return {
    background: token('--surface'),
    foreground: token('--ink'),
    cursor: token('--accent'),
    cursorAccent: token('--surface'),
    selectionBackground: dark ? 'rgba(238, 106, 50, 0.32)' : 'rgba(217, 87, 31, 0.22)',
    ...(dark ? DARK_ANSI : LIGHT_ANSI),
  };
}

export function TerminalView({
  id,
  cols,
  rows,
  active,
}: {
  id: Id;
  cols: number;
  rows: number;
  active: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);
  const fit = useRef<FitAddon | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    // Starts at the size the shell was started with, so fitting it changes nothing.
    const terminal = new Terminal({ ...TERMINAL_OPTIONS, cols, rows, theme: currentTheme() });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(el);
    // Draw with the GPU: the default DOM renderer rebuilds rows of elements on every update,
    // which is what makes fast output and panels moving beside it stutter. If the GPU context
    // is lost (sleep, driver reset) xterm falls back to the DOM renderer on its own.
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      terminal.loadAddon(webgl);
    } catch {
      // No WebGL here: the DOM renderer still works, just slower.
    }
    term.current = terminal;
    fit.current = fitAddon;

    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true;
      // ⌃` toggles the panel; let it reach the app instead of the shell.
      if (event.ctrlKey && event.key === '`') return false;
      // ⌘K clears the screen, as in Terminal and iTerm.
      if (event.metaKey && event.key.toLowerCase() === 'k') {
        terminal.clear();
        return false;
      }
      return true;
    });
    const typed = terminal.onData((data) => window.api.terminalWrite(id, data));
    const resized = terminal.onResize(({ cols, rows }) =>
      window.api.terminalResize(id, cols, rows),
    );
    const detach = attachTerminal(id, {
      write: (data) => terminal.write(data),
      exited: (code) =>
        terminal.write(
          `\r\n\x1b[2m[Shell ended${code ? ` with code ${code}` : ''}. Close this tab or open a new one.]\x1b[0m\r\n`,
        ),
    });

    // Follow the system's light/dark switch like the rest of the app.
    const scheme = window.matchMedia('(prefers-color-scheme: dark)');
    const onScheme = () => (terminal.options.theme = currentTheme());
    scheme.addEventListener('change', onScheme);

    // Hidden tabs keep their size (visibility, not display), so every shell follows the panel;
    // the check covers the panel's own first frame.
    const observer = new ResizeObserver(() => {
      if (el.offsetWidth > 0 && el.offsetHeight > 0) fitAddon.fit();
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
      scheme.removeEventListener('change', onScheme);
      detach();
      typed.dispose();
      resized.dispose();
      terminal.dispose();
      term.current = null;
      fit.current = null;
    };
    // The starting size only matters once; later sizes come from fitting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!active) return;
    // Wait a frame so the tab is visible (and measurable) before fitting and focusing it.
    const frame = requestAnimationFrame(() => {
      fit.current?.fit();
      term.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [active]);

  return (
    <div
      ref={host}
      className={`selectable absolute inset-0 ${TERMINAL_PADDING_CLASS} ${active ? '' : 'invisible'}`}
      aria-hidden={!active}
    />
  );
}
