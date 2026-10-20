// Settings: worlds, editor, data folder, and backups to a folder such as Google Drive.
import { useEffect, useState } from 'react';
import { formatRelative } from '../../shared/time';
import type { BackupStatus } from '../../shared/types';
import { errorMessage, useHud } from '../store/useHud';
import { DataSettings, EditorSettings, WorldsSettings } from './settings/GeneralSettings';
import { Button, Dialog } from './ui';

export function SettingsDialog() {
  const closeDialog = useHud((s) => s.closeDialog);
  const showToast = useHud((s) => s.showToast);
  const now = useHud((s) => s.now);
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoreDay, setRestoreDay] = useState<string | null>(null);

  useEffect(() => {
    window.api
      .backupStatus()
      .then(setStatus)
      .catch((err: unknown) => setError(errorMessage(err)));
  }, []);

  const run = async (action: () => Promise<BackupStatus | null>, done?: string) => {
    setBusy(true);
    setError(null);
    try {
      const next = await action();
      if (next) setStatus(next);
      if (done && next) showToast(done);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const restore = async (day: string) => {
    setBusy(true);
    setError(null);
    try {
      // The app restarts by itself once the backup is back in place.
      await window.api.backupRestore(day);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="Settings"
      onClose={closeDialog}
      width="max-w-2xl"
      footer={<Button onClick={closeDialog}>Close</Button>}
    >
      <div className="flex flex-col gap-8">
        <WorldsSettings />
        <EditorSettings />
        <DataSettings />
        <section aria-labelledby="settings-backups" className="flex flex-col gap-4">
          <div>
            <h3
              id="settings-backups"
              className="font-display text-xs tracking-[0.3em] text-status-active uppercase"
            >
              Backups
            </h3>
            <p className="mt-2 text-sm text-hud-muted">
              Stokebay already keeps copies on this Mac. Add a folder in Google Drive, iCloud or
              Dropbox and a copy is saved there every day, so your projects survive even if this Mac
              doesn&apos;t. Stokebay only writes files; your cloud app uploads them.
            </p>
          </div>

          {status === null ? (
            <p className="font-hud text-sm text-hud-muted">Checking…</p>
          ) : status.folder ? (
            <div className="hud-frame hud-frame-sm flex flex-col gap-3 p-4">
              <div>
                <p className="font-hud text-xs tracking-widest text-hud-muted uppercase">
                  Backing up to
                </p>
                <p className="mt-1 font-mono text-xs break-all text-hud-text">{status.folder}</p>
                <p className="mt-2 text-sm text-hud-muted">
                  {status.lastBackupAt
                    ? `Last backup ${formatRelative(status.lastBackupAt, now)} · ${status.snapshots.length} day${status.snapshots.length === 1 ? '' : 's'} kept (up to 30)`
                    : 'No backup yet.'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  disabled={busy}
                  onClick={() => void run(() => window.api.backupNow(), 'Backed up.')}
                >
                  {busy ? 'Working…' : 'Back up now'}
                </Button>
                <Button
                  disabled={busy}
                  onClick={() =>
                    void run(() => window.api.backupChooseFolder(), 'Backup folder changed.')
                  }
                >
                  Change folder…
                </Button>
                <Button disabled={busy} onClick={() => void run(() => window.api.backupDisable())}>
                  Turn off
                </Button>
              </div>
            </div>
          ) : (
            <div className="hud-frame hud-frame-sm flex flex-col gap-3 p-4">
              <p className="text-sm text-hud-text">Folder backups are off.</p>
              <div className="flex flex-wrap gap-2">
                {status.googleDrive ? (
                  <Button
                    variant="primary"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => window.api.backupUseFolder(status.googleDrive as string),
                        'Backing up to Google Drive.',
                      )
                    }
                  >
                    Use Google Drive
                  </Button>
                ) : null}
                <Button
                  variant={status.googleDrive ? 'ghost' : 'primary'}
                  disabled={busy}
                  onClick={() =>
                    void run(() => window.api.backupChooseFolder(), 'Backups turned on.')
                  }
                >
                  Choose folder…
                </Button>
              </div>
              {!status.googleDrive ? (
                <p className="text-xs text-hud-muted">
                  Tip: install Google Drive for desktop, then pick its &ldquo;My Drive&rdquo;
                  folder.
                </p>
              ) : null}
            </div>
          )}

          {status && status.snapshots.length > 0 ? (
            <div className="hud-frame hud-frame-sm flex flex-col gap-3 p-4">
              <p className="font-hud text-xs tracking-widest text-hud-muted uppercase">
                Restore from backup
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="restore-day" className="sr-only">
                  Backup date
                </label>
                <select
                  id="restore-day"
                  value={restoreDay ?? ''}
                  onChange={(e) => setRestoreDay(e.target.value || null)}
                  className="rounded-md border border-hud-line bg-black/30 px-3 py-1.5 text-sm text-hud-text"
                >
                  <option value="">Pick a date…</option>
                  {status.snapshots.map((day) => (
                    <option key={day} value={day}>
                      {day}
                    </option>
                  ))}
                </select>
                <Button
                  variant="danger"
                  disabled={busy || !restoreDay}
                  onClick={() => restoreDay && void restore(restoreDay)}
                >
                  Restore and restart
                </Button>
              </div>
              <p className="text-xs text-hud-muted">
                Your current data is saved aside first, so restoring never loses anything.
              </p>
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-red-300">
              {error}
            </p>
          ) : null}
        </section>
      </div>
    </Dialog>
  );
}
