// "Remind me" on a pause: when the time comes, a native notification asks whether to pick the
// project up again. Each reminder is shown once; it is cleared before the notification appears,
// so a crash or a second check can never repeat it.
import type { EpochMs, Id } from '../../shared/types';
import { createLogger } from '../logging/logger';
import type { ProjectRepository } from '../store/repository';

const log = createLogger('reminders');

/** Often enough that a reminder is at most a few minutes late, rare enough to cost nothing. */
export const REMINDER_CHECK_MS = 5 * 60 * 1000;

export interface DueReminder {
  pauseId: Id;
  projectId: Id;
  title: string;
  nextStep: string;
}

/** The parts of Electron's Notification used here, so tests can pass a fake. */
export interface NotificationLike {
  on(event: 'click' | 'close', listener: () => void): unknown;
  show(): void;
}
export interface NotificationClass {
  new (options: { title: string; body: string }): NotificationLike;
  isSupported(): boolean;
}

/**
 * Takes every due reminder and clears it in one save. Pauses of archived or no-longer-paused
 * projects are cleared too, without being returned: there is nothing to come back to.
 */
export async function takeDueReminders(
  repo: ProjectRepository,
  now: EpochMs,
): Promise<DueReminder[]> {
  const due = repo.listDueReminders(now);
  if (due.length === 0) return [];
  const reminders: DueReminder[] = [];
  for (const pause of due) {
    const project = repo.getProject(pause.projectId);
    if (!project || project.archivedAt !== null || project.status !== 'paused') continue;
    reminders.push({
      pauseId: pause.id,
      projectId: project.id,
      title: project.title,
      nextStep: pause.nextStep,
    });
  }
  await repo.transaction((tx) => due.forEach((pause) => tx.setPauseReminder(pause.id, null)));
  return reminders;
}

/** Notification text: the question in the title, the user's own next step as the body. */
export function reminderText(reminder: DueReminder): { title: string; body: string } {
  const next = reminder.nextStep.trim();
  return {
    title: `Time to pick up ${reminder.title}?`,
    body: next ? `Next step: ${clip(next, 180)}` : 'Open it to see where you stopped.',
  };
}

export interface ReminderOptions {
  repo: ProjectRepository;
  Notification: NotificationClass;
  /** Shows the main window on that project (the notification was clicked). */
  onOpen: (projectId: Id) => void;
  clock?: () => number;
  intervalMs?: number;
}

/** Checks now, then every few minutes. Returns a function that stops the checks. */
export function startReminders(options: ReminderOptions): () => void {
  const clock = options.clock ?? Date.now;
  // Electron drops click handlers of notifications that get garbage-collected, so keep each
  // one alive until it is clicked or dismissed.
  const showing = new Set<NotificationLike>();

  const check = async () => {
    try {
      const due = await takeDueReminders(options.repo, clock());
      if (due.length === 0) return;
      if (!options.Notification.isSupported()) {
        log.info('notifications not supported; reminders skipped', { count: due.length });
        return;
      }
      for (const reminder of due) {
        const notification = new options.Notification(reminderText(reminder));
        showing.add(notification);
        notification.on('click', () => {
          showing.delete(notification);
          options.onOpen(reminder.projectId);
        });
        notification.on('close', () => showing.delete(notification));
        notification.show();
        log.info('reminder shown', { projectId: reminder.projectId, pauseId: reminder.pauseId });
      }
    } catch (err) {
      log.error('reminder check failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  void check();
  const timer = setInterval(() => void check(), options.intervalMs ?? REMINDER_CHECK_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}

function clip(text: string, max: number): string {
  const oneLine = text.replace(/\s+/g, ' ');
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}
