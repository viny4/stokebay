import { describe, expect, it } from 'vitest';
import { columnCount, nextIndex } from '../src/renderer/views/grid-nav';

describe('columnCount', () => {
  it('counts resolved tracks', () => {
    expect(columnCount('248px 248px 248px')).toBe(3);
    expect(columnCount('  300.5px   300.5px ')).toBe(2);
  });

  it('falls back to one column', () => {
    expect(columnCount('none')).toBe(1);
    expect(columnCount('')).toBe(1);
  });
});

describe('nextIndex', () => {
  // 10 cards in 4 columns:
  //  0 1 2 3
  //  4 5 6 7
  //  8 9
  const move = (from: number, key: string) => nextIndex(from, key, 10, 4);

  it('moves left and right by one and stops at the ends', () => {
    expect(move(5, 'ArrowRight')).toBe(6);
    expect(move(5, 'ArrowLeft')).toBe(4);
    expect(move(0, 'ArrowLeft')).toBe(0);
    expect(move(9, 'ArrowRight')).toBe(9);
  });

  it('wraps left/right across rows in reading order', () => {
    expect(move(3, 'ArrowRight')).toBe(4);
    expect(move(4, 'ArrowLeft')).toBe(3);
  });

  it('moves up and down by a row', () => {
    expect(move(1, 'ArrowDown')).toBe(5);
    expect(move(5, 'ArrowDown')).toBe(9);
    expect(move(9, 'ArrowUp')).toBe(5);
    expect(move(2, 'ArrowUp')).toBe(2);
  });

  it('lands on the last card when the row below is shorter', () => {
    expect(move(7, 'ArrowDown')).toBe(9);
    expect(move(6, 'ArrowDown')).toBe(9);
  });

  it('stays put when already on the last row', () => {
    expect(move(8, 'ArrowDown')).toBe(8);
  });

  it('jumps with Home and End', () => {
    expect(move(6, 'Home')).toBe(0);
    expect(move(2, 'End')).toBe(9);
  });

  it('ignores other keys and empty grids', () => {
    expect(move(3, 'Enter')).toBeNull();
    expect(nextIndex(0, 'ArrowRight', 0, 4)).toBeNull();
  });

  it('treats a non-positive column count as one column', () => {
    expect(nextIndex(2, 'ArrowDown', 5, 0)).toBe(3);
  });
});
