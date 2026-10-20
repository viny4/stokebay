// The terminal's look, shared by the visible view and the size measurement below, so both agree
// on how many columns and rows fit.
import { FitAddon } from '@xterm/addon-fit';
import { Terminal, type ITerminalOptions } from '@xterm/xterm';

// The system monospace first; Nerd Fonts after it so prompt icons (Powerlevel10k, Starship…)
// still draw when one is installed, since the browser falls back glyph by glyph.
const FONT_FAMILY = [
  '"SF Mono"',
  'Menlo',
  '"MesloLGS NF"',
  '"MesloLGS Nerd Font"',
  '"JetBrainsMono Nerd Font"',
  '"Hack Nerd Font"',
  '"FiraCode Nerd Font"',
  'Monaco',
  'Consolas',
  'monospace',
].join(', ');

export const TERMINAL_OPTIONS: ITerminalOptions = {
  fontFamily: FONT_FAMILY,
  fontSize: 12.5,
  lineHeight: 1.2,
  cursorBlink: true,
  scrollback: 5000,
  macOptionIsMeta: true,
  allowProposedApi: false,
};

/** The padding around the terminal inside its tab (also used when measuring). */
export const TERMINAL_PADDING_CLASS = 'py-2 pl-3';

/**
 * How many columns and rows fit in a terminal area of this size. Shells draw their prompt the
 * moment they start (Powerlevel10k's instant prompt within milliseconds), so a shell started at
 * the wrong size and resized a moment later redraws it twice. Measuring first, with an
 * invisible terminal set up exactly like the real one, lets it start at the right size.
 */
export function measureTerminalSize(width: number, height: number): { cols: number; rows: number } {
  const host = document.createElement('div');
  host.className = TERMINAL_PADDING_CLASS;
  Object.assign(host.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: `${width}px`,
    height: `${height}px`,
    visibility: 'hidden',
  });
  document.body.appendChild(host);
  const terminal = new Terminal(TERMINAL_OPTIONS);
  const fit = new FitAddon();
  terminal.loadAddon(fit);
  try {
    terminal.open(host);
    const size = fit.proposeDimensions();
    return size && size.cols > 1 && size.rows > 0
      ? { cols: size.cols, rows: size.rows }
      : { cols: 80, rows: 24 };
  } finally {
    terminal.dispose();
    host.remove();
  }
}
