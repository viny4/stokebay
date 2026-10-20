// Scan a folder for code projects and import the chosen ones (prototype step 7).
// Scanning and the "already imported" filtering happen in main; this dialog only lets the
// user pick from what main found, which is also the only set main will accept on import.
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import type { ScanResult } from '../../shared/types';
import { errorMessage, useHud } from '../store/useHud';
import { Button, Dialog } from './ui';
import {
  importLabel,
  relativePath,
  selectAll,
  selectNone,
  selectedPaths,
  toggle,
} from './scan-selection';

type Busy = 'idle' | 'scanning' | 'importing';

export function ScanDialog() {
  const worlds = useHud((s) => s.worlds);
  const scanFolder = useHud((s) => s.scanFolder);
  const importScanned = useHud((s) => s.importScanned);
  const closeDialog = useHud((s) => s.closeDialog);
  const showToast = useHud((s) => s.showToast);

  const [result, setResult] = useState<ScanResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(selectNone);
  const [worldIds, setWorldIds] = useState<Set<string>>(selectNone);
  const [busy, setBusy] = useState<Busy>('idle');
  const [error, setError] = useState<string | null>(null);

  const chosen = result ? selectedPaths(result.candidates, selected) : [];

  const runScan = async () => {
    setBusy('scanning');
    setError(null);
    try {
      const next = await scanFolder();
      // A cancelled picker keeps whatever is on screen, so "Choose another folder" is safe.
      if (next) {
        setResult(next);
        setSelected(selectAll(next.candidates));
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy('idle');
    }
  };

  const runImport = async () => {
    if (chosen.length === 0) return;
    setBusy('importing');
    setError(null);
    try {
      // Keep the world order stable (store order) rather than click order.
      const ids = worlds.filter((w) => worldIds.has(w.id)).map((w) => w.id);
      const created = await importScanned({ paths: chosen, worldIds: ids });
      const n = created.length;
      closeDialog();
      showToast(`Imported ${n} project${n === 1 ? '' : 's'}. Git info will appear in a moment.`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy('idle');
    }
  };

  const disabled = busy !== 'idle';

  return (
    <Dialog
      title="Scan a folder for projects"
      width="max-w-2xl"
      onClose={closeDialog}
      footer={
        <>
          <Button onClick={closeDialog}>Cancel</Button>
          {result && result.candidates.length > 0 ? (
            <Button
              variant="primary"
              onClick={() => void runImport()}
              disabled={disabled || chosen.length === 0}
            >
              {busy === 'importing' ? 'Importing…' : importLabel(chosen.length)}
            </Button>
          ) : null}
        </>
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        {result === null ? (
          <motion.div
            key="idle"
            className="flex flex-col gap-4"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14 }}
          >
            <p className="text-sm leading-relaxed text-ink">
              Pick a folder and the app will look for projects inside it: any folder with a{' '}
              <code className="rounded bg-sunken px-1 py-0.5 font-mono text-[12px] text-ink">
                .git
              </code>{' '}
              folder or a{' '}
              <code className="rounded bg-sunken px-1 py-0.5 font-mono text-[12px] text-ink">
                package.json
              </code>
              , up to 3 levels deep.
            </p>
            <ul className="list-disc space-y-1 pl-5 text-xs text-muted">
              <li>Skips node_modules, dist, build, .next, venv and hidden folders.</li>
              <li>A Git repo counts as one project; folders inside it are not listed again.</li>
              <li>Nothing leaves your computer.</li>
            </ul>
            <div>
              <Button variant="primary" onClick={() => void runScan()} disabled={disabled}>
                {busy === 'scanning' ? 'Scanning…' : 'Choose folder…'}
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key={`results:${result.root}`}
            className="flex flex-col gap-4"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14 }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-muted">Scanned</p>
                <p
                  className="selectable mt-0.5 break-all text-sm font-medium text-ink"
                  title={result.root}
                >
                  {result.root}
                </p>
              </div>
              <Button className="shrink-0" onClick={() => void runScan()} disabled={disabled}>
                {busy === 'scanning' ? 'Scanning…' : 'Choose another folder'}
              </Button>
            </div>

            {result.truncated ? (
              <p className="rounded-md border border-line bg-sunken px-3 py-2 text-xs text-muted">
                Stopped early because the folder is very large; pick a smaller folder to see
                everything.
              </p>
            ) : null}

            {result.candidates.length === 0 ? (
              <p className="text-sm text-muted">
                No new projects found in <span className="text-ink">{result.root}</span>.
              </p>
            ) : (
              <CandidateList
                result={result}
                selected={selected}
                disabled={disabled}
                onToggle={(path) => setSelected((s) => toggle(s, path))}
                onAll={() => setSelected(selectAll(result.candidates))}
                onNone={() => setSelected(selectNone())}
              />
            )}

            {result.alreadyImported > 0 ? (
              <p className="text-xs text-muted">
                {result.alreadyImported === 1
                  ? '1 folder was already added and is skipped.'
                  : `${result.alreadyImported} folders were already added and are skipped.`}
              </p>
            ) : null}

            {result.candidates.length > 0 && worlds.length > 0 ? (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-[13px] font-semibold text-ink">
                  Add to worlds (optional)
                </legend>
                <div className="flex flex-wrap gap-2">
                  {worlds.map((world) => {
                    const on = worldIds.has(world.id);
                    return (
                      <button
                        key={world.id}
                        type="button"
                        aria-pressed={on}
                        disabled={disabled}
                        onClick={() => setWorldIds((s) => toggle(s, world.id))}
                        className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors disabled:opacity-40 ${
                          on
                            ? 'border-accent bg-accent/10 text-ink'
                            : 'border-line text-muted hover:bg-hover hover:text-ink'
                        }`}
                      >
                        <span
                          aria-hidden
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ background: world.color }}
                        />
                        {world.name}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted">Applied to every imported project.</p>
              </fieldset>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>

      {error ? (
        <p role="alert" className="mt-4 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}

function CandidateList({
  result,
  selected,
  disabled,
  onToggle,
  onAll,
  onNone,
}: {
  result: ScanResult;
  selected: ReadonlySet<string>;
  disabled: boolean;
  onToggle: (path: string) => void;
  onAll: () => void;
  onNone: () => void;
}) {
  const count = result.candidates.length;
  const checked = result.candidates.filter((c) => selected.has(c.path)).length;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">
          Found {count} {count === 1 ? 'project' : 'projects'} · {checked} selected
        </p>
        <div className="flex gap-1">
          <Button
            className="h-7 px-2 text-xs"
            onClick={onAll}
            disabled={disabled || checked === count}
          >
            Select all
          </Button>
          <Button
            className="h-7 px-2 text-xs"
            onClick={onNone}
            disabled={disabled || checked === 0}
          >
            Select none
          </Button>
        </div>
      </div>
      {/* Own scroll area so the root, notes and world chips stay in view on huge scans. */}
      <ul
        aria-label="Projects found"
        className="max-h-72 divide-y divide-line overflow-y-auto rounded-lg border border-line bg-surface"
      >
        {result.candidates.map((c) => (
          <li key={c.path}>
            <label
              className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-hover"
              title={c.path}
            >
              <input
                type="checkbox"
                className="h-4 w-4 shrink-0 accent-[var(--accent)]"
                checked={selected.has(c.path)}
                disabled={disabled}
                onChange={() => onToggle(c.path)}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-ink">{c.name}</span>
                <span className="block truncate text-xs text-muted">
                  {relativePath(result.root, c.path)}
                </span>
              </span>
              {c.hasGit ? (
                <span className="shrink-0 rounded-full bg-sunken px-2 py-0.5 text-[11px] text-muted">
                  Git
                </span>
              ) : null}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
