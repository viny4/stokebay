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
      <div className="flex flex-col divide-y divide-line [&>section]:py-6 [&>section:first-child]:pt-1 [&>section:last-child]:pb-1">
        <WorldsSettings />
        <EditorSettings />
        <DataSettings />
        <section aria-labelledby="settings-backups" className="flex flex-col gap-3">
          <div>
            <h3 id="settings-backups" className="text-[13px] font-semibold text-ink">
              Backups
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Stokebay already keeps copies on this computer. Add a folder in Google Drive, iCloud
              or Dropbox and a copy is saved there every day, so your projects survive even if this
              computer doesn&apos;t. Stokebay only writes files; your cloud app uploads them.
            </p>
          </div>

          {status === null ? (
            <p className="text-sm text-muted">Checking…</p>
          ) : status.folder ? (
            <div className="panel flex flex-col gap-3 p-4">
              <div>
                <p className="text-xs text-muted">Backing up to</p>
                <p className="selectable mt-0.5 text-sm font-medium break-all text-ink">
                  {status.folder}
                </p>
                <p className="mt-1.5 text-xs text-muted">
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
            <div className="panel flex flex-col gap-3 p-4">
              <p className="text-sm text-ink">Folder backups are off.</p>
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
                <p className="text-xs text-muted">
                  Tip: install Google Drive for desktop, then pick its &ldquo;My Drive&rdquo;
                  folder.
                </p>
              ) : null}
            </div>
          )}

          {status && status.snapshots.length > 0 ? (
            <div className="panel flex flex-col gap-3 p-4">
              <p className="text-[13px] font-medium text-ink">Restore from backup</p>
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="restore-day" className="sr-only">
                  Backup date
                </label>
                <select
                  id="restore-day"
                  value={restoreDay ?? ''}
                  onChange={(e) => setRestoreDay(e.target.value || null)}
                  className="h-8 rounded-md border border-line bg-surface px-2.5 text-[13px] text-ink focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/15"
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
              <p className="text-xs text-muted">
                Your current data is saved aside first, so restoring never loses anything.
              </p>
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
        </section>
      </div>
    </Dialog>
  );
}
