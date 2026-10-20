// The toolbar search. Typing filters the cards by title (as before) and also shows a dropdown
// of full-text matches: projects, and notes, links and Lab items inside them. Up/Down move,
// Enter opens, Escape clears.
import { useEffect, useId, useRef, useState } from 'react';
import { SNIPPET_CLOSE, SNIPPET_OPEN, type EntryType, type SearchHit } from '../../shared/types';
import { guard, useHud } from '../store/useHud';
import { inputClass } from './ui';

const DEBOUNCE_MS = 120;
const MIN_CHARS = 2;

const TYPE_LABEL: Record<EntryType, string> = {
  note: 'Note',
  link: 'Link',
  checklist: 'Checklist',
  image: 'Image',
  file: 'File',
};

export function SearchBox({ inputRef }: { inputRef: React.RefObject<HTMLInputElement | null> }) {
  const search = useHud((s) => s.search);
  const setSearch = useHud((s) => s.setSearch);
  const openProject = useHud((s) => s.openProject);
  const setSearchMatches = useHud((s) => s.setSearchMatches);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const listId = useId();
  const root = useRef<HTMLDivElement>(null);

  const query = search.trim();
  useEffect(() => {
    if (query.length < MIN_CHARS) {
      setHits([]);
      setSearchMatches(new Set());
      return;
    }
    // Only the newest query's answer is shown, even if an older one arrives later.
    let current = true;
    const timer = setTimeout(() => {
      window.api
        .search(query)
        .then((result) => {
          if (!current) return;
          setHits(result);
          setActive(0);
          // The grid also shows projects whose notes matched, not only title matches.
          setSearchMatches(new Set(result.map((h) => h.projectId)));
        })
        .catch(() => current && setHits([]));
    }, DEBOUNCE_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, setSearchMatches]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  const showList = open && query.length >= MIN_CHARS;
  const choose = (hit: SearchHit) => {
    setOpen(false);
    inputRef.current?.blur();
    guard(() => openProject(hit.projectId));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setSearch('');
      setOpen(false);
      e.currentTarget.blur();
    } else if (e.key === 'ArrowDown' && hits.length) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % hits.length);
    } else if (e.key === 'ArrowUp' && hits.length) {
      e.preventDefault();
      setActive((i) => (i - 1 + hits.length) % hits.length);
    } else if (e.key === 'Enter' && showList && hits[active]) {
      e.preventDefault();
      choose(hits[active]);
    }
  };

  const projectHits = hits.filter((h) => h.kind === 'project');
  const entryHits = hits.filter((h) => h.kind === 'entry');
  const optionId = (i: number) => `${listId}-${i}`;

  return (
    <div ref={root} className="relative">
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && hits[active] ? optionId(active) : undefined}
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search    /"
        aria-label="Search projects and notes"
        className={`${inputClass} h-8 w-64 py-1 @max-[760px]:w-44 @max-[520px]:w-28`}
      />
      {showList ? (
        <div
          id={listId}
          role="listbox"
          aria-label="Search results"
          className="absolute top-10 right-0 z-30 max-h-[70vh] w-[420px] overflow-y-auto rounded-lg border border-line bg-raised p-1 shadow-pop"
        >
          {hits.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-muted">Nothing matches “{query}”.</p>
          ) : null}
          {projectHits.length ? <GroupLabel>Projects</GroupLabel> : null}
          {projectHits.map((hit) => {
            const i = hits.indexOf(hit);
            return (
              <Option
                key={hit.projectId}
                id={optionId(i)}
                selected={i === active}
                onHover={() => setActive(i)}
                onChoose={() => choose(hit)}
              >
                <span className="truncate text-sm text-ink">
                  <Marked text={hit.snippet} />
                </span>
                {hit.archived ? <span className="text-xs text-muted">Archived</span> : null}
              </Option>
            );
          })}
          {entryHits.length ? <GroupLabel>Inside projects</GroupLabel> : null}
          {entryHits.map((hit) => {
            const i = hits.indexOf(hit);
            return (
              <Option
                key={hit.entryId}
                id={optionId(i)}
                selected={i === active}
                onHover={() => setActive(i)}
                onChoose={() => choose(hit)}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm text-ink">
                    {hit.title || <Marked text={hit.snippet} />}
                  </span>
                  {hit.title && hit.snippet ? (
                    <span className="line-clamp-2 text-xs text-muted">
                      <Marked text={hit.snippet} />
                    </span>
                  ) : null}
                  <span className="mt-0.5 truncate text-[11px] text-muted">
                    {hit.entryType ? TYPE_LABEL[hit.entryType] : ''} in {hit.projectTitle}
                    {hit.archived ? ' · archived' : ''}
                  </span>
                </span>
              </Option>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p role="presentation" className="px-3 pt-2 pb-1 text-[11px] font-semibold text-muted">
      {children}
    </p>
  );
}

function Option({
  id,
  selected,
  onHover,
  onChoose,
  children,
}: {
  id: string;
  selected: boolean;
  onHover: () => void;
  onChoose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={selected}
      onPointerEnter={onHover}
      // pointerdown, not click: the input's blur would otherwise close the list first.
      onPointerDown={(e) => {
        e.preventDefault();
        onChoose();
      }}
      className={`flex cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 ${
        selected ? 'bg-hover' : ''
      }`}
    >
      {children}
    </div>
  );
}

/** Shows the matched words (wrapped in SNIPPET_OPEN/CLOSE by the database) highlighted. */
function Marked({ text }: { text: string }) {
  const parts = text.split(SNIPPET_OPEN);
  return (
    <>
      {parts.map((part, i) => {
        if (i === 0) return <span key={i}>{part}</span>;
        const [hit, rest = ''] = part.split(SNIPPET_CLOSE);
        return (
          <span key={i}>
            <mark className="rounded-sm bg-accent/20 px-0.5 text-ink">{hit}</mark>
            {rest}
          </span>
        );
      })}
    </>
  );
}
