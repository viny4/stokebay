// Find code projects and import the chosen ones. Opening the dialog searches the whole home
// folder for Git projects straight away; "Choose a folder instead" scans one folder (Git or
// package.json). Scanning and the "already imported" filtering happen in main; this dialog only
// lets the user pick from what main found, which is also the only set main will accept.
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { formatRelative } from '../../shared/time';
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
  const scanComputer = useHud((s) => s.scanComputer);
  const importScanned = useHud((s) => s.importScanned);
  const closeDialog = useHud((s) => s.closeDialog);
  const showToast = useHud((s) => s.showToast);

  const [result, setResult] = useState<ScanResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(selectNone);
  const [worldIds, setWorldIds] = useState<Set<string>>(selectNone);
  const [busy, setBusy] = useState<Busy>('scanning');
  const [wholeComputer, setWholeComputer] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const chosen = result ? selectedPaths(result.candidates, selected) : [];

  const searchComputer = async () => {
    setBusy('scanning');
    setError(null);
    try {
      const next = await scanComputer();
      setWholeComputer(true);
      setResult(next);
      // Nothing ticked: a whole computer turns up forks and experiments too, so the user picks.
      setSelected(selectNone());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy('idle');
    }
  };

  const runScan = async () => {
    setBusy('scanning');
    setError(null);
    try {
      const next = await scanFolder();
      // A cancelled picker keeps whatever is on screen, so "Choose another folder" is safe.
      if (next) {
        setWholeComputer(false);
        setResult(next);
        setSelected(selectAll(next.candidates));
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy('idle');
    }
  };

  // Search as soon as the dialog opens: no folder to pick. (The ref stops React's development
  // double-run from searching twice.)
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void searchComputer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      title="Find your code projects"
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
            <p className="text-sm text-ink">
              {busy === 'scanning'
                ? 'Looking for Git projects on this computer…'
                : 'Couldn’t search this computer.'}
            </p>
            <p className="text-xs text-muted">
              Searches your home folder for folders with Git, skipping system and app folders.
              Nothing leaves your computer.
            </p>
            {busy === 'scanning' ? (
              <div aria-hidden className="h-1 overflow-hidden rounded-full bg-sunken">
                <div className="h-full w-1/3 animate-[scan_1.1s_ease-in-out_infinite] rounded-full bg-accent/60" />
              </div>
            ) : (
              <div className="flex gap-2">
                <Button variant="primary" onClick={() => void searchComputer()}>
                  Try again
                </Button>
                <Button onClick={() => void runScan()}>Choose a folder instead…</Button>
              </div>
            )}
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
                <p className="text-xs text-muted">
                  {wholeComputer ? 'Searched this computer for Git projects' : 'Scanned'}
                </p>
                <p
                  className="selectable mt-0.5 break-all text-sm font-medium text-ink"
                  title={result.searched.join('\n')}
                >
                  {wholeComputer ? placesLabel(result) : result.root}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {wholeComputer ? null : (
                  <Button onClick={() => void searchComputer()} disabled={disabled}>
                    Search whole computer
                  </Button>
                )}
                <Button onClick={() => void runScan()} disabled={disabled}>
                  {busy === 'scanning'
                    ? 'Scanning…'
                    : wholeComputer
                      ? 'Choose a folder instead…'
                      : 'Choose another folder'}
                </Button>
              </div>
            </div>

            {result.blocked.length > 0 ? (
              <div
                role="alert"
                className="flex flex-col items-start gap-2 rounded-md border border-danger/30 bg-danger/10 p-3"
              >
                <p className="text-sm text-ink">
                  macOS didn&apos;t let Stokebay look in {blockedLabel(result)}, so projects there
                  are missing from this list.
                </p>
                <p className="text-xs text-muted">
                  In Privacy settings, open Files and Folders, find Stokebay and turn those folders
                  on, then search again. (For everything at once, add Stokebay under Full Disk
                  Access.)
                </p>
                <div className="flex gap-2">
                  <Button onClick={() => void window.api.openPrivacySettings()}>
                    Open Privacy settings
                  </Button>
                  <Button onClick={() => void searchComputer()} disabled={disabled}>
                    Search again
                  </Button>
                </div>
              </div>
            ) : null}

            {result.truncated ? (
              <p className="rounded-md border border-line bg-sunken px-3 py-2 text-xs text-muted">
                Stopped early because there are a very large number of folders; choose a folder to
                search it completely.
              </p>
            ) : null}

            {result.candidates.length === 0 ? (
              <p className="text-sm text-muted">
                No new projects found in <span className="text-ink">{result.root}</span>.
              </p>
            ) : (
              <CandidateList
                result={result}
                wholeComputer={wholeComputer}
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
                  Add to areas (optional)
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
  wholeComputer,
  selected,
  disabled,
  onToggle,
  onAll,
  onNone,
}: {
  result: ScanResult;
  wholeComputer: boolean;
  selected: ReadonlySet<string>;
  disabled: boolean;
  onToggle: (path: string) => void;
  onAll: () => void;
  onNone: () => void;
}) {
  const count = result.candidates.length;
  const now = Date.now();
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
                  {wholeComputer
                    ? homeRelative(result.root, c.path)
                    : relativePath(result.root, c.path)}
                </span>
              </span>
              {c.lastTouchedAt ? (
                <span className="shrink-0 text-xs text-muted">
                  {formatRelative(c.lastTouchedAt, now)}
                </span>
              ) : null}
              {c.hasGit && !wholeComputer ? (
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

/** "~/Documents/app" inside the home folder; the full path anywhere else (other folders, drives). */
function homeRelative(home: string, path: string): string {
  const rel = relativePath(home, path);
  return rel === path ? path : `~/${rel}`;
}

/** "your home folder, /pkg and the drive "USB"" for the places a computer search covered. */
function placesLabel(result: ScanResult): string {
  const others = result.searched.filter((p) => p !== result.root);
  const names = [
    'your home folder',
    ...others.map((p) => (p.startsWith('/Volumes/') ? `the drive “${p.slice(9)}”` : p)),
  ];
  return names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** "Documents, Desktop" for folders in the home folder; full paths otherwise. */
function blockedLabel(result: ScanResult): string {
  const names = result.blocked.map((p) => {
    const rel = relativePath(result.root, p);
    return rel === p ? p : rel;
  });
  return names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
