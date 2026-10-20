import { describe, expect, it } from 'vitest';
import {
  CODE_NOT_FOUND_MESSAGE,
  openInEditor,
  openTerminal,
  TERMINAL_NOT_FOUND_MESSAGE,
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

describe('openTerminal', () => {
  type Call = { cmd: string; args: string[]; cwd?: string };
  const fake = (platform: NodeJS.Platform, works: string[]) => {
    const calls: Call[] = [];
    const attempt = (cmd: string, args: string[], cwd?: string) => {
      calls.push({ cmd, args, ...(cwd ? { cwd } : {}) });
      return works.includes(cmd)
        ? Promise.resolve()
        : Promise.reject(Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }));
    };
    const d: LauncherDeps = {
      platform,
      spawnDetached: (cmd, args, options) => attempt(cmd, args, options?.cwd),
      run: (cmd, args) => attempt(cmd, args),
    };
    return { calls, deps: d };
  };

  it('asks macOS to open Terminal with the folder as its own argument', async () => {
    const { calls, deps: d } = fake('darwin', ['open']);
    expect(await openTerminal('/my projects/robot; rm -rf ~', d)).toEqual({
      ok: true,
      message: null,
    });
    expect(calls).toEqual([
      { cmd: 'open', args: ['-a', 'Terminal', '/my projects/robot; rm -rf ~'] },
    ]);
  });

  it('prefers Windows Terminal, then falls back to Command Prompt in the folder', async () => {
    const { calls, deps: d } = fake('win32', ['cmd.exe']);
    expect((await openTerminal('C:\\code\\app', d)).ok).toBe(true);
    expect(calls).toEqual([
      { cmd: 'wt', args: ['-d', 'C:\\code\\app'] },
      { cmd: 'cmd.exe', args: ['/K'], cwd: 'C:\\code\\app' },
    ]);
  });

  it('starts the default Linux terminal with the folder as working directory', async () => {
    const { calls, deps: d } = fake('linux', ['x-terminal-emulator']);
    expect((await openTerminal('/home/me/app', d)).ok).toBe(true);
    expect(calls).toEqual([{ cmd: 'x-terminal-emulator', args: [], cwd: '/home/me/app' }]);
  });

  it('says so when no terminal could be opened', async () => {
    const { calls, deps: d } = fake('linux', []);
    expect(await openTerminal('/p', d)).toEqual({
      ok: false,
      message: TERMINAL_NOT_FOUND_MESSAGE,
    });
    expect(calls.map((c) => c.cmd)).toEqual(['x-terminal-emulator', 'gnome-terminal', 'konsole']);
  });

  it('opens a chosen terminal app on macOS the way each one expects', async () => {
    const dir = '/my projects/robot';
    const argsFor = async (id: Parameters<typeof openTerminal>[2]) => {
      const { calls, deps: d } = fake('darwin', ['open']);
      await openTerminal(dir, d, id);
      return calls[0].args;
    };
    expect(await argsFor('iterm')).toEqual(['-a', 'iTerm', dir]);
    expect(await argsFor('warp')).toEqual(['-a', 'Warp', dir]);
    expect(await argsFor('ghostty')).toEqual([
      '-na',
      'Ghostty',
      '--args',
      `--working-directory=${dir}`,
    ]);
    expect(await argsFor('kitty')).toEqual(['-na', 'kitty', '--args', '--directory', dir]);
    expect(await argsFor('wezterm')).toEqual(['-na', 'WezTerm', '--args', 'start', '--cwd', dir]);
  });

  it('names the missing app instead of quietly opening another', async () => {
    const { calls, deps: d } = fake('darwin', []);
    const result = await openTerminal('/p', d, 'warp');
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Couldn't open Warp/);
    expect(calls).toHaveLength(1);
  });

  it('uses the command elsewhere, and offers no iTerm off macOS', async () => {
    const { calls, deps: d } = fake('linux', ['alacritty']);
    expect((await openTerminal('/home/me/app', d, 'alacritty')).ok).toBe(true);
    expect(calls).toEqual([
      { cmd: 'alacritty', args: ['--working-directory', '/home/me/app'], cwd: '/home/me/app' },
    ]);
    expect((await openTerminal('/home/me/app', fake('linux', []).deps, 'iterm')).ok).toBe(false);
  });
});
