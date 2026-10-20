// IPC payload schemas. The main process validates every request with these; the renderer
// reuses them for form errors so both sides agree on the rules.
import { z } from 'zod';
import { PART_STATUSES, SETTABLE_STATUSES } from './types';

const id = z.string().min(1).max(64);

const title = z
  .string()
  .trim()
  .min(1, 'Give the project a title.')
  .max(120, 'Keep the title under 120 characters.');

// Shared code can't use node:path, so this checks the shape; main checks the folder exists.
const absoluteFolder = z
  .string()
  .min(1)
  .max(4096)
  .refine(
    (p) => p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p),
    'Pick a folder with the folder picker.',
  );

const worldIds = z.array(id).max(20);

export const httpUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Enter a full web address, like https://example.com.');

export const emptyInput = z.undefined();
export const idInput = z.object({ id });

export const createProjectInput = z.object({
  title,
  status: z.enum(SETTABLE_STATUSES),
  worldIds,
  path: absoluteFolder.nullable(),
});

export const updateProjectInput = z.object({
  id,
  patch: z.object({
    title: title.optional(),
    status: z.enum(SETTABLE_STATUSES).optional(),
    worldIds: worldIds.optional(),
    path: absoluteFolder.nullable().optional(),
  }),
});

export const pauseInput = z.object({
  id,
  whereIStopped: z.string().trim().max(4000),
  nextStep: z.string().trim().max(4000),
});

export const addNoteInput = z.object({
  projectId: id,
  title: z.string().trim().max(200),
  body: z.string().trim().min(1, 'Write something first.').max(20_000),
});

export const addLinkInput = z.object({
  projectId: id,
  title: z.string().trim().max(200),
  url: httpUrl,
});

export const createWorldInput = z.object({
  name: z.string().trim().min(1, 'Give the world a name.').max(40, 'Keep it under 40 characters.'),
});

export const scanImportInput = z.object({
  paths: z.array(z.string().min(1).max(4096)).min(1).max(1000),
  worldIds,
});

export const rendererErrorInput = z.object({
  message: z.string().max(4000),
  stack: z.string().max(20_000).optional(),
  source: z.enum(['error', 'unhandledrejection', 'react']),
});

// ---- Ignite and the Lab ----

/** Largest pasted image accepted (a big Retina screenshot is well under this). */
export const MAX_PASTE_BYTES = 25 * 1024 * 1024;

const coord = z.number().finite().min(-1_000_000).max(1_000_000);
const size = z.number().finite().min(40).max(10_000);
const shortText = z.string().trim().max(200);

export const igniteInput = z.object({
  title,
  idea: z.string().trim().max(2000),
  blueprintId: z.string().min(1).max(64),
  worldIds,
  path: absoluteFolder.nullable(),
  modules: z.array(z.string().trim().min(1).max(60)).max(12),
  checklist: z.array(z.string().trim().min(1).max(200)).max(30),
  partsBin: z.boolean(),
});

export const labProjectInput = z.object({ projectId: id });
export const labNodeInput = z.object({ nodeId: id });

export const labAddNoteInput = z.object({
  projectId: id,
  title: shortText,
  body: z.string().max(20_000),
  x: coord,
  y: coord,
});

export const labAddChecklistInput = z.object({
  projectId: id,
  title: shortText,
  items: z.array(z.string().trim().min(1).max(300)).max(100),
  x: coord,
  y: coord,
});

export const labAddLinkInput = z.object({
  projectId: id,
  title: shortText,
  url: httpUrl,
  x: coord,
  y: coord,
});

export const labAddFilesInput = z.object({
  projectId: id,
  paths: z.array(z.string().min(1).max(4096)).min(1).max(50),
  x: coord,
  y: coord,
});

export const labPickFilesInput = z.object({ projectId: id, x: coord, y: coord });

export const labAddImageDataInput = z.object({
  projectId: id,
  name: z.string().trim().min(1).max(200),
  bytes: z
    .instanceof(Uint8Array)
    .refine(
      (b) => b.byteLength > 0 && b.byteLength <= MAX_PASTE_BYTES,
      'That image is too big to paste.',
    ),
  x: coord,
  y: coord,
});

