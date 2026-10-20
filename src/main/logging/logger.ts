// Prototype logging: structured lines on the console, plus daily files in the installed app.
// pino replaces this in v1. Never pass note text, file contents or user-entered URLs as
// fields; log ids and actions only.
import fs from 'node:fs';
import path from 'node:path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFields = Record<string, string | number | boolean | null | undefined>;

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
}

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
let minLevel: LogLevel = 'debug';
let logDir: string | null = null;

export const LOG_DAYS_KEPT = 14;

export function setLogLevel(level: LogLevel): void {
  minLevel = level;
}

/**
 * Also writes every line to `dir/main-YYYY-MM-DD.log` (one file per day) and deletes files
 * older than 14 days. Used by the installed app, where there is no terminal to read.
 */
export function enableFileLogging(dir: string, now: number = Date.now()): void {
  fs.mkdirSync(dir, { recursive: true });
  logDir = dir;
  const cutoff = now - LOG_DAYS_KEPT * 24 * 60 * 60 * 1000;
  for (const name of fs.readdirSync(dir)) {
    const match = /^main-(\d{4}-\d{2}-\d{2})\.log$/.exec(name);
    if (match && Date.parse(match[1]) < cutoff) fs.rmSync(path.join(dir, name), { force: true });
  }
}

export function createLogger(module: string): Logger {
  return {
    debug: (msg, fields) => write('debug', module, msg, fields),
    info: (msg, fields) => write('info', module, msg, fields),
    warn: (msg, fields) => write('warn', module, msg, fields),
    error: (msg, fields) => write('error', module, msg, fields),
  };
}

function write(level: LogLevel, module: string, msg: string, fields?: LogFields): void {
  if (ORDER[level] < ORDER[minLevel]) return;
  const suffix = fields && Object.keys(fields).length > 0 ? ` ${JSON.stringify(fields)}` : '';
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${module}] ${msg}${suffix}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
  if (logDir) {
    try {
      // Synchronous on purpose: log volume is tiny and a crash must not lose its last line.
      fs.appendFileSync(path.join(logDir, `main-${line.slice(0, 10)}.log`), `${line}\n`);
    } catch {
      // Never let logging break the app.
    }
  }
}
