// Pure helpers for the Lab canvas: rectangles, zone membership, line sides and the small text
// rules (links, pastes, sizes). No DOM or React here so they can be unit tested in Node.

export interface Point {
  x: number;
  y: number;
}

export interface Rect extends Point {
  w: number;
  h: number;
}

export interface ZoneRect extends Rect {
  moduleId: string;
}

/** Size used for an object React Flow hasn't measured yet. */
export const DEFAULT_OBJECT_SIZE = { w: 240, h: 120 };

/** Size of a zone created from the toolbar. */
export const NEW_ZONE_SIZE = { w: 380, h: 280 };

export function centre(rect: Rect): Point {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

export function contains(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.w &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.h
  );
}

/**
 * The zone an object belongs to: the one containing its centre. When zones overlap the
 * smallest wins, because a small zone drawn on a big one is meant as the more specific group.
 */
export function containingZone(rect: Rect, zones: ZoneRect[]): string | null {
  const point = centre(rect);
  let best: ZoneRect | null = null;
  for (const zone of zones) {
    if (!contains(zone, point)) continue;
    if (!best || zone.w * zone.h < best.w * best.h) best = zone;
  }
  return best?.moduleId ?? null;
}

export type Side = 't' | 'r' | 'b' | 'l';

/**
 * Which handles a line should use so it leaves and enters on the facing sides. Stored lines
 * only know their two objects, so this is worked out from where the objects are now.
 */
export function facingSides(from: Rect, to: Rect): { source: Side; target: Side } {
  const a = centre(from);
  const b = centre(to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? { source: 'r', target: 'l' } : { source: 'l', target: 'r' };
  }
  return dy >= 0 ? { source: 'b', target: 't' } : { source: 't', target: 'b' };
}

/** Top-left position that puts an object of `size` centred on `point`, in whole pixels. */
export function centredAt(point: Point, size: { w: number; h: number }): Point {
  return { x: Math.round(point.x - size.w / 2), y: Math.round(point.y - size.h / 2) };
}

/**
 * Steps a new object's spot down-right while another object already starts there, so adding
 * twice without moving the view doesn't hide the first one under the second.
 */
export function nudgeFree(point: Point, taken: Point[], step = 24): Point {
  let spot = point;
  for (let i = 0; i < 50; i += 1) {
    const hit = taken.some(
      (t) => Math.abs(t.x - spot.x) < step / 2 && Math.abs(t.y - spot.y) < step / 2,
    );
    if (!hit) return spot;
    spot = { x: spot.x + step, y: spot.y + step };
  }
  return spot;
}

/** People type "example.com"; the store only accepts full http(s) addresses. */
export function withHttps(input: string): string {
  const value = input.trim();
  if (value === '' || /^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return value;
  return `https://${value}`;
}

export function hostOf(url: string | null): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export type PasteKind = { kind: 'link'; url: string } | { kind: 'note'; body: string } | null;

/** A single web address becomes a link; any other text becomes a note. */
export function classifyPaste(text: string): PasteKind {
  const value = text.trim();
  if (value === '') return null;
  if (!/\s/.test(value) && /^(https?:\/\/|www\.)\S+\.\S+/i.test(value)) {
    return { kind: 'link', url: withHttps(value) };
  }
  return { kind: 'note', body: value };
}

const IMAGE_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

/** e.g. `pasted-20261020-153012.png`, so pasted screenshots sort by time in the media folder. */
export function pastedImageName(mime: string, at: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`;
  return `pasted-${stamp}.${IMAGE_EXT[mime] ?? 'png'}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/** Short type label for a file card: the extension, else the MIME subtype. */
export function fileTypeLabel(name: string, mime: string): string {
  const dot = name.lastIndexOf('.');
  if (dot > 0 && dot < name.length - 1) return name.slice(dot + 1).toUpperCase();
  const sub = mime.split('/')[1];
  return sub ? sub.toUpperCase() : 'FILE';
}

/** Id for a new checklist item (the store accepts any short unique string). */
export function newItemId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
