// Pure helpers for the project dialog, kept out of the component so they can be unit tested
// without a DOM. Validation reuses the IPC schemas so inline errors match what main enforces.
import {
  createProjectInput,
  updateProjectInput,
  type CreateProjectInput,
  type ProjectPatch,
  type UpdateProjectInput,
} from '../../shared/schemas';
import type { Id, ProjectStatus, ProjectSummary } from '../../shared/types';

export type FormField = 'title' | 'status' | 'worldIds' | 'path';
export type FieldErrors = Partial<Record<FormField, string>>;

export interface ProjectFormValues {
  title: string;
  /** Can be 'paused' only while editing a paused project; it is never sent. */
  status: ProjectStatus;
  worldIds: Id[];
  path: string | null;
}

export type FormResult<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };

const FIELDS: readonly FormField[] = ['title', 'status', 'worldIds', 'path'];

interface IssueLike {
  path: ReadonlyArray<PropertyKey>;
  message: string;
}

export function initialValues(project: ProjectSummary | null): ProjectFormValues {
  if (!project) return { title: '', status: 'active', worldIds: [], path: null };
  return {
    title: project.title,
    status: project.status,
    worldIds: [...project.worldIds],
    path: project.path,
  };
}

/**
 * First message per form field. Update payloads nest fields under `patch`, so the field is the
 * first path segment that names one rather than always path[0].
 */
export function firstFieldErrors(issues: ReadonlyArray<IssueLike>): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of issues) {
    const field = issue.path.find((seg): seg is FormField => FIELDS.includes(seg as FormField));
    if (field && errors[field] === undefined) errors[field] = issue.message;
  }
  return errors;
}

export function toCreateInput(values: ProjectFormValues): FormResult<CreateProjectInput> {
  const result = createProjectInput.safeParse(values);
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, errors: firstFieldErrors(result.error.issues) };
}

function sameIds(a: readonly Id[], b: readonly Id[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

/**
 * Builds an update with only the fields the user changed, so an edit never overwrites
 * something it didn't touch. Status is left out for paused projects: leaving 'paused' must go
 * through Resume, which closes the pause record.
 */
export function toUpdateInput(
  project: ProjectSummary,
  values: ProjectFormValues,
): FormResult<UpdateProjectInput> {
  const patch: Record<string, unknown> = {};
  if (values.title.trim() !== project.title) patch.title = values.title;
  if (project.status !== 'paused' && values.status !== project.status) {
    patch.status = values.status;
  }
  if (!sameIds(values.worldIds, project.worldIds)) patch.worldIds = values.worldIds;
  if (values.path !== project.path) patch.path = values.path;

  const result = updateProjectInput.safeParse({ id: project.id, patch });
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, errors: firstFieldErrors(result.error.issues) };
}

export function isEmptyPatch(patch: ProjectPatch): boolean {
  return Object.keys(patch).length === 0;
}

export function toggleId(ids: readonly Id[], id: Id): Id[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}
