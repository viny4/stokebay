// Index math for arrow-key navigation in the card grid. Kept free of the DOM so it can be
// unit tested; the grid reads its column count from the rendered layout and passes it in.

/**
 * Number of columns from a computed `grid-template-columns` value. Browsers resolve
 * `repeat(auto-fill, …)` to one length per track (e.g. "248px 248px 248px"), so the track
 * count is the column count. Anything unparseable falls back to a single column.
 */
export function columnCount(gridTemplateColumns: string): number {
  const value = gridTemplateColumns.trim();
  if (value === '' || value === 'none') return 1;
  return Math.max(1, value.split(/\s+/).length);
}

/**
 * Index to focus after a navigation key, or null when the key isn't one we handle (so the
 * caller leaves the event alone). Moves that would leave the grid stay put, except moving
 * down into a shorter last row, which lands on its final card rather than doing nothing.
 */
export function nextIndex(
  current: number,
  key: string,
  count: number,
  columns: number,
): number | null {
  if (count <= 0) return null;
  const cols = Math.max(1, columns);
  const last = count - 1;
  const clamp = (i: number) => Math.min(last, Math.max(0, i));

  switch (key) {
    case 'ArrowLeft':
      return clamp(current - 1);
    case 'ArrowRight':
      return clamp(current + 1);
    case 'ArrowUp':
      return current - cols >= 0 ? current - cols : current;
    case 'ArrowDown': {
      if (current + cols <= last) return current + cols;
      const isLastRow = Math.floor(current / cols) === Math.floor(last / cols);
      return isLastRow ? current : last;
    }
    case 'Home':
      return 0;
    case 'End':
      return last;
    default:
      return null;
  }
}
