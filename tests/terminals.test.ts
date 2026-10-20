import { spawn } from 'node-pty';
import { describe, expect, it, vi } from 'vitest';
import {
  MAX_TERMINALS,
  TerminalManager,
  defaultShell,
  shellEnv,
  type Pty,
  type SpawnPty,
} from '../src/main/services/terminals';
import { tempDir } from './helpers';

class FakePty implements Pty {
  written: string[] = [];
  size: [number, number] = [80, 24];
  killed = false;
  private dataListener: (data: string) => void = () => undefined;
  private exitListener: (e: { exitCode: number }) => void = () => undefined;
  onData(listener: (data: string) => void) {
    this.dataListener = listener;
  }
  onExit(listener: (e: { exitCode: number }) => void) {
    this.exitListener = listener;
  }
  write(data: string) {
    this.written.push(data);
  }
  resize(cols: number, rows: number) {
    this.size = [cols, rows];
  }
  kill() {
    this.killed = true;
  }
  print(data: string) {
    this.dataListener(data);
  }
  exit(exitCode: number) {
    this.exitListener({ exitCode });
  }
}

function setup() {
  const ptys: FakePty[] = [];
  const spawned: Parameters<SpawnPty>[] = [];
  const events = { data: vi.fn(), exit: vi.fn() };
  const spawnFake: SpawnPty = (...args) => {
    spawned.push(args);
    const pty = new FakePty();
    ptys.push(pty);
    return pty;
  };
  const manager = new TerminalManager(spawnFake, events, 'darwin', { SHELL: '/bin/zsh' });
  return { manager, ptys, spawned, events };
}

describe('TerminalManager', () => {
  it('starts a login shell in the folder and passes typing and sizes through', () => {
    const { manager, ptys, spawned } = setup();
    const info = manager.create({ projectId: 'p1', title: 'Chess engine', cwd: '/code/chess' });
    expect(info).toMatchObject({ projectId: 'p1', title: 'Chess engine', cwd: '/code/chess' });
    expect(spawned[0][0]).toBe('/bin/zsh');
    expect(spawned[0][1]).toEqual(['-l']);
    expect(spawned[0][2].cwd).toBe('/code/chess');

    manager.write(info.id, 'ls\r');
    manager.resize(info.id, 120, 40);
    expect(ptys[0].written).toEqual(['ls\r']);
    expect(ptys[0].size).toEqual([120, 40]);
  });

  it('starts the shell at the size the window measured, so the prompt is drawn once', () => {
    const { manager, spawned } = setup();
    const info = manager.create({
      projectId: null,
      title: 'Home',
      cwd: '/tmp',
      cols: 97,
      rows: 41,
    });
    expect(spawned[0][2]).toMatchObject({ cols: 97, rows: 41 });
    expect(info).toMatchObject({ cols: 97, rows: 41 });
    expect(manager.create({ projectId: null, title: 'B', cwd: '/tmp' })).toMatchObject({
      cols: 80,
      rows: 24,
    });
  });

  it('batches output into one message', async () => {
    vi.useFakeTimers();
    try {
      const { manager, ptys, events } = setup();
      const info = manager.create({ projectId: null, title: 'Home', cwd: '/tmp' });
      ptys[0].print('a');
      ptys[0].print('b');
      ptys[0].print('c');
      expect(events.data).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(20);
      expect(events.data).toHaveBeenCalledTimes(1);
      expect(events.data).toHaveBeenCalledWith(info.id, 'abc');
    } finally {
      vi.useRealTimers();
    }
  });

  it('sends what was left, then the exit, when the shell ends', () => {
    const { manager, ptys, events } = setup();
    const info = manager.create({ projectId: null, title: 'Home', cwd: '/tmp' });
    ptys[0].print('bye');
    ptys[0].exit(0);
    expect(events.data).toHaveBeenCalledWith(info.id, 'bye');
    expect(events.exit).toHaveBeenCalledWith(info.id, 0);
    expect(manager.count).toBe(0);
  });

  it('kills shells, and ignores unknown ids', () => {
    const { manager, ptys } = setup();
    const a = manager.create({ projectId: null, title: 'A', cwd: '/tmp' });
    manager.create({ projectId: null, title: 'B', cwd: '/tmp' });
    manager.kill(a.id);
    expect(ptys[0].killed).toBe(true);
    manager.write('nope', 'x');
    manager.killAll();
    expect(ptys[1].killed).toBe(true);
    expect(manager.count).toBe(0);
  });

  it('refuses to open more than the limit', () => {
    const { manager } = setup();
    for (let i = 0; i < MAX_TERMINALS; i++) {
      manager.create({ projectId: null, title: String(i), cwd: '/tmp' });
    }
    expect(() => manager.create({ projectId: null, title: 'one more', cwd: '/tmp' })).toThrow(
      /Close a terminal/,
    );
  });
});

describe('shell setup', () => {
  it("uses the user's shell, with sensible fallbacks per platform", () => {
    expect(defaultShell('darwin', { SHELL: '/opt/homebrew/bin/fish' })).toEqual({
      shell: '/opt/homebrew/bin/fish',
      args: ['-l'],
    });
    expect(defaultShell('darwin', {}).shell).toBe('/bin/zsh');
    expect(defaultShell('linux', {}).shell).toBe('/bin/bash');
    expect(defaultShell('win32', {}).shell).toBe('powershell.exe');
  });

  it('fills in a UTF-8 locale and drops Electron switches', () => {
    const env = shellEnv({ PATH: '/usr/bin', ELECTRON_RUN_AS_NODE: '1', HOME: '/Users/a' });
    expect(env).toMatchObject({ PATH: '/usr/bin', HOME: '/Users/a', LANG: 'en_US.UTF-8' });
    expect(env.TERM).toBe('xterm-256color');
    expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined();
    expect(shellEnv({ LANG: 'ta_IN.UTF-8' }).LANG).toBe('ta_IN.UTF-8');
  });
});

describe.runIf(process.platform !== 'win32')('a real shell', () => {
  it('runs in the given folder and reports its output', async () => {
    const dir = await tempDir();
    const output: string[] = [];
    const exited = new Promise<number>((resolve) => {
      const manager = new TerminalManager(
        // A plain sh with a command, so the test doesn't depend on the user's shell setup.
        (_shell, _args, options) => spawn('/bin/sh', ['-c', 'pwd; echo ready'], options),
        { data: (_id, data) => output.push(data), exit: (_id, code) => resolve(code) },
      );
      manager.create({ projectId: null, title: 'test', cwd: dir });
    });
    expect(await exited).toBe(0);
    const text = output.join('');
    expect(text).toContain('ready');
    // macOS temp folders live behind the /private symlink.
    expect(text.replace('/private', '')).toContain(dir.replace('/private', ''));
  });
});
