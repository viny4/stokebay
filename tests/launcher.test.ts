import { describe, expect, it } from 'vitest';
import {
  CODE_NOT_FOUND_MESSAGE,
  openInEditor,
  type LauncherDeps,
} from '../src/main/services/launcher';

function deps(overrides: Partial<LauncherDeps>, calls: string[][]): LauncherDeps {
  const notFound = () =>
    Promise.reject(Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }));
  return {
    spawnDetached: (cmd, args) => (calls.push([cmd, ...args]), notFound()),
    run: (cmd, args) => (calls.push([cmd, ...args]), notFound()),
    platform: 'darwin',
    ...overrides,
  };
}

describe('openInEditor', () => {
  it('uses `code` with the folder as a separate argument', async () => {
    const calls: string[][] = [];
    const result = await openInEditor(
      '/my projects/robot arm',
      deps({ spawnDetached: async (cmd, args) => void calls.push([cmd, ...args]) }, calls),
    );
    expect(result).toEqual({ ok: true, message: null });
    expect(calls).toEqual([['code', '/my projects/robot arm']]);
  });

  it('falls back to `open -a` on macOS when `code` is missing', async () => {
    const calls: string[][] = [];
    const result = await openInEditor(
      '/p',
      deps({ run: async (cmd, args) => void calls.push([cmd, ...args]) }, calls),
    );
    expect(result.ok).toBe(true);
    expect(calls).toEqual([
      ['code', '/p'],
      ['open', '-a', 'Visual Studio Code', '/p'],
    ]);
  });

  it('explains how to install the `code` command when both fail', async () => {
    const calls: string[][] = [];
    expect(await openInEditor('/p', deps({}, calls))).toEqual({
      ok: false,
      message: CODE_NOT_FOUND_MESSAGE,
    });
  });

  it('does not try the macOS fallback on other systems', async () => {
    const calls: string[][] = [];
    await openInEditor('/p', deps({ platform: 'linux' }, calls));
    expect(calls).toEqual([['code', '/p']]);
  });
});

describe('openInEditor with a chosen editor', () => {
  it("uses the editor's own command, then its app name on macOS", async () => {
    const calls: string[][] = [];
    const result = await openInEditor(
      '/p',
      deps({ run: async (cmd, args) => void calls.push([cmd, ...args]) }, calls),
      'cursor',
    );
    expect(result.ok).toBe(true);
    expect(calls).toEqual([
      ['cursor', '/p'],
      ['open', '-a', 'Cursor', '/p'],
    ]);
  });

  it('names the editor when it cannot be opened', async () => {
    const result = await openInEditor('/p', deps({}, []), 'zed');
    expect(result).toEqual({
      ok: false,
      message: "Couldn't open Zed. Is it installed? You can pick another editor in Settings.",
    });
  });
});
