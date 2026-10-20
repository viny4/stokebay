// Settings: the quick capture shortcut.
import { useEffect, useState } from 'react';
import type { CaptureStatus } from '../../../shared/types';
import { acceleratorFromValue, shortcutLabel, shortcutOptions } from '../../capture/shortcuts';
import { errorMessage, useHud } from '../../store/useHud';
import { SectionHeading } from './GeneralSettings';

const isMac = typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac');

export function CaptureSettings() {
  const shortcut = useHud((s) => s.settings.captureShortcut);
  const [status, setStatus] = useState<CaptureStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.api
      .captureStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  const change = async (value: string) => {
    setBusy(true);
    setError(null);
    try {
      const settings = await window.api.updateSettings({
        captureShortcut: acceleratorFromValue(value),
      });
      useHud.setState({ settings });
      // Main has re-registered by now; ask whether the system let it.
      setStatus(await window.api.captureStatus());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const label = shortcutLabel(shortcut, isMac);
  // Only trust the status when it's about the shortcut shown.
  const taken = Boolean(shortcut && status && status.shortcut === shortcut && !status.registered);

  return (
    <section aria-labelledby="settings-capture" className="flex flex-col gap-3">
      <SectionHeading id="settings-capture">Quick capture</SectionHeading>
      <p className="-mt-2 text-sm leading-relaxed text-muted">
        Press a shortcut in any app, type a thought and press Enter: it&apos;s saved as a note on
        the project you pick.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="capture-shortcut" className="text-[13px] text-ink">
          Shortcut
        </label>
        <select
          id="capture-shortcut"
          value={shortcut ?? ''}
          disabled={busy}
          onChange={(e) => void change(e.target.value)}
          aria-describedby="capture-shortcut-status"
          className="h-8 rounded-md border border-line bg-surface px-2.5 text-[13px] text-ink focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/15 disabled:opacity-60"
        >
          {shortcutOptions(shortcut, isMac).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div id="capture-shortcut-status">
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : taken ? (
          <p role="alert" className="text-sm text-danger">
            {label} is already used by another app{isMac ? ' or by macOS' : ''}, so it doesn&apos;t
            open quick capture. Pick another shortcut.
          </p>
        ) : shortcut ? (
          <p className="text-xs text-muted">Press {label} anywhere to capture a thought.</p>
        ) : (
          <p className="text-xs text-muted">Quick capture is off.</p>
        )}
      </div>
    </section>
  );
}
