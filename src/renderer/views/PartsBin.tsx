// The Parts Bin: everything a physical build needs, with cost and what's still missing.
// Shown as a side panel inside the Lab. Every change goes through runLab so the canvas cards
// and the grid update from the same returned Lab.
import { motion } from 'framer-motion';
import {
  memo,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { labAddPartInput, labUpdatePartInput, type PartFields } from '../../shared/schemas';
import {
  PART_STATUSES,
  type Id,
  type LabData,
  type Part,
  type PartStatus,
} from '../../shared/types';
import {
  PART_STATUS_HEX,
  PART_STATUS_LABEL,
  centsToInput,
  formatAmounts,
  formatMoney,
  hostOf,
  lineTotal,
  normalizeCurrency,
  normalizeUrl,
  parseMoney,
  parseQty,
  summarizeParts,
} from '../components/lab/parts-math';
import { Button, inputClass } from '../components/ui';
import { errorMessage, guard, useHud } from '../store/useHud';

type Issue = { path: readonly PropertyKey[]; message: string; code?: string };

// zod's built-in messages ("Too small: expected number to be >=0") read like a stack trace;
// the schema only carries friendly text for some fields, so fill in the rest here.
const FRIENDLY: Partial<Record<keyof PartFields, string>> = {
  qty: 'Use a whole number from 0 to 100,000.',
  unitCostMinor: 'That price is too high.',
  notes: 'Keep notes under 2,000 characters.',
  status: 'Pick a status.',
};

function issueMessage(issues: readonly Issue[]): string {
  const issue = issues[0];
  if (!issue) return 'Check that value.';
  const field = String(issue.path[issue.path.length - 1]) as keyof PartFields;
  if (field === 'name' && issue.code === 'too_big') return 'Keep the name under 120 characters.';
  return FRIENDLY[field] ?? issue.message;
}

function isFormField(target: EventTarget): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

export function PartsBin({ lab, onClose }: { lab: LabData; onClose: () => void }) {
  const { project, parts } = lab;
  const runLab = useHud((s) => s.runLab);
  const summary = useMemo(() => summarizeParts(parts), [parts]);
  const nodeByPart = useMemo(() => {
    const map = new Map<Id, Id>();
    for (const node of lab.nodes) if (node.refType === 'part') map.set(node.refId, node.id);
    return map;
  }, [lab.nodes]);
  // Remember whether the bin started switched off, so the toggle stays visible (and can be
  // undone) after the user turns it on.
  const [offerToggle] = useState(() => !project.partsBin);
  const defaultCurrency = parts.length > 0 ? parts[parts.length - 1].currency : 'USD';
  const installedShare = summary.count === 0 ? 0 : summary.installed / summary.count;

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.stopPropagation();
      onClose();
      return;
    }
    // Typing here must not trigger the Lab's canvas shortcuts (like Delete removing a node).
    if (isFormField(event.target)) event.stopPropagation();
  };

  return (
    <motion.aside
      aria-label="Parts Bin"
      // The frame is an inner div so its styling never fights the `fixed` positioning here.
      className="fixed top-14 right-0 bottom-0 z-30 w-[560px] max-w-full"
      initial={{ x: '100%', opacity: 0.4 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0.4 }}
      transition={{ type: 'tween', duration: 0.22, ease: 'easeOut' }}
      onKeyDown={onKeyDown}
      // Pasting a link into a field must not also drop a link card onto the canvas.
      onPaste={(event) => event.stopPropagation()}
    >
      {/* Opaque: canvas cards behind the panel would otherwise show through the table. */}
      <div className="flex h-full flex-col border-l border-line bg-raised shadow-pop">
        <header className="flex shrink-0 items-center justify-between border-b border-line px-5 py-3">
          <div className="flex items-baseline gap-3">
            <h2 className="text-[15px] font-semibold text-ink">Parts Bin</h2>
            <span className="text-xs text-muted">
              {summary.count} {summary.count === 1 ? 'part' : 'parts'}
            </span>
          </div>
          <button
            type="button"
            aria-label="Close Parts Bin"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-lg leading-none text-muted hover:bg-hover hover:text-ink"
          >
            ×
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <SummaryStrip summary={summary} installedShare={installedShare} />

          {offerToggle ? (
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                className="accent-[var(--color-accent)]"
                checked={project.partsBin}
                onChange={(e) => {
                  const on = e.target.checked;
                  guard(() =>
                    runLab(() => window.api.labSetPartsBin({ projectId: project.id, on })),
                  );
                }}
              />
              Show Parts Bin by default for this project
            </label>
          ) : null}

          {parts.length === 0 ? (
            <EmptyState />
          ) : (
            <table className="mt-4 w-full table-fixed border-collapse border border-line bg-surface text-sm">
              <colgroup>
                <col />
                <col className="w-11" />
                <col className="w-[76px]" />
                <col className="w-[76px]" />
                <col className="w-[94px]" />
                <col className="w-[76px]" />
                <col className="w-7" />
              </colgroup>
              <thead>
                <tr className="border-b border-line bg-sunken text-xs text-muted">
                  <th className="px-2 py-1.5 text-left font-medium">Part · notes</th>
                  <th className="px-2 py-1.5 text-right font-medium">Qty</th>
                  <th className="px-2 py-1.5 text-right font-medium">Each</th>
                  <th className="px-2 py-1.5 text-right font-medium">Total</th>
                  <th className="px-2 py-1.5 text-left font-medium">Status</th>
                  <th className="px-2 py-1.5 text-left font-medium">Supplier</th>
                  <th>
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {parts.map((part) => (
                  <PartRow key={part.id} part={part} nodeId={nodeByPart.get(part.id) ?? null} />
                ))}
              </tbody>
            </table>
          )}
        </div>

        <AddPartForm
          projectId={project.id}
          defaultCurrency={defaultCurrency}
          autoFocus={parts.length === 0}
        />
      </div>
    </motion.aside>
  );
}

