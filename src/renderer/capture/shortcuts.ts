// The capture shortcut choices offered in Settings, and how an Electron accelerator reads on
// each system ("⌘⇧Space" on macOS, "Ctrl+Shift+Space" elsewhere).

/** A few combinations that rarely clash with common apps; null turns the shortcut off. */
export const SHORTCUT_PRESETS: readonly (string | null)[] = [
  null,
  'CommandOrControl+Shift+Space',
  'Alt+Space',
  'CommandOrControl+Shift+K',
  'Control+Space',
];

const MAC_KEYS: Record<string, string> = {
  commandorcontrol: '⌘',
  cmdorctrl: '⌘',
  command: '⌘',
  cmd: '⌘',
  super: '⌘',
  meta: '⌘',
  control: '⌃',
  ctrl: '⌃',
  alt: '⌥',
  option: '⌥',
  shift: '⇧',
};

const OTHER_KEYS: Record<string, string> = {
  commandorcontrol: 'Ctrl',
  cmdorctrl: 'Ctrl',
  control: 'Ctrl',
  ctrl: 'Ctrl',
  command: 'Win',
  cmd: 'Win',
  super: 'Win',
  meta: 'Win',
  alt: 'Alt',
  option: 'Alt',
  shift: 'Shift',
};

export function shortcutLabel(accelerator: string | null, mac: boolean): string {
  if (!accelerator) return 'Off';
  const names = mac ? MAC_KEYS : OTHER_KEYS;
  const parts = accelerator.split('+').map((part) => names[part.toLowerCase()] ?? part);
  // macOS writes modifiers as symbols run together (⌘⇧K); elsewhere they're joined with +.
  return mac ? parts.join('') : parts.join('+');
}

export interface ShortcutOption {
  /** The <select> value: the accelerator, or '' for off. */
  value: string;
  accelerator: string | null;
  label: string;
}

/** The presets, plus the current shortcut if it was set to something else. */
export function shortcutOptions(current: string | null, mac: boolean): ShortcutOption[] {
  const list = SHORTCUT_PRESETS.includes(current)
    ? SHORTCUT_PRESETS
    : [...SHORTCUT_PRESETS, current];
  return list.map((accelerator) => ({
    value: accelerator ?? '',
    accelerator,
    label: shortcutLabel(accelerator, mac),
  }));
}

/** Back from a <select> value to the setting. */
export function acceleratorFromValue(value: string): string | null {
  return value === '' ? null : value;
}
