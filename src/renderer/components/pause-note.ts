// Plain-word text for pausing and coming back: the pre-filled "where I stopped" draft, the
// "remind me" choices, and the quiet Git line on the resume card.
import { formatRelative } from '../../shared/time';
import type { EpochMs, GitWorkState } from '../../shared/types';

/** File names shown inline; the rest become "(+N more)". */
const SHOWN_FILES = 3;

/** The short commit of a detached HEAD (git.ts names it "detached @ <sha>"), else null. */
function detachedAt(branch: string): string | null {
  return /^detached @ (.+)$/.exec(branch)?.[1] ?? null;
}

function fileList(state: GitWorkState): string {
  const shown = state.changedFiles.slice(0, SHOWN_FILES);
  const more = state.changedCount - shown.length;
  return more > 0 ? `${shown.join(', ')} (+${more} more)` : shown.join(', ');
}

/**
 * A short, editable starting point for "Where I stopped", e.g.
 * `On branch main. Not committed yet: a.ts, b.ts (+3 more). Last commit: "Fix login" (2h ago).`
 */
export function workStateDraft(state: GitWorkState, now: EpochMs): string {
  const parts: string[] = [];
  if (state.branch) {
    const sha = detachedAt(state.branch);
    parts.push(sha ? `On commit ${sha}.` : `On branch ${state.branch}.`);
  }
  parts.push(
    state.changedCount > 0 ? `Not committed yet: ${fileList(state)}.` : 'Everything is committed.',
  );
  if (state.lastCommitAt !== null) {
    const subject = state.lastCommitMsg?.trim();
    parts.push(
      `Last commit: ${subject ? `"${subject}" ` : ''}(${formatRelative(state.lastCommitAt, now)}).`,
    );
  } else {
    parts.push('No commits yet.');
  }
  return parts.join(' ');
}

/** "When you paused: on main with 5 uncommitted files" for the resume card. */
export function gitContextLine(state: GitWorkState): string {
  const files =
    state.changedCount === 0
      ? 'everything committed'
      : `${state.changedCount} uncommitted file${state.changedCount === 1 ? '' : 's'}`;
  if (!state.branch) return `When you paused: ${files}`;
  const sha = detachedAt(state.branch);
  return `When you paused: on ${sha ? `commit ${sha}` : state.branch} with ${files}`;
}

/** The first few changed files, for under the resume-card line. */
export function gitContextFiles(state: GitWorkState): string | null {
  return state.changedCount > 0 ? fileList(state) : null;
}

export const REMIND_OPTIONS = [
  { value: 'none', label: 'No reminder', days: 0 },
  { value: '1d', label: 'Tomorrow', days: 1 },
  { value: '3d', label: 'In 3 days', days: 3 },
  { value: '1w', label: 'In a week', days: 7 },
  { value: '2w', label: 'In 2 weeks', days: 14 },
  { value: '1m', label: 'In a month', days: 30 },
] as const;
export type RemindChoice = (typeof REMIND_OPTIONS)[number]['value'];

/** Hour of the day reminders arrive: the start of a working morning, local time. */
export const REMIND_HOUR = 9;

/** When a choice should remind, at 9:00 local time that day; null for no reminder. */
export function remindTime(choice: RemindChoice, now: EpochMs): EpochMs | null {
  const days = REMIND_OPTIONS.find((o) => o.value === choice)?.days ?? 0;
  if (days === 0) return null;
  const at = new Date(now);
  // Calendar days, so daylight-saving changes don't shift the hour.
  at.setDate(at.getDate() + days);
  at.setHours(REMIND_HOUR, 0, 0, 0);
  return at.getTime();
}

/** E.g. "Tue, Oct 27, 9:00 AM", in the user's own date format. */
export function formatReminder(at: EpochMs): string {
  return new Date(at).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
