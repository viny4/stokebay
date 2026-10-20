import { describe, expect, it } from 'vitest';
import {
  gitContextFiles,
  gitContextLine,
  remindTime,
  workStateDraft,
} from '../src/renderer/components/pause-note';
import type { GitWorkState } from '../src/shared/types';

const NOW = new Date(2026, 9, 20, 15, 30).getTime();
const HOUR = 60 * 60 * 1000;

const state = (over: Partial<GitWorkState> = {}): GitWorkState => ({
  branch: 'feature/login',
  lastCommitAt: NOW - 2 * HOUR,
  lastCommitMsg: 'Add token refresh',
  changedFiles: ['src/auth.ts', 'src/api.ts', 'src/a.ts', 'src/b.ts', 'src/c.ts'],
  changedCount: 5,
  ...over,
});

describe('workStateDraft', () => {
  it('says branch, unfinished files and the last commit in plain words', () => {
    expect(workStateDraft(state(), NOW)).toBe(
      'On branch feature/login. Not committed yet: src/auth.ts, src/api.ts, src/a.ts (+2 more). ' +
        'Last commit: "Add token refresh" (2h ago).',
    );
  });

  it('covers a clean repo, a detached HEAD and no commits', () => {
    expect(
      workStateDraft(
        state({
          branch: 'detached @ abc123',
          changedFiles: [],
          changedCount: 0,
          lastCommitAt: null,
          lastCommitMsg: null,
        }),
        NOW,
      ),
    ).toBe('On commit abc123. Everything is committed. No commits yet.');
  });

  it('counts files past the 20 listed', () => {
    expect(
      workStateDraft(state({ changedFiles: ['a', 'b', 'c'], changedCount: 40 }), NOW),
    ).toContain('a, b, c (+37 more)');
  });
});

describe('gitContextLine', () => {
  it('summarises the state for the resume card', () => {
    expect(gitContextLine(state())).toBe(
      'When you paused: on feature/login with 5 uncommitted files',
    );
    expect(gitContextLine(state({ changedCount: 1 }))).toBe(
      'When you paused: on feature/login with 1 uncommitted file',
    );
    expect(gitContextLine(state({ branch: null, changedCount: 0, changedFiles: [] }))).toBe(
      'When you paused: everything committed',
    );
    expect(gitContextFiles(state({ changedCount: 0, changedFiles: [] }))).toBeNull();
  });
});

describe('remindTime', () => {
  it('lands on 9:00 local time the chosen number of days later', () => {
    expect(remindTime('none', NOW)).toBeNull();
    expect(remindTime('1d', NOW)).toBe(new Date(2026, 9, 21, 9).getTime());
    expect(remindTime('1w', NOW)).toBe(new Date(2026, 9, 27, 9).getTime());
    expect(remindTime('1m', NOW)).toBe(new Date(2026, 10, 19, 9).getTime());
  });
});
