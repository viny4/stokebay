// Terminals "Open in…" and Pick up can use. `default` is the system's own terminal (Terminal on
// macOS, Windows Terminal or Command Prompt on Windows, the desktop's terminal on Linux). The
// others are named apps: on macOS they are opened by app name (`app`), because apps started from
// Finder don't get the terminal's PATH; elsewhere by their command (`cli`).
export const TERMINALS = [
  { id: 'default', name: 'Terminal', app: 'Terminal', cli: null, macOnly: false },
  { id: 'iterm', name: 'iTerm', app: 'iTerm', cli: null, macOnly: true },
  { id: 'warp', name: 'Warp', app: 'Warp', cli: 'warp-terminal', macOnly: false },
  { id: 'ghostty', name: 'Ghostty', app: 'Ghostty', cli: 'ghostty', macOnly: false },
  { id: 'kitty', name: 'kitty', app: 'kitty', cli: 'kitty', macOnly: false },
  { id: 'alacritty', name: 'Alacritty', app: 'Alacritty', cli: 'alacritty', macOnly: false },
  { id: 'wezterm', name: 'WezTerm', app: 'WezTerm', cli: 'wezterm', macOnly: false },
] as const;

export type TerminalId = (typeof TERMINALS)[number]['id'];
export type Terminal = (typeof TERMINALS)[number];

export const TERMINAL_IDS = TERMINALS.map((t) => t.id) as [TerminalId, ...TerminalId[]];

/** The setting: the built-in panel, or one of the apps above. */
export const TERMINAL_SETTING_IDS = ['builtin', ...TERMINAL_IDS] as ['builtin', ...TerminalId[]];

export function usesBuiltInTerminal(setting: string | null | undefined): boolean {
  return !TERMINALS.some((t) => t.id === setting);
}

export function terminalById(id: string | null | undefined): Terminal {
  return TERMINALS.find((t) => t.id === id) ?? TERMINALS[0];
}

/** The terminals worth offering on this platform (iTerm only exists on macOS). */
export function terminalsFor(isMac: boolean): Terminal[] {
  return TERMINALS.filter((t) => isMac || !t.macOnly);
}
