// The built-in terminal: real shells (through node-pty) that the renderer shows with xterm.js.
// The renderer never touches the shell itself; it sends keystrokes and sizes over IPC and gets
// the output pushed back. Nothing typed or printed is ever logged.
import os from 'node:os';
import type { Id, TerminalInfo } from '../../shared/types';
import { newId } from '../store/ids';
import { createLogger } from '../logging/logger';

const log = createLogger('terminals');

/** More than this many open shells is almost certainly forgotten tabs, not real work. */
export const MAX_TERMINALS = 12;
/** Output is gathered for this long before it's sent, so `cat bigfile` isn't 10,000 IPC messages. */
const FLUSH_MS = 8;

/** The part of node-pty this service uses, so tests can pass a fake. */
export interface Pty {
  onData(listener: (data: string) => void): void;
  onExit(listener: (event: { exitCode: number }) => void): void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
}
export type SpawnPty = (
  shell: string,
  args: string[],
  options: { cwd: string; cols: number; rows: number; env: Record<string, string> },
) => Pty;

export interface TerminalEvents {
  data: (id: Id, data: string) => void;
  exit: (id: Id, exitCode: number) => void;
}

interface Session {
  info: TerminalInfo;
  pty: Pty;
  pending: string;
  timer: ReturnType<typeof setTimeout> | null;
}

export class TerminalManager {
  private readonly sessions = new Map<Id, Session>();

  constructor(
    private readonly spawn: SpawnPty,
    private readonly events: TerminalEvents,
    private readonly platform: NodeJS.Platform = process.platform,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  create(input: { projectId: Id | null; title: string; cwd: string | null }): TerminalInfo {
    if (this.sessions.size >= MAX_TERMINALS) {
      throw new Error(`Close a terminal first; ${MAX_TERMINALS} are open.`);
    }
    const cwd = input.cwd ?? os.homedir();
    const { shell, args } = defaultShell(this.platform, this.env);
    const pty = this.spawn(shell, args, { cwd, cols: 80, rows: 24, env: shellEnv(this.env) });
    const info: TerminalInfo = { id: newId(), projectId: input.projectId, title: input.title, cwd };
    const session: Session = { info, pty, pending: '', timer: null };
    this.sessions.set(info.id, session);

    pty.onData((data) => {
      session.pending += data;
      session.timer ??= setTimeout(() => this.flush(session), FLUSH_MS);
    });
    pty.onExit(({ exitCode }) => {
      this.flush(session);
      this.sessions.delete(info.id);
      this.events.exit(info.id, exitCode);
    });
    log.info('terminal opened', { id: info.id, projectId: info.projectId });
    return info;
  }

  write(id: Id, data: string): void {
    this.sessions.get(id)?.pty.write(data);
  }

  resize(id: Id, cols: number, rows: number): void {
    try {
      this.sessions.get(id)?.pty.resize(cols, rows);
    } catch {
      // The shell exited between the resize and now; its exit event is on the way.
    }
  }

  kill(id: Id): void {
    const session = this.sessions.get(id);
    if (!session) return;
    this.sessions.delete(id);
    if (session.timer) clearTimeout(session.timer);
    try {
      session.pty.kill();
    } catch {
      // Already gone.
    }
  }

  killAll(): void {
    for (const id of [...this.sessions.keys()]) this.kill(id);
  }

  get count(): number {
    return this.sessions.size;
  }

  private flush(session: Session): void {
    if (session.timer) clearTimeout(session.timer);
    session.timer = null;
    if (!session.pending) return;
    const data = session.pending;
    session.pending = '';
    this.events.data(session.info.id, data);
  }
}

/** The user's own shell, started as a login shell so their PATH and prompt load as usual. */
export function defaultShell(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): { shell: string; args: string[] } {
  if (platform === 'win32') return { shell: 'powershell.exe', args: ['-NoLogo'] };
  const shell = env.SHELL || (platform === 'darwin' ? '/bin/zsh' : '/bin/bash');
  return { shell, args: ['-l'] };
}

/**
 * The environment a shell starts with. Apps opened from Finder get a bare environment with no
 * locale, which breaks UTF-8 (and prompt icons), so a UTF-8 locale is filled in when missing.
 * Electron's own switches must not leak into the user's tools.
 */
export function shellEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined || key.startsWith('ELECTRON_')) continue;
    out[key] = value;
  }
  out.TERM = 'xterm-256color';
  out.COLORTERM = 'truecolor';
  out.TERM_PROGRAM = 'Stokebay';
  if (!out.LANG && !out.LC_ALL) out.LANG = 'en_US.UTF-8';
  return out;
}
