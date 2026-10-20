// "1 Welcome — 2 Worlds — 3 Start" progress strip. The connectors fill as steps complete.
import { motion } from 'framer-motion';
import { memo } from 'react';
import { STEPS } from './onboarding-form';

const FRAME = {
  done: { '--frame-color': 'rgb(56 214 255 / 0.7)', '--frame-fill': 'rgb(56 214 255 / 0.22)' },
  current: { '--frame-color': 'rgb(56 214 255 / 0.95)', '--frame-fill': 'rgb(4 18 38 / 0.95)' },
  todo: { '--frame-color': 'rgb(56 189 248 / 0.26)', '--frame-fill': 'rgb(4 18 38 / 0.8)' },
} as Record<'done' | 'current' | 'todo', React.CSSProperties>;

export const StepIndicator = memo(function StepIndicator({ step }: { step: number }) {
  return (
    <nav aria-label="Setup steps">
      <ol className="flex items-center gap-2">
        {STEPS.map((label, i) => {
          const state = i < step ? 'done' : i === step ? 'current' : 'todo';
          return (
            <li
              key={label}
              aria-current={state === 'current' ? 'step' : undefined}
              className="flex items-center gap-2"
            >
              {i > 0 ? (
                <span aria-hidden className="relative h-px w-6 overflow-hidden bg-hud-line sm:w-10">
                  <motion.span
                    className="absolute inset-0 origin-left bg-status-active"
                    initial={false}
                    animate={{ scaleX: i <= step ? 1 : 0 }}
                    transition={{ duration: 0.35, ease: 'easeOut' }}
                  />
                </span>
              ) : null}
              <span
                aria-hidden
                className={`hud-frame hud-frame-sm grid h-8 w-8 place-items-center font-display text-xs ${
                  state === 'todo' ? 'text-hud-muted' : 'text-status-active'
                } ${state === 'current' ? 'drop-shadow-[0_0_8px_rgb(56_214_255/0.6)]' : ''}`}
                style={FRAME[state]}
              >
                {state === 'done' ? '✓' : i + 1}
              </span>
              <span
                className={`hidden font-hud text-xs tracking-widest uppercase sm:inline ${
                  state === 'current' ? 'text-hud-text' : 'text-hud-muted'
                }`}
              >
                <span className="sr-only">{`Step ${i + 1}: `}</span>
                {label}
                {state === 'done' ? <span className="sr-only"> (done)</span> : null}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
});
