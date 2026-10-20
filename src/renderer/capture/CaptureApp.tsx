// The quick capture window: type a thought, pick the project, Enter. It lives in its own small
// window (opened by the global shortcut), so it loads its own data instead of the main store.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Id, ProjectSummary } from '../../shared/types';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { errorMessage } from '../store/useHud';
import { ProjectPicker } from './ProjectPicker';
import { captureTargets, defaultTarget } from './picker';

export function CaptureApp() {
  return (
    <ErrorBoundary>
      <Capture />
    </ErrorBoundary>
  );
}

function Capture() {
  const [targets, setTargets] = useState<ProjectSummary[] | null>(null);
  const [projectId, setProjectId] = useState<Id | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const focusText = () => {
    const box = textRef.current;
    if (!box) return;
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length);
  };

  // Every time the window is shown: fresh projects (they may have changed in the main window),
  // the usual project picked, and the cursor in the text box. A draft that wasn't saved (the
  // window was clicked away) is kept.
  const refresh = useCallback(() => {
    setError(null);
    focusText();
    window.api
      .bootstrap()
      .then((data) => {
        const list = captureTargets(data.projects);
        setTargets(list);
        setProjectId(defaultTarget(list, data.settings.lastCaptureProjectId)?.id ?? null);
      })
      .catch((err: unknown) => setError(errorMessage(err)));
  }, []);

  useEffect(() => {
    refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  const close = () => {
    setText('');
    setError(null);
    void window.api.captureClose();
  };

  const save = async () => {
    if (saving) return;
    if (!projectId) {
      setError('Pick a project first.');
      return;
    }
    if (!text.trim()) {
      setError('Write something first.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await window.api.captureSave({ projectId, text });
      setText('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const onTextKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      // Enter and ⌘/Ctrl+Enter save; Shift+Enter is a new line.
      e.preventDefault();
      void save();
    }
  };

  const noProjects = targets !== null && targets.length === 0;

  return (
    <main
      aria-label="Quick capture"
      className="flex h-full flex-col bg-raised text-ink"
      onKeyDown={(e) => {
        // Escape anywhere outside the picker's list puts the window away.
        if (e.key === 'Escape' && !e.defaultPrevented) close();
      }}
    >
      <label htmlFor="capture-text" className="sr-only">
        Note
      </label>
      <textarea
        id="capture-text"
        ref={textRef}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (error) setError(null);
        }}
        onKeyDown={onTextKey}
        placeholder="What's on your mind?"
        maxLength={20_000}
        aria-describedby="capture-keys"
        autoFocus
        spellCheck
        className="min-h-0 flex-1 resize-none bg-transparent px-4 pt-3.5 pb-2 text-[15px] leading-relaxed text-ink placeholder:text-muted/80 focus:outline-none"
      />
      <div className="flex h-11 shrink-0 items-center gap-3 border-t border-line px-3">
        {noProjects ? (
          <p className="text-[13px] text-muted">
            No projects yet. Add one in Stokebay, then capture to it.
          </p>
        ) : (
          <ProjectPicker
            targets={targets ?? []}
            value={projectId}
            onChange={(id) => {
              setProjectId(id);
              if (error) setError(null);
              focusText();
            }}
            onCancel={focusText}
            onSubmit={() => void save()}
          />
        )}
        <div className="ml-auto min-w-0 text-right">
          {error ? (
            <p role="alert" className="truncate text-xs text-danger">
              {error}
            </p>
          ) : (
            <p className="truncate text-[11px] text-muted" aria-hidden="true">
              {saving ? 'Saving…' : '↵ save · ⇧↵ new line · esc close'}
            </p>
          )}
          <p id="capture-keys" className="sr-only">
            Enter saves, Shift Enter adds a new line, Escape closes. Tab moves to the project.
          </p>
        </div>
      </div>
    </main>
  );
}
