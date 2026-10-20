// The "Plan" half of the New project sheet: the selected blueprint's modules as editable rows,
// its starter checklist below, and the Parts Bin switch at the bottom. While the project is
// being created the plan fades and a short "Creating …" note is shown.
import { AnimatePresence, motion } from 'framer-motion';
import { useRef, useState, type KeyboardEvent } from 'react';
import {
  MAX_CHECKLIST,
  MAX_MODULE_LENGTH,
  MAX_MODULES,
  MAX_STEP_LENGTH,
  addItem,
  removeItem,
  renameItem,
  type Assembly,
} from './ignite-form';

/** How long the launch animation runs before the screen closes. */
export const LAUNCH_MS = 950;

let itemSeq = 0;
const newItemId = () => `u${++itemSeq}`;

const sectionLabel = 'text-[13px] font-medium text-ink';
const smallButton =
  'rounded-md px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-40';

export function AssemblyBay({
  assembly,
  onChange,
  launching,
  launchTitle,
  reduce,
}: {
  assembly: Assembly | null;
  onChange: (next: Assembly) => void;
  launching: boolean;
  launchTitle: string;
  reduce: boolean;
}) {
  const [focusId, setFocusId] = useState<string | null>(null);
  const addModuleRef = useRef<HTMLButtonElement>(null);
  const addStepRef = useRef<HTMLButtonElement>(null);

  if (!assembly) {
    return <p className="text-sm text-muted">No blueprints are available.</p>;
  }

  const modules = assembly.modules;
  const checklist = assembly.checklist;
  const update = (patch: Partial<Assembly>) => onChange({ ...assembly, ...patch });

  const add = (kind: 'modules' | 'checklist') => {
    const id = newItemId();
    const text = kind === 'modules' ? `Module ${modules.length + 1}` : 'New step';
    const max = kind === 'modules' ? MAX_MODULES : MAX_CHECKLIST;
    setFocusId(id);
    update({ [kind]: addItem(assembly[kind], { id, text }, max) });
  };

  // The removed row held focus; hand it to the list's add button so Tab order isn't lost.
  // Wait a frame: at the max the button is still disabled until this change renders.
  const remove = (kind: 'modules' | 'checklist', id: string) => {
    update({ [kind]: removeItem(assembly[kind], id) });
    const button = kind === 'modules' ? addModuleRef : addStepRef;
    requestAnimationFrame(() => button.current?.focus());
  };

  return (
    <div className="relative flex flex-col gap-5">
      <motion.section
        aria-labelledby="ignite-modules"
        className="flex flex-col gap-2"
        animate={{ opacity: launching ? 0 : 1 }}
        transition={{ duration: reduce ? 0 : 0.15 }}
      >
        <div className="flex items-baseline justify-between">
          <h3 id="ignite-modules" className={sectionLabel}>
            Modules
          </h3>
          <span className="text-xs text-muted tabular-nums">
            {modules.length} of {MAX_MODULES}
          </span>
        </div>

        <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-md border border-line">
          <AnimatePresence initial={false}>
            {modules.map((item, i) => (
              <motion.li
                key={item.id}
                layout={!reduce}
                className="flex items-center gap-2 bg-surface px-2 py-1"
                initial={reduce ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0, transition: { duration: 0.12 } }}
                transition={{ duration: 0.15 }}
              >
                <InlineText
                  value={item.text}
                  label={`Module ${i + 1} name`}
                  maxLength={MAX_MODULE_LENGTH}
                  autoFocus={focusId === item.id}
                  onCommit={(text) => update({ modules: renameItem(modules, item.id, text) })}
                  className="text-sm text-ink"
                />
                <RemoveButton
                  label={`Remove module ${item.text}`}
                  onClick={() => remove('modules', item.id)}
                />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>

        <div>
          <button
            ref={addModuleRef}
            type="button"
            className={smallButton}
            disabled={launching || modules.length >= MAX_MODULES}
            onClick={() => add('modules')}
          >
            + Add module
          </button>
        </div>
      </motion.section>

      <motion.section
        aria-labelledby="ignite-checklist"
        className="flex flex-col gap-2"
        animate={{ opacity: launching ? 0 : 1 }}
        transition={{ duration: reduce ? 0 : 0.15 }}
      >
        <div className="flex items-baseline justify-between">
          <h3 id="ignite-checklist" className={sectionLabel}>
            Starter checklist
          </h3>
          <span className="text-xs text-muted tabular-nums">
            {checklist.length} of {MAX_CHECKLIST}
          </span>
        </div>
        <ul className="flex flex-col">
          <AnimatePresence initial={false}>
            {checklist.map((item, i) => (
              <motion.li
                key={item.id}
                className="flex items-center gap-2.5 rounded-md px-1 py-0.5 hover:bg-hover"
                initial={reduce ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0, transition: { duration: 0.12 } }}
                transition={{ duration: 0.15 }}
              >
                <span
                  aria-hidden
                  className="h-3.5 w-3.5 shrink-0 rounded-[4px] border border-line-strong bg-surface"
                />
                <InlineText
                  value={item.text}
                  label={`Checklist step ${i + 1}`}
                  maxLength={MAX_STEP_LENGTH}
                  autoFocus={focusId === item.id}
                  onCommit={(text) => update({ checklist: renameItem(checklist, item.id, text) })}
                  className="text-sm text-ink"
                />
                <RemoveButton
                  label={`Remove step ${item.text}`}
                  onClick={() => remove('checklist', item.id)}
                />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
        <div>
          <button
            ref={addStepRef}
            type="button"
            className={smallButton}
            disabled={launching || checklist.length >= MAX_CHECKLIST}
            onClick={() => add('checklist')}
          >
            + Add step
          </button>
        </div>
      </motion.section>

      <motion.div
        className="flex items-center justify-between gap-4 border-t border-line pt-4"
        animate={{ opacity: launching ? 0 : 1 }}
        transition={{ duration: reduce ? 0 : 0.15 }}
      >
        <div>
          <p id="ignite-parts-label" className="text-sm font-medium text-ink">
            Parts Bin
          </p>
          <p className="text-xs text-muted">Track parts, costs and where to buy them.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={assembly.partsBin}
          aria-labelledby="ignite-parts-label"
          disabled={launching}
          onClick={() => update({ partsBin: !assembly.partsBin })}
          className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors ${
            assembly.partsBin ? 'bg-accent' : 'bg-line-strong'
          }`}
        >
          <motion.span
            aria-hidden
            className="absolute top-[2px] left-[2px] block h-[18px] w-[18px] rounded-full bg-surface shadow-card"
            animate={{ x: assembly.partsBin ? 16 : 0 }}
            transition={{ duration: reduce ? 0 : 0.15 }}
          />
        </button>
      </motion.div>

      {launching ? <LaunchCore title={launchTitle} reduce={reduce} /> : null}
    </div>
  );
}

/** A short confirmation shown over the plan while the new project is being opened. */
function LaunchCore({ title, reduce }: { title: string; reduce: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <motion.div
        role="status"
        className="flex items-center gap-2.5 rounded-lg border border-line bg-raised px-4 py-3 shadow-pop"
        initial={reduce ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15, delay: reduce ? 0 : 0.1 }}
      >
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-status-active" />
        <p className="max-w-56 truncate text-sm text-ink">
          Creating <span className="font-medium">{title}</span>
        </p>
      </motion.div>
    </div>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-base leading-none text-muted hover:bg-hover hover:text-ink"
    >
      ×
    </button>
  );
}

/**
 * Always-editable text that looks like a label until focused. Each keystroke is applied to the
 * parent straight away (so Ignite never sees a stale name); a blank field is kept local and
 * snaps back on blur, and Escape restores the name from before editing.
 */
function InlineText({
  value,
  label,
  maxLength,
  autoFocus,
  onCommit,
  className,
}: {
  value: string;
  label: string;
  maxLength: number;
  autoFocus: boolean;
  onCommit: (text: string) => void;
  className: string;
}) {
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  const original = useRef(value);
  // A just-added row selects its placeholder name once, so typing replaces it.
  const selectOnFocus = useRef(autoFocus);

  // Follow outside changes (e.g. Escape's restore) without fighting the user's typing.
  if (value !== synced) {
    setSynced(value);
    if (value !== draft) setDraft(value);
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      // Escape undoes this rename only; it must not close the whole Ignite screen.
      event.stopPropagation();
      setDraft(original.current);
      onCommit(original.current);
      event.currentTarget.blur();
    } else if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };

  return (
    <input
      value={draft}
      aria-label={label}
      maxLength={maxLength}
      autoFocus={autoFocus}
      onFocus={(e) => {
        original.current = value;
        if (selectOnFocus.current) {
          selectOnFocus.current = false;
          e.currentTarget.select();
        }
      }}
      onChange={(e) => {
        setDraft(e.target.value);
        if (e.target.value.trim()) onCommit(e.target.value);
      }}
      onBlur={() => {
        if (!draft.trim()) setDraft(value);
      }}
      onKeyDown={onKeyDown}
      className={`min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 focus:border-accent focus:bg-surface focus:outline-none ${className}`}
    />
  );
}
