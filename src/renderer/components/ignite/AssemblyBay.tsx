// The right half of the Ignite screen: the selected blueprint's modules assemble as zone
// cards, its starter checklist lists below, and the parts bin switch sits at the bottom.
// On launch the cards collapse into one glowing core card that flies up into the HUD.
import { AnimatePresence, motion } from 'framer-motion';
import { useRef, useState, type KeyboardEvent } from 'react';
import {
  MAX_CHECKLIST,
  MAX_MODULE_LENGTH,
  MAX_MODULES,
  MAX_STEP_LENGTH,
  addItem,
  isBlueprintItem,
  removeItem,
  renameItem,
  type Assembly,
} from './ignite-form';

/** How long the launch animation runs before the screen closes. */
export const LAUNCH_MS = 950;

let itemSeq = 0;
const newItemId = () => `u${++itemSeq}`;

const sectionLabel = 'font-hud text-xs uppercase tracking-widest text-hud-muted';
const smallButton =
  'rounded-md border border-dashed border-hud-line px-3 py-1 font-hud text-xs uppercase tracking-wider text-hud-muted transition-colors hover:text-hud-text disabled:cursor-not-allowed disabled:opacity-40';

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
    return <p className="text-sm text-hud-muted">No blueprints are available.</p>;
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
      <section aria-labelledby="ignite-modules" className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between">
          <h3 id="ignite-modules" className={sectionLabel}>
            Modules
          </h3>
          <span className="font-mono text-[11px] text-hud-muted">
            {modules.length}/{MAX_MODULES}
          </span>
        </div>

        <ul
          className={
            launching
              ? 'grid min-h-24 place-items-center'
              : 'grid grid-cols-2 gap-2.5 min-[1200px]:grid-cols-3'
          }
        >
          <AnimatePresence mode="popLayout" initial={!reduce}>
            {modules.map((item, i) => (
              <motion.li
                key={item.id}
                layout={!reduce}
                className={`hud-frame hud-frame-sm ${launching ? 'w-56' : 'w-full'}`}
                style={
                  {
                    '--frame-color': launching ? 'rgb(56 214 255 / 0.9)' : 'rgb(56 189 248 / 0.5)',
                    '--frame-fill': 'rgb(8 34 66 / 0.92)',
                    // Every card shares one cell while launching, so the layout animation
                    // slides them together into a single stack.
                    gridArea: launching ? '1 / 1' : undefined,
                  } as React.CSSProperties
                }
                initial={reduce ? false : { opacity: 0, scale: 0.8, y: 14 }}
                animate={
                  launching
                    ? { opacity: reduce ? 1 : 0, scale: 0.7, y: 0 }
                    : { opacity: 1, scale: 1, y: 0 }
                }
                exit={
                  reduce ? undefined : { opacity: 0, scale: 0.85, transition: { duration: 0.14 } }
                }
                transition={{
                  type: 'spring',
                  stiffness: 420,
                  damping: 30,
                  opacity: {
                    duration: launching ? 0.25 : 0.2,
                    delay: launching ? 0.3 : isBlueprintItem(item) ? 0.05 + i * 0.06 : 0,
                  },
                  delay: launching ? 0 : isBlueprintItem(item) ? 0.05 + i * 0.06 : 0,
                  // Reflowing after a remove or add must not wait for the assembly stagger.
                  layout: { type: 'spring', stiffness: 420, damping: 34 },
                }}
              >
                <div className="flex items-center gap-1.5 px-3 py-2.5">
                  <span aria-hidden className="font-mono text-[10px] text-status-active/70">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <InlineText
                    value={item.text}
                    label={`Module ${i + 1} name`}
                    maxLength={MAX_MODULE_LENGTH}
                    autoFocus={focusId === item.id}
                    onCommit={(text) => update({ modules: renameItem(modules, item.id, text) })}
                    className="font-hud text-sm tracking-wide text-hud-text"
                  />
                  <RemoveButton
                    label={`Remove module ${item.text}`}
                    onClick={() => remove('modules', item.id)}
                  />
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>

        {!launching ? (
          <div>
            <button
              ref={addModuleRef}
              type="button"
              className={smallButton}
              disabled={modules.length >= MAX_MODULES}
              onClick={() => add('modules')}
            >
              + Module
            </button>
          </div>
        ) : null}
      </section>

      <motion.section
        aria-labelledby="ignite-checklist"
        className="flex flex-col gap-2.5"
        animate={{ opacity: launching ? 0 : 1 }}
        transition={{ duration: reduce ? 0 : 0.2 }}
      >
        <div className="flex items-baseline justify-between">
          <h3 id="ignite-checklist" className={sectionLabel}>
            Starter checklist
          </h3>
          <span className="font-mono text-[11px] text-hud-muted">
            {checklist.length}/{MAX_CHECKLIST}
          </span>
        </div>
        <ul className="flex flex-col gap-1">
          <AnimatePresence initial={!reduce}>
            {checklist.map((item, i) => (
              <motion.li
                key={item.id}
                className="flex items-center gap-2 rounded-md border border-hud-line/70 bg-black/25 px-2.5 py-1.5"
                initial={reduce ? false : { opacity: 0, x: 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduce ? undefined : { opacity: 0, transition: { duration: 0.12 } }}
                transition={{
                  duration: 0.22,
                  delay: isBlueprintItem(item) ? 0.2 + i * 0.05 : 0,
                }}
              >
                <span
                  aria-hidden
                  className="h-3 w-3 shrink-0 border border-status-active/60 bg-status-active/5"
                />
                <InlineText
                  value={item.text}
                  label={`Checklist step ${i + 1}`}
                  maxLength={MAX_STEP_LENGTH}
                  autoFocus={focusId === item.id}
                  onCommit={(text) => update({ checklist: renameItem(checklist, item.id, text) })}
                  className="text-sm text-hud-text"
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
            + Step
          </button>
        </div>
      </motion.section>

      <motion.div
        className="flex items-center justify-between gap-4 rounded-md border border-hud-line bg-black/25 px-3 py-2.5"
        animate={{ opacity: launching ? 0 : 1 }}
        transition={{ duration: reduce ? 0 : 0.2 }}
      >
        <div>
          <p id="ignite-parts-label" className="font-hud text-sm tracking-wide text-hud-text">
            Parts Bin
          </p>
          <p className="text-xs text-hud-muted">Track parts, costs and where to buy them.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={assembly.partsBin}
          aria-labelledby="ignite-parts-label"
          disabled={launching}
          onClick={() => update({ partsBin: !assembly.partsBin })}
          className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
            assembly.partsBin
              ? 'border-status-active/70 bg-status-active/25'
              : 'border-hud-line bg-black/40'
          }`}
        >
          <motion.span
            aria-hidden
            className={`absolute top-0.5 left-0.5 block h-4 w-4 rounded-full ${
              assembly.partsBin ? 'bg-status-active shadow-[0_0_8px_#38d6ff]' : 'bg-hud-muted'
            }`}
            animate={{ x: assembly.partsBin ? 20 : 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 32 }}
          />
        </button>
      </motion.div>

      {launching ? <LaunchCore title={launchTitle} reduce={reduce} /> : null}
    </div>
  );
}

/** The single glowing card the modules collapse into; it rises and leaves the screen. */
function LaunchCore({ title, reduce }: { title: string; reduce: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center pt-6">
      <motion.div
        className="hud-frame w-64 drop-shadow-[0_0_28px_rgb(56_214_255/0.85)]"
        style={
          {
            '--frame-color': 'rgb(56 214 255 / 0.95)',
            '--frame-fill': 'rgb(10 48 88 / 0.96)',
          } as React.CSSProperties
        }
        initial={reduce ? false : { opacity: 0, scale: 0.6, y: 0 }}
        animate={
          reduce
            ? { opacity: 1 }
            : { opacity: [0, 1, 1, 0], scale: [0.6, 1.04, 1, 0.92], y: [0, 0, 0, -720] }
        }
        transition={{ duration: 0.65, delay: 0.25, times: [0, 0.3, 0.55, 1], ease: 'easeIn' }}
      >
        <div className="px-5 py-4 text-center">
          <p className="font-hud text-[11px] uppercase tracking-[0.3em] text-status-active/80">
            Ignition
          </p>
          <p className="mt-1 truncate font-display text-sm tracking-[0.12em] text-hud-text">
            {title}
          </p>
        </div>
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
      className="ml-auto shrink-0 rounded px-1.5 text-base leading-none text-hud-muted hover:text-red-300"
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
      className={`min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-hud-line focus:border-status-active/60 focus:bg-black/30 focus:outline-none ${className}`}
    />
  );
}
