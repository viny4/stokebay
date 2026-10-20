// Side panel for one project. It overlays the right edge instead of being a modal so the grid
// stays usable: clicking another card just swaps the panel (App keys it by project id).
import { motion } from 'framer-motion';
import { editorById } from '../../shared/editors';
import { useCallback, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { addLinkInput, addNoteInput } from '../../shared/schemas';
import { formatRelative } from '../../shared/time';
import type { Entry, ProjectDetail as Detail, ProjectSummary } from '../../shared/types';
import { ResumeCard } from '../components/ResumeCard';
import { Timeline } from '../components/Timeline';
import { Button, Field, StatusBadge, WorldTag, inputClass } from '../components/ui';
import { errorMessage, guard, useHud } from '../store/useHud';

export function ProjectDetail() {
  const selectedId = useHud((s) => s.selectedId);
  const detail = useHud((s) => s.detail);
  const closeProject = useHud((s) => s.closeProject);
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  // The resume card only gets its pulse and focus when the panel *opens* on a paused project.
  // Pausing again from inside the panel shouldn't steal focus, so this is decided once, from
  // the first detail that arrives (setState during render is React's derived-state pattern).
  const ready = detail !== null && detail.project.id === selectedId;
  const [openedPaused, setOpenedPaused] = useState<boolean | null>(null);
  if (ready && openedPaused === null) setOpenedPaused(detail.project.status === 'paused');

  return (
    <motion.aside
      aria-labelledby={headingId}
      className="fixed top-0 right-0 z-40 flex h-full w-[480px] max-w-full flex-col border-l border-status-active/40 bg-hud-raised shadow-[-24px_0_60px_-20px_rgb(0_0_0/0.8),-2px_0_24px_-6px_rgb(56_214_255/0.45)] backdrop-blur-md"
      initial={{ x: '100%', opacity: 0.6 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0.6 }}
      transition={{ type: 'tween', duration: 0.22, ease: 'easeOut' }}
    >
      <button
        type="button"
        aria-label="Close project"
        onClick={closeProject}
        className="absolute top-3 right-3 z-10 rounded px-2 text-xl leading-none text-hud-muted hover:text-hud-text"
      >
        ×
      </button>
      <div className="flex-1 overflow-y-auto px-6 pt-5 pb-10">
        {ready ? (
          <DetailBody
            detail={detail}
            headingId={headingId}
            headingRef={headingRef}
            emphasizeResume={openedPaused === true}
          />
        ) : (
          <Skeleton headingId={headingId} />
        )}
      </div>
    </motion.aside>
  );
}

function Skeleton({ headingId }: { headingId: string }) {
  return (
    <div aria-busy="true" className="animate-pulse space-y-4 pr-8">
      <h2 id={headingId} className="sr-only">
        Loading project
      </h2>
      <div className="h-6 w-2/3 rounded bg-white/[0.07]" />
      <div className="h-3 w-1/3 rounded bg-white/[0.05]" />
      <div className="flex gap-2">
        <div className="h-7 w-16 rounded bg-white/[0.05]" />
        <div className="h-7 w-16 rounded bg-white/[0.05]" />
        <div className="h-7 w-24 rounded bg-white/[0.05]" />
      </div>
      <div className="h-28 rounded-lg bg-white/[0.04]" />
      <div className="h-20 rounded-lg bg-white/[0.04]" />
    </div>
  );
}

function DetailBody({
  detail,
  headingId,
  headingRef,
  emphasizeResume,
}: {
  detail: Detail;
  headingId: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  emphasizeResume: boolean;
}) {
  const { project, entries, events } = detail;
  const now = useHud((s) => s.now);
  const resumeProject = useHud((s) => s.resumeProject);
  const showToast = useHud((s) => s.showToast);
  const archived = project.archivedAt !== null;

  const notes = useMemo(() => entries.filter((e) => e.type === 'note'), [entries]);
  const links = useMemo(() => entries.filter((e) => e.type === 'link'), [entries]);

  const onResume = useCallback(async () => {
    try {
      await resumeProject(project.id);
      // The card (and its focused button) disappears, so park focus on the title instead of
      // dropping it to <body>.
      headingRef.current?.focus();
    } catch (err) {
      showToast(errorMessage(err), 'error');
    }
  }, [resumeProject, showToast, project.id, headingRef]);

  return (
    <div className="space-y-7">
      {project.status === 'paused' && project.activePause ? (
        <ResumeCard
          pause={project.activePause}
          now={now}
          onResume={onResume}
          emphasize={emphasizeResume}
        />
      ) : null}

      <Header project={project} headingId={headingId} headingRef={headingRef} now={now} />

      {project.git ? <GitSection project={project} now={now} /> : null}

      <Section title="Notes">
        {archived ? null : <NoteForm projectId={project.id} />}
        <NoteList notes={notes} now={now} />
      </Section>

      <Section title="Links">
        {archived ? null : <LinkForm projectId={project.id} />}
        <LinkList links={links} now={now} />
      </Section>

      <Section title="Timeline">
        <Timeline events={events} entries={entries} now={now} />
      </Section>
    </div>
  );
}

function Header({
  project,
  headingId,
  headingRef,
  now,
}: {
  project: ProjectSummary;
  headingId: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  now: number;
}) {
  const allWorlds = useHud((s) => s.worlds);
  const worlds = useMemo(
    () => allWorlds.filter((w) => project.worldIds.includes(w.id)),
    [allWorlds, project.worldIds],
  );
  const archived = project.archivedAt !== null;

  return (
    <header className="space-y-3">
      <div className="pr-8">
        <h2
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className="font-display text-lg font-medium tracking-wide text-hud-text focus:outline-none"
        >
          {project.title}
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <StatusBadge status={project.status} />
          {archived ? (
            <span className="font-hud text-xs uppercase tracking-wider text-hud-muted">
              Archived
            </span>
          ) : null}
          {worlds.map((w) => (
            <WorldTag key={w.id} world={w} />
          ))}
        </div>
        <p className="mt-2 font-hud text-xs text-hud-muted">
          Last activity{' '}
          <time dateTime={new Date(project.lastActivityAt).toISOString()}>
            {formatRelative(project.lastActivityAt, now)}
          </time>
        </p>
        {project.path ? (
          <p className="mt-1 truncate font-mono text-xs text-hud-muted" title={project.path}>
            {project.path}
          </p>
        ) : null}
      </div>
      <Actions project={project} />
    </header>
  );
}

function Actions({ project }: { project: ProjectSummary }) {
  const openDialog = useHud((s) => s.openDialog);
  const resumeProject = useHud((s) => s.resumeProject);
  const archiveProject = useHud((s) => s.archiveProject);
  const restoreProject = useHud((s) => s.restoreProject);
  const openInEditor = useHud((s) => s.openInEditor);
  const revealInFinder = useHud((s) => s.revealInFinder);
  const showToast = useHud((s) => s.showToast);
  const enterLab = useHud((s) => s.enterLab);
  const editorName = useHud((s) => editorById(s.settings.editor).name);
  const id = project.id;

  if (project.archivedAt !== null) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => guard(() => restoreProject(id))}>
          Restore
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Project actions">
      <Button variant="primary" onClick={() => guard(() => enterLab(id))}>
        Enter Lab ▸
      </Button>
      <Button onClick={() => openDialog({ kind: 'project', mode: 'edit', projectId: id })}>
        Edit
      </Button>
      {project.status === 'active' ? (
        <Button onClick={() => openDialog({ kind: 'pause', projectId: id })}>Pause</Button>
      ) : project.status === 'paused' ? (
        <Button onClick={() => guard(() => resumeProject(id))}>Resume</Button>
      ) : null}
      <Button
        onClick={() =>
          guard(async () => {
            await archiveProject(id);
            showToast('Archived. Restore it from the Archived list.');
          })
        }
      >
        Archive
      </Button>
      {project.path ? (
        <>
          <Button variant="primary" onClick={() => guard(() => openInEditor(id))}>
            Open in {editorName}
          </Button>
          <Button onClick={() => guard(() => revealInFinder(id))}>Reveal in Finder</Button>
        </>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h3
        id={id}
        className="font-display text-[11px] tracking-[0.3em] text-status-active/90 uppercase"
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

function GitSection({ project, now }: { project: ProjectSummary; now: number }) {
  const git = project.git;
  if (!git) return null;
  return (
    <Section title="Git">
      {git.error ? (
        <p className="text-sm text-hud-muted">{git.error}</p>
      ) : (
        <div className="rounded-md border border-hud-line bg-black/20 px-3 py-2.5 text-sm">
          <p className="font-hud text-xs text-hud-muted">
            branch <span className="text-hud-text">{git.branch ?? 'detached'}</span>
          </p>
          {git.lastCommitAt !== null ? (
            <p className="mt-1.5 text-hud-text">
              {git.lastCommitMsg ?? '(no message)'}
              <span className="ml-2 font-hud text-xs text-hud-muted">
                {formatRelative(git.lastCommitAt, now)}
              </span>
            </p>
          ) : (
            <p className="mt-1.5 text-hud-muted">No commits yet.</p>
          )}
        </div>
      )}
    </Section>
  );
}

const isSubmitKey = (e: React.KeyboardEvent) => e.key === 'Enter' && (e.metaKey || e.ctrlKey);

/**
 * App closes the panel on Escape. Inside a form with a half-written draft that would feel like
 * losing work, so the first Escape only leaves the field; a second one closes the panel.
 */
function keepDraftOnEscape(e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
  if (e.key === 'Escape' && e.currentTarget.value.trim() !== '') {
    e.stopPropagation();
    e.currentTarget.blur();
  }
}

function firstIssue(
  issues: { path: PropertyKey[]; message: string }[],
  field: string,
): string | null {
  return issues.find((i) => i.path[0] === field)?.message ?? null;
}

function NoteForm({ projectId }: { projectId: string }) {
  const addNote = useHud((s) => s.addNote);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (saving) return;
    const parsed = addNoteInput.safeParse({ projectId, title, body });
    if (!parsed.success) {
      const issues = parsed.error.issues;
      setError(firstIssue(issues, 'body') ?? firstIssue(issues, 'title') ?? issues[0]?.message);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await addNote(parsed.data);
      setTitle('');
      setBody('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    keepDraftOnEscape(e);
    if (isSubmitKey(e)) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <form
      aria-label="Add a note"
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Field label="Note title (optional)">
        {(id) => (
          <input
            id={id}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="e.g. Ideas for the retry logic"
            className={inputClass}
          />
        )}
      </Field>
      <Field label="Note" error={error} hint="Plain text. ⌘/Ctrl + Enter to add.">
        {(id) => (
          <textarea
            id={id}
            rows={3}
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={onKeyDown}
            placeholder="What did you figure out, decide or want to remember?"
            className={`${inputClass} resize-y`}
          />
        )}
      </Field>
      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? 'Adding…' : 'Add note'}
        </Button>
      </div>
    </form>
  );
}

const NoteList = ({ notes, now }: { notes: Entry[]; now: number }) =>
  notes.length === 0 ? (
    <p className="text-sm text-hud-muted">No notes yet.</p>
  ) : (
    <ul className="space-y-2">
      {notes.map((note) => (
        <li key={note.id} className="rounded-md border border-hud-line bg-black/20 px-3 py-2.5">
          {note.title ? <p className="text-sm font-semibold text-hud-text">{note.title}</p> : null}
          {/* Plain text rendered as text (never HTML); pre-wrap keeps the user's line breaks. */}
          <p className="text-sm break-words whitespace-pre-wrap text-hud-text/90">{note.body}</p>
          <time
            dateTime={new Date(note.createdAt).toISOString()}
            className="mt-1 block font-hud text-[11px] text-hud-muted"
          >
            {formatRelative(note.createdAt, now)}
          </time>
        </li>
      ))}
    </ul>
  );

/** People paste "example.com"; the schema wants a full http(s) URL, so assume https. */
function withScheme(raw: string): string {
  const value = raw.trim();
  if (value === '' || /^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function hostOf(url: string | null): string {
  if (!url) return '';
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function LinkForm({ projectId }: { projectId: string }) {
  const addLink = useHud((s) => s.addLink);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (saving) return;
    const parsed = addLinkInput.safeParse({ projectId, title, url: withScheme(url) });
    if (!parsed.success) {
      const issues = parsed.error.issues;
      setError(firstIssue(issues, 'url') ?? firstIssue(issues, 'title') ?? issues[0]?.message);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await addLink(parsed.data);
      setTitle('');
      setUrl('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      aria-label="Add a link"
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="grid grid-cols-[2fr_3fr] gap-2">
        <Field label="Link title (optional)">
          {(id) => (
            <input
              id={id}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={keepDraftOnEscape}
              placeholder="e.g. Design doc"
              className={inputClass}
            />
          )}
        </Field>
        <Field label="URL" error={error}>
          {(id) => (
            <input
              id={id}
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={keepDraftOnEscape}
              placeholder="example.com/page"
              className={inputClass}
            />
          )}
        </Field>
      </div>
      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? 'Adding…' : 'Add link'}
        </Button>
      </div>
    </form>
  );
}

function LinkList({ links, now }: { links: Entry[]; now: number }) {
  const openLink = useHud((s) => s.openLink);
  if (links.length === 0) return <p className="text-sm text-hud-muted">No links yet.</p>;
  return (
    <ul className="space-y-1.5">
      {links.map((link) => (
        <li key={link.id}>
          <button
            type="button"
            onClick={() => guard(() => openLink(link.id))}
            title={link.url ?? undefined}
            className="group flex w-full items-baseline gap-2 rounded-md border border-hud-line bg-black/20 px-3 py-2 text-left hover:border-status-active/40 hover:bg-status-active/[0.05]"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-status-active group-hover:underline">
                {link.title}
              </span>
              <span className="block truncate font-hud text-[11px] text-hud-muted">
                {hostOf(link.url)}
              </span>
            </span>
            <span className="shrink-0 font-hud text-[11px] text-hud-muted">
              {formatRelative(link.createdAt, now)}
              <span aria-hidden> ↗</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
