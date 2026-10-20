// First-run setup, shown full-screen on a fresh install: welcome → pick worlds → choose how to
// start. Finishing saves everything in one call; App then swaps this screen for the project
// list, and the scan dialog opens over it if the user asked for one.
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  EMPTY_PICKS,
  LAST_STEP,
  buildOnboardingInput,
  type WorldPicks,
} from '../components/onboarding/onboarding-form';
import { StartStep } from '../components/onboarding/StartStep';
import { StepIndicator } from '../components/onboarding/StepIndicator';
import { INTRO_MS, WelcomeStep } from '../components/onboarding/WelcomeStep';
import { WorldsStep } from '../components/onboarding/WorldsStep';
import { Button } from '../components/ui';
import { errorMessage, useHud } from '../store/useHud';

// Steps use the plain `.panel` card; nothing to override.
const panelStyle: React.CSSProperties = {};

// Steps slide in from the direction of travel. pointerEvents stops a quick double click on
// the outgoing step's buttons from acting a second time while it fades away.
const slide: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 8 }),
  center: { opacity: 1, x: 0, pointerEvents: 'auto' },
  exit: (dir: number) => ({ opacity: 0, x: dir * -8, pointerEvents: 'none' }),
};

const MODIFIERS = ['Shift', 'Meta', 'Control', 'Alt', 'Tab'];

/** Controls whose own Enter behaviour (click, add) must win over "Enter advances". */
function handlesEnter(target: EventTarget): boolean {
  if (target instanceof HTMLInputElement) return !['checkbox', 'radio'].includes(target.type);
  return (
    target instanceof HTMLButtonElement ||
    target instanceof HTMLAnchorElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

export function Onboarding() {
  const reduce = useReducedMotion() ?? false;
  const finishOnboarding = useHud((s) => s.finishOnboarding);
  const openDialog = useHud((s) => s.openDialog);
  const showToast = useHud((s) => s.showToast);

  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [picks, setPicks] = useState<WorldPicks>(EMPTY_PICKS);
  const [addSamples, setAddSamples] = useState(false);
  const [scan, setScan] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [introDone, setIntroDone] = useState(reduce);
  const root = useRef<HTMLElement>(null);

  // The intro holds focus on the screen itself (not the hidden "Get started") so the first
  // key press only skips it.
  useEffect(() => {
    if (introDone) return;
    root.current?.focus({ preventScroll: true });
    const timer = setTimeout(() => setIntroDone(true), INTRO_MS);
    return () => clearTimeout(timer);
  }, [introDone]);

  const goTo = (next: number) => {
    // The button that was pressed may unmount with its step; park focus on the screen until
    // the next step focuses its own heading, so keys never fall through to the app's shortcuts.
    root.current?.focus({ preventScroll: true });
    setDir(next > step ? 1 : -1);
    setStep(next);
    setError(null);
  };

  const finish = async () => {
    const result = buildOnboardingInput(picks, addSamples);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setError(null);
    // Disabling the focused button would drop focus to <body>; keep it inside setup.
    root.current?.focus({ preventScroll: true });
    setSaving(true);
    try {
      await finishOnboarding(result.value);
      // On success App unmounts this screen, so there is no state to reset.
      if (scan) openDialog({ kind: 'scan' });
      else showToast('All set. Welcome to Stokebay.');
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  const next = () => {
    if (saving) return;
    if (step < LAST_STEP) goTo(step + 1);
    else void finish();
  };

  const back = () => {
    if (saving || step === 0) return;
    goTo(step - 1);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    // Setup owns the whole window: keep the app's global shortcuts ("n" creates a project,
    // "/" focuses search) from firing behind it.
    event.stopPropagation();
    if (MODIFIERS.includes(event.key)) return;
    if (!introDone) {
      event.preventDefault();
      setIntroDone(true);
      return;
    }
    if (event.key === 'Escape') {
      // Escape steps back; there's deliberately no way to "cancel" first-run setup.
      event.preventDefault();
      back();
    } else if (event.key === 'Enter') {
      // A held Enter would otherwise race through every step.
      if (event.repeat) {
        event.preventDefault();
        return;
      }
      if (!event.metaKey && !event.ctrlKey && handlesEnter(event.target)) return;
      event.preventDefault();
      next();
    }
  };

  const isMac = typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac');

  return (
    <main
      ref={root}
      tabIndex={-1}
      aria-label="Stokebay setup"
      aria-busy={saving}
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-canvas focus:outline-none"
      onKeyDown={onKeyDown}
      onPointerDown={() => {
        if (!introDone) setIntroDone(true);
      }}
    >
      {/* Clears the traffic lights and lets the window be dragged from the top edge. */}
      <header className="drag flex h-12 shrink-0 items-center justify-center px-24">
        {step > 0 ? <StepIndicator step={step} /> : null}
      </header>

      <div className="relative min-h-0 flex-1 overflow-y-auto px-8">
        <div className="mx-auto h-full max-w-2xl">
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <motion.div
              key={step}
              custom={dir}
              variants={slide}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: reduce ? 0.1 : 0.18, ease: 'easeOut' }}
              className="h-full"
            >
              {step === 0 ? (
                <WelcomeStep introDone={introDone} reduce={reduce} onStart={() => goTo(1)} />
              ) : step === 1 ? (
                <WorldsStep
                  picks={picks}
                  onPicks={setPicks}
                  busy={saving}
                  panelStyle={panelStyle}
                />
              ) : (
                <StartStep
                  addSamples={addSamples}
                  onAddSamples={setAddSamples}
                  scan={scan}
                  onScan={setScan}
                  busy={saving}
                  panelStyle={panelStyle}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {step > 0 ? (
        <footer className="flex items-center gap-2 border-t border-line bg-sidebar px-8 py-3">
          <div className="min-w-0 flex-1">
            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : (
              <p className="text-xs text-muted">
                Enter to continue · Esc to go back
                {step === LAST_STEP ? ` · ${isMac ? '⌘' : 'Ctrl'} + Enter to finish` : ''}
              </p>
            )}
          </div>
          <Button disabled={saving} onClick={back}>
            Back
          </Button>
          <Button variant="primary" disabled={saving} onClick={next} className="min-w-24">
            {step < LAST_STEP ? 'Continue' : saving ? 'Setting up…' : 'Finish'}
          </Button>
        </footer>
      ) : null}
    </main>
  );
}