export const partFields = {
  name: z.string().trim().min(1, 'Name the part.').max(120),
  qty: z.number().int().min(0).max(100_000),
  /** Cost of one, in cents. */
  unitCostMinor: z.number().int().min(0).max(10_000_000_000).nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code, like USD.'),
  supplierUrl: httpUrl.nullable(),
  status: z.enum(PART_STATUSES),
  notes: z.string().trim().max(2000),
};
const partFieldsSchema = z.object(partFields);

export const labAddPartInput = z.object({
  projectId: id,
  ...partFields,
  x: coord.nullable(),
  y: coord.nullable(),
});

export const labUpdatePartInput = z.object({ id, patch: partFieldsSchema.partial() });

export const labAddZoneInput = z.object({
  projectId: id,
  title: z.string().trim().min(1, 'Name the zone.').max(60),
  x: coord,
  y: coord,
  w: size,
  h: size,
});

export const labRenameZoneInput = z.object({
  id,
  title: z.string().trim().min(1, 'Name the zone.').max(60),
});

const checklistItem = z.object({
  id: z.string().min(1).max(64),
  text: z.string().trim().min(1).max(300),
  done: z.boolean(),
});

export const labUpdateItemInput = z.object({
  id,
  patch: z.object({
    title: shortText.optional(),
    body: z.string().max(20_000).optional(),
    checklist: z.array(checklistItem).max(100).optional(),
  }),
});

export const labMoveNodesInput = z.object({
  projectId: id,
  moves: z
    .array(
      z.object({
        nodeId: id,
        x: coord,
        y: coord,
        w: size.nullable().optional(),
        h: size.nullable().optional(),
        moduleId: id.nullable().optional(),
      }),
    )
    .min(1)
    .max(500),
});

export const labConnectInput = z.object({ projectId: id, fromNodeId: id, toNodeId: id });
export const labPartsBinInput = z.object({ projectId: id, on: z.boolean() });
export const openUrlInput = z.object({ url: httpUrl });

export const onboardingInput = z.object({
  worlds: z.array(z.string().trim().min(1).max(40)).max(20),
  addSamples: z.boolean(),
});
export type OnboardingInput = z.infer<typeof onboardingInput>;

export const backupUseFolderInput = z.object({ folder: absoluteFolder });
export const backupRestoreInput = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a backup date.'),
});

export type IgniteInput = z.infer<typeof igniteInput>;
export type PartFields = z.infer<typeof partFieldsSchema>;
export type LabAddNoteInput = z.infer<typeof labAddNoteInput>;
export type LabAddChecklistInput = z.infer<typeof labAddChecklistInput>;
export type LabAddLinkInput = z.infer<typeof labAddLinkInput>;
export type LabAddFilesInput = z.infer<typeof labAddFilesInput>;
export type LabPickFilesInput = z.infer<typeof labPickFilesInput>;
export type LabAddImageDataInput = z.infer<typeof labAddImageDataInput>;
export type LabAddPartInput = z.infer<typeof labAddPartInput>;
export type LabUpdatePartInput = z.infer<typeof labUpdatePartInput>;
export type LabAddZoneInput = z.infer<typeof labAddZoneInput>;
export type LabRenameZoneInput = z.infer<typeof labRenameZoneInput>;
export type LabUpdateItemInput = z.infer<typeof labUpdateItemInput>;
export type LabMoveNodesInput = z.infer<typeof labMoveNodesInput>;
export type LabConnectInput = z.infer<typeof labConnectInput>;
export type LabPartsBinInput = z.infer<typeof labPartsBinInput>;

export type CreateProjectInput = z.infer<typeof createProjectInput>;
export type UpdateProjectInput = z.infer<typeof updateProjectInput>;
export type ProjectPatch = UpdateProjectInput['patch'];
export type PauseInput = z.infer<typeof pauseInput>;
export type AddNoteInput = z.infer<typeof addNoteInput>;
export type AddLinkInput = z.infer<typeof addLinkInput>;
export type ScanImportInput = z.infer<typeof scanImportInput>;
