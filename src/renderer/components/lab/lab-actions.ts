// Lab writes shared by the node components. Input is checked with the same schemas main uses,
// so a bad value shows a clear message instead of a failed IPC call.
import type { z } from 'zod';
import { labUpdateItemInput, type LabUpdateItemInput } from '../../../shared/schemas';
import type { Id } from '../../../shared/types';
import { guard, useHud } from '../../store/useHud';

export function firstIssue(error: z.ZodError, fallback = "That isn't valid."): string {
  return error.issues[0]?.message ?? fallback;
}

export function saveItem(id: Id, patch: LabUpdateItemInput['patch']): void {
  const parsed = labUpdateItemInput.safeParse({ id, patch });
  if (!parsed.success) {
    useHud.getState().showToast(firstIssue(parsed.error), 'error');
    return;
  }
  guard(() => useHud.getState().runLab(() => window.api.labUpdateItem(parsed.data)));
}

export function openEntryFile(entryId: Id): void {
  guard(() => window.api.openFile(entryId));
}

/** Keys typed in an editor inside a node must not reach the canvas (or the Lab's shortcuts). */
export function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}
