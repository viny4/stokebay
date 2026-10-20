// The Lab for one loaded project: header, canvas and the optional Parts Bin panel.
// React Flow keeps its own copy of the nodes while the user drags, so movement stays smooth;
// whenever the saved Lab changes, that copy is rebuilt from it.
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import type { z } from 'zod';
import {
  labAddChecklistInput,
  labAddFilesInput,
  labAddImageDataInput,
  labAddLinkInput,
  labAddNoteInput,
  labAddZoneInput,
  labConnectInput,
  labPickFilesInput,
} from '../../../shared/schemas';
import type { LabData } from '../../../shared/types';
import { PartsBin } from '../../views/PartsBin';
import { errorMessage, guard, useHud } from '../../store/useHud';
import { firstIssue } from './lab-actions';
import {
  DEFAULT_OBJECT_SIZE,
  NEW_ZONE_SIZE,
  centredAt,
  classifyPaste,
  nudgeFree,
  pastedImageName,
  withHttps,
  type Point,
} from './lab-geometry';
import { buildEdges, buildNodes, newNodeId, type LabNode } from './lab-nodes';
import { LAB_CSS } from './lab-styles';
import { LabHeader, type LabTools } from './LabHeader';
import { nodeTypes } from './node-types';
import { movesFor, saveMoves, useCanvasDrag } from './useCanvasDrag';
import { useLabShortcuts } from './useLabShortcuts';

const MAX_FILES_PER_DROP = 50;
const NOTE_SIZE = { w: 256, h: 150 };
const PASTED_IMAGE_SIZE = { w: 260, h: 200 };

const MINIMAP_COLORS: Record<string, string> = {
  zone: 'rgb(56 189 248 / 0.14)',
  note: '#38d6ff',
  checklist: '#34d399',
  link: '#a78bfa',
  image: '#7dd3fc',
  file: '#60a5fa',
  part: '#fbbf24',
};

/** Checks a request with its schema; a problem becomes a toast and the call is skipped. */
function check<S extends z.ZodType>(schema: S, input: z.input<S>): z.output<S> | null {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  useHud.getState().showToast(firstIssue(parsed.error), 'error');
  return null;
}

