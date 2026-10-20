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
            <p className="text-sm leading-relaxed text-hud-text">
              Pick a folder and the app will look for projects inside it: any folder with a{' '}
              <code className="font-mono text-status-active">.git</code> folder or a{' '}
              <code className="font-mono text-status-active">package.json</code>, up to 3 levels
              deep.
            </p>
            <ul className="list-disc space-y-1 pl-5 text-xs text-hud-muted">
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
                <p className="font-hud text-xs uppercase tracking-widest text-hud-muted">Scanned</p>
                <p className="break-all font-mono text-sm text-hud-text" title={result.root}>
                  {result.root}
                </p>
              </div>
              <Button className="shrink-0" onClick={() => void runScan()} disabled={disabled}>
                {busy === 'scanning' ? 'Scanning…' : 'Choose another folder'}
              </Button>
            </div>

            {result.truncated ? (
              <p className="rounded-md border border-status-paused/40 bg-status-paused/10 px-3 py-2 text-xs text-status-paused">
                Stopped early because the folder is very large; pick a smaller folder to see
                everything.
              </p>
            ) : null}

            {result.candidates.length === 0 ? (
              <p className="text-sm text-hud-muted">
                No new projects found in <span className="font-mono">{result.root}</span>.
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
              <p className="text-xs text-hud-muted">
                {result.alreadyImported === 1
                  ? '1 folder was already added and is skipped.'
                  : `${result.alreadyImported} folders were already added and are skipped.`}
              </p>
            ) : null}

            {result.candidates.length > 0 && worlds.length > 0 ? (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 font-hud text-xs uppercase tracking-widest text-hud-muted">
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
                        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors disabled:opacity-40 ${
                          on
                            ? 'border-status-active/60 bg-status-active/15 text-hud-text'
                            : 'border-hud-line text-hud-muted hover:text-hud-text'
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
                <p className="text-xs text-hud-muted">Applied to every imported project.</p>
              </fieldset>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>

      {error ? (
        <p role="alert" className="mt-4 text-xs text-red-300">
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
        <p className="font-hud text-xs uppercase tracking-widest text-hud-muted">
          Found {count} {count === 1 ? 'project' : 'projects'} · {checked} selected
        </p>
        <div className="flex gap-1">
          <Button
            className="px-2 py-0.5 text-xs"
            onClick={onAll}
            disabled={disabled || checked === count}
          >
            Select all
          </Button>
          <Button
            className="px-2 py-0.5 text-xs"
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
        className="max-h-72 divide-y divide-hud-line overflow-y-auto rounded-md border border-hud-line bg-black/20"
      >
        {result.candidates.map((c) => (
          <li key={c.path}>
            <label
              className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-white/[0.04]"
              title={c.path}
            >
              <input
                type="checkbox"
                className="h-4 w-4 shrink-0 accent-[var(--color-status-active)]"
                checked={selected.has(c.path)}
                disabled={disabled}
                onChange={() => onToggle(c.path)}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-hud-text">{c.name}</span>
                <span className="block truncate font-mono text-xs text-hud-muted">
                  {relativePath(result.root, c.path)}
                </span>
              </span>
              {c.hasGit ? (
                <span className="shrink-0 rounded border border-status-done/40 px-1.5 py-0.5 font-hud text-[10px] uppercase tracking-wider text-status-done">
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
