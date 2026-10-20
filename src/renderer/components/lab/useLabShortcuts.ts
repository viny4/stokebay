// Keyboard and clipboard for the Lab. These listen on the window because the canvas, its
// nodes and the toolbar can all hold focus; anything typed into a field is left alone.
import type { Edge } from '@xyflow/react';
import { useEffect, useRef } from 'react';
import { MAX_PASTE_BYTES } from '../../../shared/schemas';
import type { Id } from '../../../shared/types';
import { guard, useHud } from '../../store/useHud';
import { isTyping } from './lab-actions';
import type { LabNode } from './lab-nodes';

export interface ShortcutHandlers {
  getNodes(): LabNode[];
  getEdges(): Edge[];
  clearSelection(): void;
  /** Objects moved with the arrow keys; called once the keys go quiet. */
  saveKeyboardMoves(nodes: LabNode[]): void;
  pasteImage(bytes: Uint8Array<ArrayBuffer>, mime: string): void;
  pasteText(text: string): void;
}

const ARROW_SAVE_DELAY_MS = 400;

export function useLabShortcuts(handlers: ShortcutHandlers): void {
  // Read through a ref so the listeners are added once, yet always see the latest handlers.
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    let arrowTimer: ReturnType<typeof setTimeout> | undefined;
    const blocked = (target: EventTarget | null) =>
      useHud.getState().dialog.kind !== 'none' || isTyping(target);

    const onKeyDown = (event: KeyboardEvent) => {
      if (blocked(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      const h = ref.current;

      if (event.key === 'Delete' || event.key === 'Backspace') {
        const edges = h.getEdges().filter((e) => e.selected);
        if (edges.length > 0) {
          event.preventDefault();
          h.clearSelection();
          guard(async () => {
            for (const edge of edges) {
              await useHud.getState().runLab(() => window.api.labDisconnect(edge.id));
            }
          });
          return;
        }
        const nodes = h.getNodes().filter((n) => n.selected);
        if (nodes.length > 0) {
          event.preventDefault();
          confirmRemove(nodes);
        }
        return;
      }

      if (event.key === 'Escape') {
        const anySelected =
          h.getNodes().some((n) => n.selected) || h.getEdges().some((e) => e.selected);
        if (anySelected) h.clearSelection();
        else useHud.getState().exitLab();
        return;
      }

      // React Flow moves focused, selected nodes with the arrows but never reports a "stop".
      if (
        event.key.startsWith('Arrow') &&
        event.target instanceof HTMLElement &&
        event.target.closest('.react-flow__node')
      ) {
        clearTimeout(arrowTimer);
        arrowTimer = setTimeout(() => {
          const moved = ref.current.getNodes().filter((n) => n.selected);
          if (moved.length > 0) ref.current.saveKeyboardMoves(moved);
        }, ARROW_SAVE_DELAY_MS);
      }
    };

    const onPaste = (event: ClipboardEvent) => {
      if (blocked(event.target) || !event.clipboardData) return;
      const h = ref.current;
      const image = [...event.clipboardData.items].find(
        (i) => i.kind === 'file' && i.type.startsWith('image/'),
      );
      const file = image?.getAsFile();
      if (file) {
        event.preventDefault();
        if (file.size > MAX_PASTE_BYTES) {
          useHud.getState().showToast('That image is too big to paste.', 'error');
          return;
        }
        guard(async () => h.pasteImage(new Uint8Array(await file.arrayBuffer()), file.type));
        return;
      }
      const text = event.clipboardData.getData('text/plain');
      if (text.trim()) {
        event.preventDefault();
        h.pasteText(text);
      }
    };

    // Files dropped outside the canvas would otherwise make the window navigate to them.
    const stopDrop = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('paste', onPaste);
    window.addEventListener('dragover', stopDrop);
    window.addEventListener('drop', stopDrop);
    return () => {
      clearTimeout(arrowTimer);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('dragover', stopDrop);
      window.removeEventListener('drop', stopDrop);
    };
  }, []);
}

function describe(node: LabNode): string {
  if (node.type === 'zone') {
    return `This removes the zone “${node.data.module.title}”. The objects inside it stay on the canvas.`;
  }
  if (node.type === 'part') {
    return `This removes “${node.data.part.name}” from the Lab and the Parts Bin.`;
  }
  const { entry } = node.data;
  const name = entry.title || entry.file?.name || 'this object';
  if (entry.file?.storage === 'copy') {
    return `This removes “${name}” and deletes the copy of the file kept in the Lab. The original isn't touched.`;
  }
  if (entry.file?.storage === 'link') {
    return `This removes “${name}” from the Lab. The file itself stays where it is.`;
  }
  return `This removes “${name}” from the Lab. It can't be undone.`;
}

function confirmRemove(nodes: LabNode[]): void {
  const ids: Id[] = nodes.map((n) => n.id);
  const message =
    nodes.length === 1
      ? describe(nodes[0])
      : `This removes ${nodes.length} objects from the Lab. Files that were copied into the Lab are deleted too.`;
  const { openDialog, runLab } = useHud.getState();
  openDialog({
    kind: 'confirm',
    title: 'Remove from the Lab?',
    message,
    confirmLabel: 'Remove',
    danger: true,
    onConfirm: async () => {
      for (const id of ids) await runLab(() => window.api.labRemoveNode(id));
    },
  });
}
