import { describe, expect, it } from 'vitest';
import {
  centredAt,
  classifyPaste,
  containingZone,
  facingSides,
  fileTypeLabel,
  formatBytes,
  hostOf,
  nudgeFree,
  pastedImageName,
  withHttps,
} from '../src/renderer/components/lab/lab-geometry';
import { buildEdges, buildNodes, newNodeId } from '../src/renderer/components/lab/lab-nodes';
import type { Entry, LabData, ProjectSummary } from '../src/shared/types';

describe('containingZone', () => {
  const big = { moduleId: 'big', x: 0, y: 0, w: 1000, h: 1000 };
  const small = { moduleId: 'small', x: 100, y: 100, w: 200, h: 200 };

  it('uses the centre of the object', () => {
    expect(containingZone({ x: 950, y: 950, w: 200, h: 200 }, [big])).toBeNull();
    expect(containingZone({ x: 850, y: 850, w: 200, h: 200 }, [big])).toBe('big');
  });

  it('prefers the smallest zone when zones overlap', () => {
    expect(containingZone({ x: 150, y: 150, w: 40, h: 40 }, [big, small])).toBe('small');
    expect(containingZone({ x: 500, y: 500, w: 40, h: 40 }, [small, big])).toBe('big');
  });

  it('is null with no zones', () => {
    expect(containingZone({ x: 0, y: 0, w: 10, h: 10 }, [])).toBeNull();
  });
});

describe('facingSides', () => {
  const a = { x: 0, y: 0, w: 100, h: 100 };
  it('picks left/right for side-by-side objects', () => {
    expect(facingSides(a, { x: 300, y: 20, w: 100, h: 100 })).toEqual({ source: 'r', target: 'l' });
    expect(facingSides(a, { x: -300, y: 20, w: 100, h: 100 })).toEqual({
      source: 'l',
      target: 'r',
    });
  });
  it('picks top/bottom for stacked objects', () => {
    expect(facingSides(a, { x: 10, y: 400, w: 100, h: 100 })).toEqual({ source: 'b', target: 't' });
    expect(facingSides(a, { x: 10, y: -400, w: 100, h: 100 })).toEqual({
      source: 't',
      target: 'b',
    });
  });
});

describe('placement', () => {
  it('centres a size on a point in whole pixels', () => {
    expect(centredAt({ x: 100.4, y: 50 }, { w: 40, h: 21 })).toEqual({ x: 80, y: 40 });
  });
  it('nudges past objects already at the spot', () => {
    expect(nudgeFree({ x: 0, y: 0 }, [])).toEqual({ x: 0, y: 0 });
    expect(nudgeFree({ x: 0, y: 0 }, [{ x: 2, y: -3 }])).toEqual({ x: 24, y: 24 });
    expect(
      nudgeFree({ x: 0, y: 0 }, [
        { x: 0, y: 0 },
        { x: 24, y: 24 },
      ]),
    ).toEqual({ x: 48, y: 48 });
  });
});

describe('text helpers', () => {
  it('adds https:// only when there is no scheme', () => {
    expect(withHttps('example.com')).toBe('https://example.com');
    expect(withHttps('  http://a.io ')).toBe('http://a.io');
    expect(withHttps('')).toBe('');
  });

  it('classifies pasted text', () => {
    expect(classifyPaste('  ')).toBeNull();
    expect(classifyPaste('https://github.com/x/y')).toEqual({
      kind: 'link',
      url: 'https://github.com/x/y',
    });
    expect(classifyPaste('www.example.com/a')).toEqual({
      kind: 'link',
      url: 'https://www.example.com/a',
    });
    expect(classifyPaste('see https://a.io later')).toEqual({
      kind: 'note',
      body: 'see https://a.io later',
    });
    expect(classifyPaste('hello')).toEqual({ kind: 'note', body: 'hello' });
  });

  it('shows hosts without www', () => {
    expect(hostOf('https://www.example.com/a')).toBe('example.com');
    expect(hostOf(null)).toBe('');
  });

  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(250 * 1024 * 1024)).toBe('250 MB');
  });

  it('labels file types', () => {
    expect(fileTypeLabel('board.kicad_pcb', '')).toBe('KICAD_PCB');
    expect(fileTypeLabel('README', 'text/plain')).toBe('PLAIN');
    expect(fileTypeLabel('README', '')).toBe('FILE');
  });

  it('names pasted images by time and type', () => {
    const at = new Date(2026, 9, 20, 15, 30, 12);
    expect(pastedImageName('image/png', at)).toBe('pasted-20261020-153012.png');
    expect(pastedImageName('image/jpeg', at)).toBe('pasted-20261020-153012.jpg');
    expect(pastedImageName('image/x-unknown', at)).toBe('pasted-20261020-153012.png');
  });
});

