// Quiet progress: "Step 2 of 3" with one small dot per step. Labels stay for screen readers.
import { memo } from 'react';
import { STEPS } from './onboarding-form';

export const StepIndicator = memo(function StepIndicator({ step }: { step: number }) {
  return (
    <nav aria-label="Setup steps" className="flex items-center gap-3">
      <ol className="flex items-center gap-1.5">
        {STEPS.map((label, i) => {
          const state = i < step ? 'done' : i === step ? 'current' : 'todo';
          return (
            <li key={label} aria-current={state === 'current' ? 'step' : undefined}>
              <span
                aria-hidden
                className={`block h-1.5 rounded-full transition-[width,background-color] duration-200 ${
                  state === 'current'
                    ? 'w-4 bg-accent'
                    : state === 'done'
                      ? 'w-1.5 bg-muted'
                      : 'w-1.5 bg-line-strong'
                }`}
              />
              <span className="sr-only">
                {`Step ${i + 1}: ${label}`}
                {state === 'done' ? ' (done)' : ''}
              </span>
            </li>
          );
        })}
      </ol>
      <span aria-hidden className="text-xs text-muted">
        Step {step + 1} of {STEPS.length}
      </span>
    </nav>
  );
});