function SummaryStrip({
  summary,
  installedShare,
}: {
  summary: ReturnType<typeof summarizeParts>;
  installedShare: number;
}) {
  return (
    <section
      aria-label="Parts summary"
      className="rounded-lg border border-line bg-surface px-4 py-3 shadow-card"
    >
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Total cost">
          {summary.total.length === 0 ? (
            <span className="text-muted">—</span>
          ) : (
            summary.total.map((a) => (
              <span key={a.currency} className="block">
                {formatMoney(a.minor, a.currency)}
              </span>
            ))
          )}
          {summary.unpriced > 0 ? <Sub>{summary.unpriced} without a price</Sub> : null}
        </Stat>
        <Stat label="Installed">
          {summary.installed} of {summary.count} installed
          {summary.missing > 0 ? <Sub>{summary.missing} not in hand yet</Sub> : null}
        </Stat>
        <Stat label="To order">
          <span>{summary.toOrder} still to order</span>
          {summary.toSpend.length > 0 ? <Sub>{formatAmounts(summary.toSpend)} to spend</Sub> : null}
        </Stat>
      </div>
      <div
        role="progressbar"
        aria-label="Installed parts"
        aria-valuemin={0}
        aria-valuemax={summary.count}
        aria-valuenow={summary.installed}
        className="mt-3 h-1 overflow-hidden rounded-full bg-sunken"
      >
        <motion.div
          className="h-full rounded-full"
          style={{ background: PART_STATUS_HEX.installed }}
          initial={false}
          animate={{ width: `${Math.round(installedShare * 100)}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>
    </section>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted">{label}</p>
      <div className="mt-0.5 text-[13px] font-semibold tabular-nums text-ink">{children}</div>
    </div>
  );
}

function Sub({ children }: { children: ReactNode }) {
  return <span className="block text-xs font-normal text-muted">{children}</span>;
}

function EmptyState() {
  return (
    <div className="mt-6 px-2 text-sm leading-relaxed text-muted">
      <p className="text-[13px] font-semibold text-ink">No parts yet</p>
      <p className="mt-2">
        The Parts Bin keeps track of everything a physical build needs: motors, sensors, boards,
        screws. Note how many, what one costs and where to buy it, then move each part from{' '}
        <StatusWord status="needed" /> to <StatusWord status="ordered" /> to{' '}
        <StatusWord status="arrived" /> to <StatusWord status="installed" />.
      </p>
      <p className="mt-2">
        You'll always see the total cost and what's still missing, and every part also gets a card
        on the Lab canvas. Add the first one below.
      </p>
    </div>
  );
}

function StatusWord({ status }: { status: PartStatus }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-ink">
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: PART_STATUS_HEX[status] }}
      />
      {PART_STATUS_LABEL[status]}
    </span>
  );
}

// ---- One row ----

const PartRow = memo(function PartRow({ part, nodeId }: { part: Part; nodeId: Id | null }) {
  const runLab = useHud((s) => s.runLab);
  const openDialog = useHud((s) => s.openDialog);
  const showToast = useHud((s) => s.showToast);

  /** Saves only the fields that changed; returns an error message to show, or null. */
  const save = async (patch: Partial<PartFields>): Promise<string | null> => {
    const changed = Object.fromEntries(
      Object.entries(patch).filter(([key, value]) => part[key as keyof PartFields] !== value),
    );
    if (Object.keys(changed).length === 0) return null;
    const parsed = labUpdatePartInput.safeParse({ id: part.id, patch: changed });
    if (!parsed.success) return issueMessage(parsed.error.issues);
    try {
      await runLab(() => window.api.labUpdatePart(parsed.data));
      return null;
    } catch (err) {
      return errorMessage(err);
    }
  };

  const remove = () => {
    if (!nodeId) {
      showToast("That part's card is missing; reopen the Lab and try again.", 'error');
      return;
    }
    openDialog({
      kind: 'confirm',
      title: 'Remove part',
      message: `Remove "${part.name}" from the Parts Bin? Its card leaves the Lab canvas too.`,
      confirmLabel: 'Remove',
      danger: true,
      onConfirm: async () => {
        await runLab(() => window.api.labRemoveNode(nodeId));
      },
    });
  };

  const total = lineTotal(part);
  const hex = PART_STATUS_HEX[part.status];

  return (
    <tr className="group border-b border-line align-top last:border-b-0 hover:bg-hover">
      <td className="px-0.5 py-1">
        <InlineText
          label={`name of ${part.name}`}
          value={part.name}
          onSave={(draft) => save({ name: draft })}
        >
          <span className="text-sm font-medium text-ink" title={part.name}>
            {part.name}
          </span>
        </InlineText>
        <InlineText
          label={`notes for ${part.name}`}
          value={part.notes}
          placeholder="Notes"
          onSave={(draft) => save({ notes: draft })}
        >
          {part.notes ? (
            <span className="text-xs text-muted" title={part.notes}>
              {part.notes}
            </span>
          ) : (
            <span className="text-xs text-muted/50 group-hover:text-muted">+ note</span>
          )}
        </InlineText>
      </td>
      <td className="px-0.5 py-1">
        <InlineText
          label={`quantity of ${part.name}`}
          value={String(part.qty)}
          align="right"
          inputMode="numeric"
          onSave={(draft) => {
            const qty = parseQty(draft);
            return qty === undefined ? Promise.resolve('Use a whole number.') : save({ qty });
          }}
        >
          <span className="tabular-nums">{part.qty}</span>
        </InlineText>
      </td>
      <td className="relative px-0.5 py-1">
        <CostCell part={part} save={save} />
      </td>
      <td className="px-1.5 py-1.5 text-right text-xs tabular-nums text-ink">
        {total === null ? <span className="text-muted">—</span> : formatMoney(total, part.currency)}
      </td>
      <td className="px-0.5 py-1">
        <div className="relative">
          {/* The status colour as a small dot inside the select, so the cell stays neutral. */}
          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 h-1.5 w-1.5 -translate-y-1/2 rounded-full"
            style={{ background: hex }}
          />
          <select
            aria-label={`Status of ${part.name}`}
            value={part.status}
            onChange={(e) => {
              const status = e.target.value as PartStatus;
              void save({ status }).then((err) => {
                if (err) showToast(err, 'error');
              });
            }}
            className="w-full cursor-pointer rounded-md border border-line bg-surface py-1 pr-1 pl-5 text-xs text-ink hover:border-line-strong focus:border-accent focus:outline-none"
          >
            {PART_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PART_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      </td>
      <td className="relative px-0.5 py-1">
        <SupplierCell part={part} save={save} />
      </td>
      <td className="py-1 text-center">
        <button
          type="button"
          aria-label={`Remove ${part.name}`}
          title="Remove part"
          onClick={remove}
          className="rounded-md px-1.5 py-0.5 text-base leading-none text-muted/60 hover:bg-danger/10 hover:text-danger focus-visible:text-danger"
        >
          ×
        </button>
      </td>
    </tr>
  );
});

type Save = (patch: Partial<PartFields>) => Promise<string | null>;

// ---- Inline editing ----

/**
 * Edit state for one cell. The phase lives in a ref because blur can fire again while a save
 * is in flight or right after Enter/Escape closed the editor, and those must not save twice.
 */
function useInlineEdit<T>(onSave: (draft: T) => Promise<string | null>) {
  const [draft, setDraft] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const phase = useRef<'idle' | 'editing' | 'saving'>('idle');

  const start = (initial: T) => {
    phase.current = 'editing';
    setError(null);
    setDraft(initial);
  };
  const cancel = () => {
    phase.current = 'idle';
    setError(null);
    setDraft(null);
  };
  const commit = async (value: T) => {
    if (phase.current !== 'editing') return;
    phase.current = 'saving';
    const err = await onSave(value);
    if (err) {
      phase.current = 'editing';
      setError(err);
    } else {
      phase.current = 'idle';
      setError(null);
      setDraft(null);
    }
  };
  const onKeyDown = (event: KeyboardEvent, value: T) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void commit(value);
    } else if (event.key === 'Escape') {
      // preventDefault tells the panel this Escape was used, so it doesn't close the bin.
      event.preventDefault();
      event.stopPropagation();
      cancel();
    }
  };
  return { draft, setDraft, error, start, cancel, commit, onKeyDown };
}

const cellButton =
  'block w-full truncate rounded-md px-1.5 py-1 text-left hover:bg-hover cursor-text';
const cellInput =
  'w-full rounded-md border border-accent bg-surface px-1.5 py-1 text-sm text-ink focus:outline-none focus:ring-3 focus:ring-accent/15';
const errorText = 'mt-1 text-[11px] leading-snug text-danger';

function InlineText({
  label,
  value,
  onSave,
  children,
  placeholder,
  align = 'left',
  inputMode,
}: {
  label: string;
  value: string;
  onSave: (draft: string) => Promise<string | null>;
  children: ReactNode;
  placeholder?: string;
  align?: 'left' | 'right';
  inputMode?: 'numeric' | 'decimal' | 'url';
}) {
  const edit = useInlineEdit<string>(onSave);
  const alignClass = align === 'right' ? 'text-right' : 'text-left';

  if (edit.draft === null) {
    return (
      <button
        type="button"
        aria-label={`Edit ${label}`}
        className={`${cellButton} ${alignClass}`}
        onClick={() => edit.start(value)}
      >
        {children}
      </button>
    );
  }
  const draft = edit.draft;
  return (
    <div>
      <input
        autoFocus
        aria-label={label}
        aria-invalid={edit.error ? true : undefined}
        value={draft}
        placeholder={placeholder}
        inputMode={inputMode}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => edit.setDraft(e.target.value)}
        onBlur={() => void edit.commit(draft)}
        onKeyDown={(e) => edit.onKeyDown(e, draft)}
        className={`${cellInput} ${alignClass} ${edit.error ? 'border-danger/70' : ''}`}
      />
      {edit.error ? (
        <p role="alert" className={errorText}>
          {edit.error}
        </p>
      ) : null}
    </div>
  );
}

/** Floating editor for cells too narrow to type in (price + currency, supplier link). */
function Popover({
  children,
  onLeave,
  error,
}: {
  children: ReactNode;
  onLeave: () => void;
  error: string | null;
}) {
  return (
    <div
      className="absolute top-0 right-0 z-20 w-64"
      // Only commit when focus leaves the whole editor, not when moving between its inputs.
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onLeave();
      }}
    >
      <div className="rounded-lg border border-line bg-raised p-2 shadow-pop">
        {children}
        {error ? (
          <p role="alert" className={errorText}>
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function CostCell({ part, save }: { part: Part; save: Save }) {
  const edit = useInlineEdit<{ amount: string; currency: string }>((draft) => {
    const unitCostMinor = parseMoney(draft.amount);
    if (unitCostMinor === undefined) return Promise.resolve('Enter the price of one, like 8.50.');
    return save({ unitCostMinor, currency: normalizeCurrency(draft.currency) });
  });

  if (edit.draft === null) {
    return (
      <button
        type="button"
        aria-label={`Edit price of ${part.name}`}
        className={`${cellButton} text-right text-xs tabular-nums`}
        onClick={() =>
          edit.start({ amount: centsToInput(part.unitCostMinor), currency: part.currency })
        }
      >
        {part.unitCostMinor === null ? (
          <span className="text-muted/60 group-hover:text-muted">+ price</span>
        ) : (
          formatMoney(part.unitCostMinor, part.currency)
        )}
      </button>
    );
  }
  const draft = edit.draft;
  return (
    <Popover error={edit.error} onLeave={() => void edit.commit(draft)}>
      <div className="flex gap-2">
        <input
          autoFocus
          aria-label={`Price of one ${part.name}`}
          aria-invalid={edit.error ? true : undefined}
          placeholder="Price of one"
          inputMode="decimal"
          value={draft.amount}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => edit.setDraft({ ...draft, amount: e.target.value })}
          onKeyDown={(e) => edit.onKeyDown(e, draft)}
          className={`${cellInput} text-right tabular-nums`}
        />
        <input
          aria-label="Currency code"
          maxLength={3}
          value={draft.currency}
          onChange={(e) => edit.setDraft({ ...draft, currency: e.target.value.toUpperCase() })}
          onKeyDown={(e) => edit.onKeyDown(e, draft)}
          className={`${cellInput} w-16 shrink-0 text-center`}
        />
      </div>
    </Popover>
  );
}

function SupplierCell({ part, save }: { part: Part; save: Save }) {
  const edit = useInlineEdit<string>((draft) => save({ supplierUrl: normalizeUrl(draft) }));
  const url = part.supplierUrl;

  if (edit.draft === null) {
    return url ? (
      <div className="flex items-center">
        <button
          type="button"
          title={url}
          aria-label={`Open supplier for ${part.name}: ${hostOf(url)}`}
          onClick={() => guard(() => window.api.openUrl(url))}
          className="min-w-0 flex-1 truncate rounded-md px-1.5 py-1 text-left text-xs text-ink underline-offset-2 hover:underline"
        >
          {hostOf(url)}
        </button>
        <button
          type="button"
          aria-label={`Edit supplier link for ${part.name}`}
          title="Edit link"
          onClick={() => edit.start(url)}
          className="shrink-0 rounded-md px-1 py-1 text-muted opacity-0 group-hover:opacity-100 hover:text-ink focus-visible:opacity-100"
        >
          <PencilIcon />
        </button>
      </div>
    ) : (
      <button
        type="button"
        aria-label={`Add supplier link for ${part.name}`}
        onClick={() => edit.start('')}
        className={`${cellButton} text-xs text-muted/60 group-hover:text-muted`}
      >
        + link
      </button>
    );
  }
  const draft = edit.draft;
  return (
    <Popover error={edit.error} onLeave={() => void edit.commit(draft)}>
      <input
        autoFocus
        aria-label={`Supplier link for ${part.name}`}
        aria-invalid={edit.error ? true : undefined}
        placeholder="shop.com/part (empty to remove)"
        inputMode="url"
        value={draft}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => edit.setDraft(e.target.value)}
        onKeyDown={(e) => edit.onKeyDown(e, draft)}
        className={cellInput}
      />
    </Popover>
  );
}

function PencilIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />
    </svg>
  );
}

// ---- Add a part ----

type AddField = 'name' | 'qty' | 'cost' | 'currency' | 'supplier';

const ADD_FIELD_FOR: Partial<Record<string, AddField>> = {
  name: 'name',
  qty: 'qty',
  unitCostMinor: 'cost',
  currency: 'currency',
  supplierUrl: 'supplier',
};

function AddPartForm({
  projectId,
  defaultCurrency,
  autoFocus,
}: {
  projectId: Id;
  defaultCurrency: string;
  autoFocus: boolean;
}) {
  const runLab = useHud((s) => s.runLab);
  const [name, setName] = useState('');
  const [qty, setQty] = useState('1');
  const [cost, setCost] = useState('');
  // null follows the last part's currency, so a bin bought in EUR keeps defaulting to EUR.
  const [currency, setCurrency] = useState<string | null>(null);
  const [supplier, setSupplier] = useState('');
  const [error, setError] = useState<{ field: AddField | null; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const parsedQty = parseQty(qty);
    if (parsedQty === undefined) {
      setError({ field: 'qty', message: 'Quantity must be a whole number.' });
      return;
    }
    const unitCostMinor = parseMoney(cost);
    if (unitCostMinor === undefined) {
      setError({ field: 'cost', message: 'Enter the price of one, like 8.50, or leave it empty.' });
      return;
    }
    const parsed = labAddPartInput.safeParse({
      projectId,
      name,
      qty: parsedQty,
      unitCostMinor,
      currency: normalizeCurrency(currency ?? defaultCurrency),
      supplierUrl: normalizeUrl(supplier),
      status: 'needed',
      notes: '',
      // No position: the main process places the new card on the canvas.
      x: null,
      y: null,
    });
    if (!parsed.success) {
      const key = String(parsed.error.issues[0]?.path.at(-1) ?? '');
      setError({ field: ADD_FIELD_FOR[key] ?? null, message: issueMessage(parsed.error.issues) });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await runLab(() => window.api.labAddPart(parsed.data));
      setName('');
      setQty('1');
      setCost('');
      setCurrency(null);
      setSupplier('');
      nameRef.current?.focus();
    } catch (err) {
      setError({ field: null, message: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const invalid = (field: AddField) =>
    error?.field === field ? 'border-danger/70 focus:border-danger/70' : '';
  // inputClass sets w-full, which would beat the fixed widths below and squeeze the name field.
  const small = `${inputClass.replace('w-full', '')} px-2 py-1.5`;

  return (
    <form
      aria-label="Add a part"
      onSubmit={(e) => void submit(e)}
      className="shrink-0 border-t border-line bg-sunken px-4 py-3"
    >
      <p className="mb-2 text-[13px] font-semibold text-ink">Add a part</p>
      <div className="flex gap-2">
        <input
          ref={nameRef}
          autoFocus={autoFocus}
          aria-label="Part name"
          aria-invalid={error?.field === 'name' ? true : undefined}
          placeholder="Part name, e.g. SG90 servo"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`${small} min-w-0 flex-1 ${invalid('name')}`}
        />
        <input
          aria-label="Quantity"
          aria-invalid={error?.field === 'qty' ? true : undefined}
          inputMode="numeric"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className={`${small} w-14 text-right tabular-nums ${invalid('qty')}`}
        />
        <input
          aria-label="Price of one"
          aria-invalid={error?.field === 'cost' ? true : undefined}
          placeholder="Price"
          inputMode="decimal"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          className={`${small} w-20 text-right tabular-nums ${invalid('cost')}`}
        />
        <input
          aria-label="Currency code"
          aria-invalid={error?.field === 'currency' ? true : undefined}
          maxLength={3}
          value={currency ?? defaultCurrency}
          onChange={(e) => setCurrency(e.target.value.toUpperCase())}
          className={`${small} w-16 text-center ${invalid('currency')}`}
        />
      </div>
      <div className="mt-2 flex gap-2">
        <input
          aria-label="Supplier link (optional)"
          aria-invalid={error?.field === 'supplier' ? true : undefined}
          placeholder="Where to buy (optional), e.g. shop.com/servo"
          inputMode="url"
          value={supplier}
          onChange={(e) => setSupplier(e.target.value)}
          className={`${small} min-w-0 flex-1 ${invalid('supplier')}`}
        />
        <Button type="submit" variant="primary" disabled={busy}>
          + Add part
        </Button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error.message}
        </p>
      ) : null}
    </form>
  );
}
