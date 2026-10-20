// Editors "Open in…" can use. `cli` is the terminal command; `app` is the macOS app name used
// as a fallback, because apps started from Finder don't get the terminal's PATH.
export const EDITORS = [
  { id: 'vscode', name: 'VS Code', cli: 'code', app: 'Visual Studio Code' },
  { id: 'cursor', name: 'Cursor', cli: 'cursor', app: 'Cursor' },
  { id: 'zed', name: 'Zed', cli: 'zed', app: 'Zed' },
  { id: 'windsurf', name: 'Windsurf', cli: 'windsurf', app: 'Windsurf' },
  { id: 'sublime', name: 'Sublime Text', cli: 'subl', app: 'Sublime Text' },
] as const;

export type EditorId = (typeof EDITORS)[number]['id'];
export type Editor = (typeof EDITORS)[number];

export const EDITOR_IDS = EDITORS.map((e) => e.id) as [EditorId, ...EditorId[]];

export function editorById(id: string | null | undefined): Editor {
  return EDITORS.find((e) => e.id === id) ?? EDITORS[0];
}
