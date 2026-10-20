// Ties folder backups to settings: what the Settings screen calls, and the daily automatic run.
import type { BackupStatus } from '../shared/types';
import { dayStamp } from './services/backup';
import {
  backupRoot,
  findGoogleDrive,
  listSnapshots,
  restoreExternalBackup,
  runExternalBackup,
} from './services/external-backup';
import { UserError, type ProjectService } from './services/projects';

export interface BackupControllerDeps {
  service: ProjectService;
  dataDir: string;
  /** Waits until every pending save has reached the disk. */
  flush: () => Promise<void>;
  /** Restarts the app so it loads the restored data. */
  restart: () => void;
  clock?: () => number;
}

export class BackupController {
  constructor(private readonly deps: BackupControllerDeps) {}

  private get now(): number {
    return (this.deps.clock ?? Date.now)();
  }

  async status(): Promise<BackupStatus> {
    const { backupFolder, lastExternalBackupAt } = this.deps.service.bootstrap().settings;
    return {
      folder: backupFolder,
      lastBackupAt: lastExternalBackupAt,
      snapshots: backupFolder ? await listSnapshots(backupFolder) : [],
      googleDrive: await findGoogleDrive(),
    };
  }

  /** Starts backing up into `chosen` (a "Stokebay Backups" folder is made inside it). */
  async useFolder(chosen: string): Promise<BackupStatus> {
    await this.deps.service.updateSettings({ backupFolder: backupRoot(chosen) });
    // On a new Mac this folder already holds the backups to restore; backing up the empty
    // app first would overwrite today's copy with nothing.
    if (!(await this.wouldClobber())) await this.backupNow();
    return this.status();
  }

  /**
   * True when this app has no projects but the folder already has backups: writing now could
   * only replace good data with empty data.
   */
  private async wouldClobber(): Promise<boolean> {
    const folder = this.deps.service.bootstrap().settings.backupFolder;
    if (!folder || this.deps.service.summaries().length > 0) return false;
    return (await listSnapshots(folder)).length > 0;
  }

  async disable(): Promise<BackupStatus> {
    await this.deps.service.updateSettings({ backupFolder: null });
    return this.status();
  }

  async backupNow(): Promise<BackupStatus> {
    const folder = this.deps.service.bootstrap().settings.backupFolder;
    if (!folder) throw new UserError('Choose a backup folder first.');
    if (await this.wouldClobber()) {
      throw new UserError(
        'This app has no projects yet, but the folder has backups. Restore one first, so an empty backup doesn’t replace them.',
      );
    }
    await this.deps.flush();
    try {
      await runExternalBackup(this.deps.dataDir, folder, this.now);
    } catch (err) {
      throw new UserError(
        `Couldn't write to the backup folder. Is it still there? (${err instanceof Error ? err.message : String(err)})`,
      );
    }
    await this.deps.service.updateSettings({ lastExternalBackupAt: this.now });
    return this.status();
  }

  /** Called at startup and every few hours: backs up once per calendar day. */
  async backupIfDue(): Promise<boolean> {
    const { backupFolder, lastExternalBackupAt } = this.deps.service.bootstrap().settings;
    if (!backupFolder) return false;
    if (lastExternalBackupAt !== null && dayStamp(lastExternalBackupAt) === dayStamp(this.now)) {
      return false;
    }
    if (await this.wouldClobber()) return false;
    await this.backupNow();
    return true;
  }

  async restore(day: string): Promise<void> {
    const folder = this.deps.service.bootstrap().settings.backupFolder;
    if (!folder) throw new UserError('Choose the backup folder first.');
    await this.deps.flush();
    await restoreExternalBackup(this.deps.dataDir, folder, day, this.now);
    this.deps.restart();
  }
}
