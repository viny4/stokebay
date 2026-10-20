// Shared building blocks so every feature looks and behaves the same.
import { motion } from 'framer-motion';
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { ProjectStatus, World } from '../../shared/types';

export const STATUS_COLOR: Record<ProjectStatus, string> = {
  active: 'var(--active)',
  paused: 'var(--paused)',
  done: 'var(--done)',
  idea: 'var(--idea)',
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
  primary: 'border-transparent bg-accent text-accent-ink hover:brightness-110 active:brightness-95',
  ghost: 'border-line bg-surface text-ink shadow-card hover:bg-sunken',
  danger: 'border-danger/30 bg-surface text-danger hover:bg-danger/10',
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
      className={`inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-3 text-[13px] font-medium transition-[background-color,filter] disabled:cursor-not-allowed disabled:opacity-45 ${BUTTON_STYLES[variant]} ${className}`}
      {...props}
    />
  );
}

/** Classes for text inputs and textareas. */
export const inputClass =
  'w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/80 focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/15';

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
      <label htmlFor={id} className="text-[13px] font-medium text-ink">
        {label}
      </label>
      {children(id)}
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function StatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      <span
        aria-hidden
        className="inline-block h-2 w-2 rounded-full"
        style={{ background: STATUS_COLOR[status] }}
      />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function WorldTag({ world }: { world: World }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-sunken px-2 py-0.5 text-xs text-muted">
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6"
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
        className={`w-full ${width} overflow-hidden rounded-xl border border-line bg-raised shadow-pop`}
        initial={{ opacity: 0, scale: 0.98, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 6 }}
        transition={{ duration: 0.14 }}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 id={titleId} className="text-[15px] font-semibold text-ink">
            {title}
          </h2>
          <button
            type="button"
            data-dialog-close
            aria-label="Close"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-lg leading-none text-muted hover:bg-hover hover:text-ink"
          >
            ×
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex justify-end gap-2 border-t border-line bg-sunken/60 px-5 py-3">
            {footer}
          </div>
        ) : null}
      </motion.div>
    </motion.div>
  );
}
