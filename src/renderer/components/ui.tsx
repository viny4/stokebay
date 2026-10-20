// Shared building blocks so every feature looks and behaves the same.
import { motion } from 'framer-motion';
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { ProjectStatus, World } from '../../shared/types';

export const STATUS_COLOR: Record<ProjectStatus, string> = {
  active: 'var(--color-status-active)',
  paused: 'var(--color-status-paused)',
  done: 'var(--color-status-done)',
  idea: 'var(--color-status-idea)',
};

/** Same colours as hex, for effects that need alpha (glow filters) and can be animated. */
export const STATUS_HEX: Record<ProjectStatus, string> = {
  active: '#38d6ff',
  paused: '#fbbf24',
  done: '#34d399',
  idea: '#a78bfa',
};

/** `#rrggbb` plus an alpha 0–1 → `#rrggbbaa`. */
export function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
  return `${hex}${a.toString(16).padStart(2, '0')}`;
}

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  active: 'Active',
  paused: 'Paused',
  done: 'Done',
  idea: 'Idea',
};

type ButtonVariant = 'primary' | 'ghost' | 'danger';

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary:
    'border-status-active/60 bg-status-active/15 text-status-active hover:bg-status-active/25',
  ghost: 'border-hud-line bg-white/[0.03] text-hud-text hover:bg-white/[0.08]',
  danger: 'border-red-400/50 bg-red-500/10 text-red-300 hover:bg-red-500/20',
};

export function Button({
  variant = 'ghost',
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type={type}
      className={`inline-flex items-center gap-2 whitespace-nowrap rounded-md border px-3.5 py-1.5 font-hud text-[13px] tracking-wider uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${BUTTON_STYLES[variant]} ${className}`}
      {...props}
    />
  );
}

/** Classes for text inputs and textareas. */
export const inputClass =
  'w-full rounded-md border border-hud-line bg-black/30 px-3 py-2 text-sm text-hud-text placeholder:text-hud-muted/70 focus:border-status-active/60 focus:outline-none';

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-hud text-xs uppercase tracking-widest text-hud-muted">
        {label}
      </label>
      {children(id)}
      {error ? (
        <p role="alert" className="text-xs text-red-300">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-hud-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function StatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 font-hud text-xs uppercase tracking-wider"
      style={{ color: STATUS_COLOR[status] }}
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: STATUS_COLOR[status] }}
      />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function WorldTag({ world }: { world: World }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-hud-line px-2 py-0.5 text-xs text-hud-muted">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: world.color }} />
      {world.name}
    </span>
  );
}

/**
 * Modal dialog: dims the app, traps Tab inside, closes on Escape or backdrop click, and
 * returns focus to whatever was focused before it opened.
 */
export function Dialog({
  title,
  onClose,
  children,
  footer,
  width = 'max-w-lg',
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = panel.current?.querySelector<HTMLElement>(
      'input, textarea, select, button:not([data-dialog-close])',
    );
    first?.focus();
    return () => previous?.focus();
  }, []);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !panel.current) return;
    const focusable = [
      ...panel.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ),
    ];
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={onKeyDown}
    >
      <motion.div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`hud-frame w-full ${width} drop-shadow-[0_0_24px_rgb(56_189_248/0.35)]`}
        style={
          {
            '--frame-color': 'rgb(56 189 248 / 0.55)',
            '--frame-fill': 'var(--color-hud-raised)',
          } as React.CSSProperties
        }
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.16 }}
      >
        <div className="flex items-center justify-between border-b border-hud-line px-5 py-3">
          <h2
            id={titleId}
            className="font-display text-sm tracking-[0.2em] text-status-active uppercase"
          >
            {title}
          </h2>
          <button
            type="button"
            data-dialog-close
            aria-label="Close"
            onClick={onClose}
            className="rounded px-2 text-lg leading-none text-hud-muted hover:text-hud-text"
          >
            ×
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex justify-end gap-2 border-t border-hud-line px-5 py-3">{footer}</div>
        ) : null}
      </motion.div>
    </motion.div>
  );
}