export function LabWorkspace({ lab }: { lab: LabData }) {
  const projectId = lab.project.id;
  const exitLab = useHud((s) => s.exitLab);
  const runLab = useHud((s) => s.runLab);
  const flow = useReactFlow<LabNode, Edge>();
  const canvasRef = useRef<HTMLDivElement>(null);

  const [partsOpen, setPartsOpen] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  /** The object a toolbar action just made; it opens in edit mode. */
  const [freshId, setFreshId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<LabNode[]>(() => buildNodes(lab, [], null));
  const [selectedEdges, setSelectedEdges] = useState<ReadonlySet<string>>(() => new Set());

  const getNodes = useCallback(() => flow.getNodes(), [flow]);
  const drag = useCanvasDrag(projectId, getNodes, setNodes);
  const { isDragging } = drag;

  useEffect(() => {
    // A save landing mid-drag would snap objects back; the drag's own save re-syncs after.
    if (isDragging()) return;
    setNodes((prev) => buildNodes(lab, prev, freshId));
  }, [lab, freshId, isDragging]);

  const edges = useMemo(() => buildEdges(lab, nodes, selectedEdges), [lab, nodes, selectedEdges]);

  const onNodesChange = useCallback(
    (changes: NodeChange<LabNode>[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  );

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setSelectedEdges((prev) => {
      let next: Set<string> | null = null;
      for (const c of changes) {
        if (c.type !== 'select' || prev.has(c.id) === c.selected) continue;
        next ??= new Set(prev);
        if (c.selected) next.add(c.id);
        else next.delete(c.id);
      }
      return next ?? prev;
    });
  }, []);

  const onConnect = useCallback(
    (c: Connection) => {
      const input = check(labConnectInput, {
        projectId,
        fromNodeId: c.source,
        toNodeId: c.target,
      });
      if (input) guard(() => runLab(() => window.api.labConnect(input)));
    },
    [projectId, runLab],
  );

  /** Flow coordinates of the middle of what the user is looking at. */
  const viewCentre = useCallback((): Point => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return flow.screenToFlowPosition({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
  }, [flow]);

  /** A free top-left spot for a new object of `size`, centred in the view. */
  const spotFor = useCallback(
    (size: { w: number; h: number }): Point =>
      nudgeFree(
        centredAt(viewCentre(), size),
        flow.getNodes().map((n) => n.position),
      ),
    [flow, viewCentre],
  );

  /** Runs an add call; `edit` opens the new object for typing straight away. */
  const add = useCallback(
    (call: () => Promise<LabData | null>, edit: boolean) =>
      guard(async () => {
        const before = useHud.getState().lab;
        const next = await runLab(call);
        if (edit) setFreshId(newNodeId(before, next));
      }),
    [runLab],
  );

  const tools = useMemo<LabTools>(
    () => ({
      addNote() {
        const input = check(labAddNoteInput, {
          projectId,
          title: '',
          body: '',
          ...spotFor(NOTE_SIZE),
        });
        if (input) add(() => window.api.labAddNote(input), true);
      },
      addChecklist() {
        const input = check(labAddChecklistInput, {
          projectId,
          title: 'Checklist',
          items: [],
          ...spotFor(NOTE_SIZE),
        });
        if (input) add(() => window.api.labAddChecklist(input), true);
      },
      async addLink(title, url) {
        const parsed = labAddLinkInput.safeParse({
          projectId,
          title,
          url: withHttps(url),
          ...spotFor(DEFAULT_OBJECT_SIZE),
        });
        if (!parsed.success) return firstIssue(parsed.error);
        try {
          await runLab(() => window.api.labAddLink(parsed.data));
          return null;
        } catch (err) {
          return errorMessage(err);
        }
      },
      addFiles() {
        const input = check(labPickFilesInput, { projectId, ...spotFor(DEFAULT_OBJECT_SIZE) });
        if (input) add(() => window.api.labPickFiles(input), false);
      },
      addZone() {
        const input = check(labAddZoneInput, {
          projectId,
          title: 'New zone',
          ...spotFor(NEW_ZONE_SIZE),
          ...NEW_ZONE_SIZE,
        });
        if (input) add(() => window.api.labAddZone(input), true);
      },
      toggleParts: () => setPartsOpen((open) => !open),
      fitView: () => void flow.fitView({ padding: 0.2, maxZoom: 1, duration: 300 }),
    }),
    [add, flow, projectId, runLab, spotFor],
  );

  const clearSelection = useCallback(() => {
    setNodes((prev) => prev.map((n) => (n.selected ? { ...n, selected: false } : n)));
    setSelectedEdges(new Set());
  }, []);

  useLabShortcuts({
    getNodes,
    getEdges: () => flow.getEdges(),
    clearSelection,
    saveKeyboardMoves: (moved) => saveMoves(projectId, movesFor(moved, flow.getNodes())),
    pasteImage(bytes, mime) {
      const input = check(labAddImageDataInput, {
        projectId,
        name: pastedImageName(mime, new Date()),
        bytes,
        ...spotFor(PASTED_IMAGE_SIZE),
      });
      if (input) add(() => window.api.labAddImageData(input), false);
    },
    pasteText(text) {
      const paste = classifyPaste(text);
      if (paste?.kind === 'link') {
        const input = check(labAddLinkInput, {
          projectId,
          title: '',
          url: paste.url,
          ...spotFor(DEFAULT_OBJECT_SIZE),
        });
        if (input) add(() => window.api.labAddLink(input), false);
      } else if (paste?.kind === 'note') {
        const input = check(labAddNoteInput, {
          projectId,
          title: '',
          body: paste.body,
          ...spotFor(NOTE_SIZE),
        });
        if (input) add(() => window.api.labAddNote(input), false);
      }
    },
  });

  const onDragOver = (event: DragEvent) => {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    if (!dropActive) setDropActive(true);
  };

  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropActive(false);
  };

  const onDrop = (event: DragEvent) => {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    setDropActive(false);
    const paths = [...event.dataTransfer.files]
      .map((file) => window.api.pathForFile(file))
      .filter((p) => p !== '');
    if (paths.length === 0) {
      useHud.getState().showToast("Couldn't read those files. Try + File instead.", 'error');
      return;
    }
    if (paths.length > MAX_FILES_PER_DROP) {
      useHud
        .getState()
        .showToast(`Added the first ${MAX_FILES_PER_DROP} files; drop the rest separately.`);
    }
    const at = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const input = check(labAddFilesInput, {
      projectId,
      paths: paths.slice(0, MAX_FILES_PER_DROP),
      x: Math.round(at.x),
      y: Math.round(at.y),
    });
    if (input) add(() => window.api.labAddFiles(input), false);
  };

  return (
    <div className="flex h-full flex-col">
      <style>{LAB_CSS}</style>
      <LabHeader project={lab.project} partsOpen={partsOpen} tools={tools} onBack={exitLab} />
      <div className="flex min-h-0 flex-1">
        <div
          ref={canvasRef}
          className="lab-canvas relative min-w-0 flex-1"
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <ReactFlow<LabNode, Edge>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            isValidConnection={(c) => c.source !== c.target}
            onNodeDragStart={(_e, _n, dragged) => drag.onDragStart(dragged)}
            onNodeDrag={(_e, _n, dragged) => drag.onDrag(dragged)}
            onNodeDragStop={(_e, _n, dragged) => drag.onDragStop(dragged)}
            onSelectionDragStart={(_e, dragged) => drag.onDragStart(dragged)}
            onSelectionDrag={(_e, dragged) => drag.onDrag(dragged)}
            onSelectionDragStop={(_e, dragged) => drag.onDragStop(dragged)}
            // The pane can swallow the mousedown that would blur an open editor, so blur here
            // to make clicking empty canvas save a note or zone name being edited.
            onPaneClick={blurActiveField}
            connectionMode={ConnectionMode.Loose}
            // Deleting asks first, so the Lab handles Delete/Backspace itself.
            deleteKeyCode={null}
            // Double-click edits objects; it must not also zoom.
            zoomOnDoubleClick={false}
            colorMode="dark"
            fitView
            fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
            minZoom={0.1}
            maxZoom={2.5}
            onlyRenderVisibleElements
            aria-label="Lab canvas"
          >
            <Background
              id="lab-fine"
              variant={BackgroundVariant.Lines}
              gap={32}
              color="rgb(56 189 248 / 0.06)"
            />
            <Background
              id="lab-coarse"
              variant={BackgroundVariant.Lines}
              gap={160}
              color="rgb(56 189 248 / 0.14)"
            />
            <Controls showInteractive={false} position="bottom-left" />
            <MiniMap
              pannable
              zoomable
              ariaLabel="Lab overview"
              nodeColor={(n) => MINIMAP_COLORS[n.type ?? ''] ?? '#38d6ff'}
              nodeStrokeWidth={0}
            />
          </ReactFlow>

          {lab.nodes.length === 0 ? <EmptyHint /> : null}
          {dropActive ? <DropOverlay /> : null}
        </div>

        {/* The Parts Bin draws its own fixed side panel over the right of the canvas. */}
        {partsOpen ? <PartsBin lab={lab} onClose={() => setPartsOpen(false)} /> : null}
      </div>
    </div>
  );
}

function blurActiveField() {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body) active.blur();
}

function EmptyHint() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="hud-frame px-10 py-8 text-center">
        <p className="font-display text-sm tracking-[0.25em] text-status-active uppercase">
          Empty Lab
        </p>
        <p className="mt-3 font-hud text-base text-hud-muted">
          Drop files here, paste anything, or use the toolbar.
        </p>
      </div>
    </div>
  );
}

function DropOverlay() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-3 z-10 flex items-center justify-center border-2 border-dashed border-status-active/80 bg-status-active/[0.06] shadow-[inset_0_0_60px_-10px_rgb(56_214_255/0.6),0_0_30px_-8px_rgb(56_214_255/0.7)]"
    >
      <p className="font-display text-base tracking-[0.3em] text-status-active uppercase drop-shadow-[0_0_10px_rgb(56_214_255/0.9)]">
        Drop to add to the Lab
      </p>
    </div>
  );
}
