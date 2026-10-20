// Settings section for "going cold": how long an active project may sit untouched before it
// pauses itself.
import { guard, useHud } from '../../store/useHud';
import { SectionHeading } from './GeneralSettings';

const CHOICES = [0, 14, 30, 60, 90];

function choiceLabel(days: number): string {
  return days === 0 ? 'Off' : `After ${days} days`;
}

export function TrackingSettings() {
  const autoPauseDays = useHud((s) => s.settings.autoPauseDays);
  // A value set some other way (an older file, a restore) still shows as itself.
  const choices = CHOICES.includes(autoPauseDays)
    ? CHOICES
    : [...CHOICES, autoPauseDays].sort((a, b) => a - b);

  const save = (days: number) =>
    guard(async () => {
      const settings = await window.api.updateSettings({ autoPauseDays: days });
      useHud.setState({ settings });
    });

  return (
    <section aria-labelledby="settings-tracking" className="flex flex-col gap-3">
      <SectionHeading id="settings-tracking">Going cold</SectionHeading>
      <p className="-mt-2 text-sm leading-relaxed text-muted">
        Active projects you haven&apos;t touched in this long are paused, so the list shows what
        you&apos;re really working on. Nothing is deleted.
      </p>
      <div>
        <label htmlFor="auto-pause-days" className="sr-only">
          Pause untouched projects
        </label>
        <select
          id="auto-pause-days"
          value={autoPauseDays}
          onChange={(e) => save(Number(e.target.value))}
          className="h-8 rounded-md border border-line bg-surface px-2.5 text-[13px] text-ink focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/15"
        >
          {choices.map((days) => (
            <option key={days} value={days}>
              {choiceLabel(days)}
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}
