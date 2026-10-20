// Step 3: start with an empty HUD or with example projects, and optionally scan a code folder
// once setup is done. The two starts are a radio group: exactly one applies.
import { useEffect, useId, useRef } from 'react';

const ACTIVE_FRAME = {
  '--frame-color': 'rgb(56 214 255 / 0.9)',
  '--frame-fill': 'rgb(8 40 72 / 0.92)',
} as React.CSSProperties;

function EmptyIcon() {
  return (
    <svg aria-hidden viewBox="0 0 40 40" className="h-10 w-10" fill="none" stroke="currentColor">
      <rect x="6" y="6" width="28" height="28" strokeDasharray="3 3" strokeWidth="1.5" />
      <path d="M20 14v12M14 20h12" strokeWidth="1.5" />
    </svg>
  );
}

function ExamplesIcon() {
  return (
    <svg aria-hidden viewBox="0 0 40 40" className="h-10 w-10" fill="none" stroke="currentColor">
      <rect x="5" y="5" width="13" height="13" strokeWidth="1.5" />
      <rect x="22" y="5" width="13" height="13" strokeWidth="1.5" />
      <rect x="5" y="22" width="13" height="13" strokeWidth="1.5" />
      <rect x="22" y="22" width="13" height="13" strokeWidth="1.5" strokeDasharray="3 2" />
    </svg>
  );
}

const CHOICES = [
  {
    samples: false,
    title: 'Start empty',
    body: 'A clean HUD. Add your first project whenever you are ready.',
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
    <section aria-labelledby="onboarding-start-title" className="flex flex-col gap-6 py-6">
      <div className="flex flex-col gap-2">
        <h1
          id="onboarding-start-title"
          ref={headingRef}
          tabIndex={-1}
          className="font-display text-2xl tracking-[0.12em] text-hud-text focus:outline-none sm:text-3xl"
        >
          How do you want to start?
        </h1>
        <p className="max-w-2xl font-hud text-lg leading-snug tracking-wide text-hud-muted">
          Either way, everything stays on this computer.
        </p>
      </div>

      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
        <legend className="sr-only">Starting point</legend>
        {CHOICES.map(({ samples, title, body, Icon }) => {
          const on = addSamples === samples;
          return (
            <label
              key={title}
              className={`hud-frame flex cursor-pointer flex-col gap-3 p-5 transition-[filter] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-4 has-[:focus-visible]:outline-status-active ${
                on ? 'drop-shadow-[0_0_14px_rgb(56_214_255/0.35)]' : 'hover:brightness-125'
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
                <span className={on ? 'text-status-active' : 'text-hud-muted'}>
                  <Icon />
                </span>
                {/* Visible selected state that doesn't rely on the glow alone. */}
                <span
                  aria-hidden
                  className={`grid h-5 w-5 place-items-center rounded-full border ${
                    on ? 'border-status-active' : 'border-hud-muted/60'
                  }`}
                >
                  {on ? <span className="h-2.5 w-2.5 rounded-full bg-status-active" /> : null}
                </span>
              </span>
              <span
                className={`font-display text-sm tracking-[0.18em] uppercase ${
                  on ? 'text-status-active' : 'text-hud-text'
                }`}
              >
                {title}
              </span>
              <span className="text-sm leading-relaxed text-hud-muted">{body}</span>
            </label>
          );
        })}
      </fieldset>

      <div className="hud-frame hud-frame-sm p-4" style={panelStyle}>
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={scan}
            disabled={busy}
            onChange={(e) => onScan(e.target.checked)}
            aria-describedby={scanHint}
            className="mt-1 h-4 w-4 shrink-0 accent-[#38d6ff]"
          />
          <span className="flex flex-col gap-1">
            <span className="font-hud text-base tracking-wide text-hud-text">
              Scan a folder for my code projects
            </span>
            <span id={scanHint} className="text-sm text-hud-muted">
              Optional, for coders. After setup you pick a folder; Stokebay lists the code projects
              inside it and you choose which to add.
            </span>
          </span>
        </label>
      </div>
    </section>
  );
}