function entry(id: string, type: Entry['type']): Entry {
  return {
    id,
    projectId: 'p',
    type,
    title: id,
    body: '',
    url: null,
    checklist: null,
    file: null,
    moduleId: null,
    createdAt: 0,
  };
}

function lab(): LabData {
  return {
    project: { id: 'p' } as ProjectSummary,
    modules: [{ id: 'm1', projectId: 'p', title: 'Code', color: null, sortOrder: 0 }],
    entries: [entry('e1', 'note'), entry('e2', 'checklist')],
    parts: [],
    nodes: [
      { id: 'n1', projectId: 'p', refType: 'entry', refId: 'e1', x: 0, y: 0, w: null, h: null },
      { id: 'n2', projectId: 'p', refType: 'entry', refId: 'e2', x: 500, y: 0, w: null, h: null },
      { id: 'z1', projectId: 'p', refType: 'module', refId: 'm1', x: 0, y: 300, w: 400, h: 300 },
      { id: 'gone', projectId: 'p', refType: 'part', refId: 'missing', x: 0, y: 0, w: 1, h: 1 },
    ],
    edges: [{ id: 'l1', projectId: 'p', fromNodeId: 'n1', toNodeId: 'n2' }],
  };
}

describe('buildNodes', () => {
  it('joins canvas nodes to their objects and skips dangling ones', () => {
    const nodes = buildNodes(lab(), [], 'n1');
    expect(nodes.map((n) => [n.id, n.type])).toEqual([
      ['n1', 'note'],
      ['n2', 'checklist'],
      ['z1', 'zone'],
    ]);
    const zone = nodes.find((n) => n.id === 'z1');
    expect(zone).toMatchObject({ width: 400, height: 300 });
    expect(zone?.zIndex).toBeLessThan(-1000);
    expect(nodes[0].data).toMatchObject({ autoEdit: true });
    expect(nodes[1].data).toMatchObject({ autoEdit: false });
  });

  it('keeps selection and measured size from the previous nodes', () => {
    const first = buildNodes(lab(), [], null);
    first[0] = { ...first[0], selected: true, measured: { width: 256, height: 140 } };
    const again = buildNodes(lab(), first, null);
    expect(again[0]).toMatchObject({ selected: true, measured: { width: 256, height: 140 } });
    expect(again[1].selected).toBe(false);
  });
});

describe('buildEdges', () => {
  it('attaches lines to the facing sides and marks selection', () => {
    const data = lab();
    const edges = buildEdges(data, buildNodes(data, [], null), new Set(['l1']));
    expect(edges).toEqual([
      expect.objectContaining({
        id: 'l1',
        source: 'n1',
        target: 'n2',
        sourceHandle: 'r',
        targetHandle: 'l',
        selected: true,
      }),
    ]);
  });
});

describe('newNodeId', () => {
  it('finds the node an action added', () => {
    const before = lab();
    const after = lab();
    after.nodes.push({ ...after.nodes[0], id: 'fresh' });
    expect(newNodeId(before, after)).toBe('fresh');
    expect(newNodeId(before, before)).toBeNull();
    expect(newNodeId(before, null)).toBeNull();
  });
});
