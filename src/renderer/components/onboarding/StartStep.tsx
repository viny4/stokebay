// Step 3: start with an empty list or with example projects, and optionally scan a code folder
// once setup is done. The two starts are a radio group: exactly one applies.
import { useEffect, useId, useRef } from 'react';

// Selected card: accent border and a faint accent wash, matching the selected chips.
const ACTIVE_FRAME = {
  '--frame-color': 'var(--accent)',
  '--frame-fill': 'color-mix(in srgb, var(--accent) 6%, var(--surface))',
} as React.CSSProperties;

function EmptyIcon() {
  return (
    <svg aria-hidden viewBox="0 0 40 40" className="h-8 w-8" fill="none" stroke="currentColor">
      <rect x="6" y="6" width="28" height="28" rx="6" strokeDasharray="3 3" strokeWidth="1.5" />
      <path d="M20 14v12M14 20h12" strokeWidth="1.5" />
    </svg>
  );
}

function ExamplesIcon() {
  return (
    <svg aria-hidden viewBox="0 0 40 40" className="h-8 w-8" fill="none" stroke="currentColor">
      <rect x="5" y="5" width="13" height="13" rx="3" strokeWidth="1.5" />
      <rect x="22" y="5" width="13" height="13" rx="3" strokeWidth="1.5" />
      <rect x="5" y="22" width="13" height="13" rx="3" strokeWidth="1.5" />
      <rect x="22" y="22" width="13" height="13" rx="3" strokeWidth="1.5" strokeDasharray="3 2" />
    </svg>
  );
}

const CHOICES = [
  {
    samples: false,
    title: 'Start empty',
    body: 'A clean slate. Add your first project whenever you are ready.',
    Icon: EmptyIcon,
  },
  {
    samples: true,
    title: 'Show me examples',
    body: 'Adds 7 example projects so you can see how everything works. You can remove them later.',
    Icon: ExamplesIcon,
  },
];

export function StartStep({
  addSamples,
  onAddSamples,
  scan,
  onScan,
  busy,
  panelStyle,
}: {
  addSamples: boolean;
  onAddSamples: (value: boolean) => void;
  scan: boolean;
  onScan: (value: boolean) => void;
  busy: boolean;
  panelStyle: React.CSSProperties;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const name = useId();
  const scanHint = useId();

  // Same as the worlds step: announce the new step and let Enter finish from here.
  useEffect(() => headingRef.current?.focus({ preventScroll: true }), []);

  return (
    <section aria-labelledby="onboarding-start-title" className="flex flex-col gap-6 py-10">
      <div className="flex flex-col gap-1.5">
        <h1
          id="onboarding-start-title"
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl font-semibold tracking-tight text-ink focus:outline-none"
        >
          How do you want to start?
        </h1>
        <p className="max-w-xl text-sm leading-relaxed text-muted">
          Either way, everything stays on this computer.
        </p>
      </div>

      <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
        <legend className="sr-only">Starting point</legend>
        {CHOICES.map(({ samples, title, body, Icon }) => {
          const on = addSamples === samples;
          return (
            <label
              key={title}
              className={`panel flex cursor-pointer flex-col gap-2 p-4 transition-colors has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${
                on ? '' : 'hover:border-line-strong'
              }`}
              style={on ? ACTIVE_FRAME : panelStyle}
            >
              <input
                type="radio"
                name={name}
                checked={on}
                onChange={() => onAddSamples(samples)}
                className="sr-only"
              />
              <span className="flex items-center justify-between">
                <span className="text-muted">
                  <Icon />
                </span>
                {/* A radio dot as well as the border, so the state doesn't rely on colour alone. */}
                <span
                  aria-hidden
                  className={`grid h-4 w-4 place-items-center rounded-full border ${
                    on ? 'border-accent bg-accent' : 'border-line-strong bg-surface'
                  }`}
                >
                  {on ? <span className="h-1.5 w-1.5 rounded-full bg-accent-ink" /> : null}
                </span>
              </span>
              <span className="text-[13px] font-semibold text-ink">{title}</span>
              <span className="text-xs leading-relaxed text-muted">{body}</span>
            </label>
          );
        })}
      </fieldset>

      <div className="panel p-4" style={panelStyle}>
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={scan}
            disabled={busy}
            onChange={(e) => onScan(e.target.checked)}
            aria-describedby={scanHint}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
          />
          <span className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-ink">Find my code projects</span>
            <span id={scanHint} className="text-xs leading-relaxed text-muted">
              Optional, for coders. After setup Stokebay lists the Git projects on this computer and
              you choose which to add.
            </span>
          </span>
        </label>
      </div>
    </section>
  );
}
