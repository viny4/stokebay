// Settings section for what "Pick up" opens besides the editor.
import { useState } from 'react';
import type { UpdateSettingsInput } from '../../../shared/schemas';
import { errorMessage, useHud } from '../../store/useHud';
import { SectionHeading } from './GeneralSettings';

export function PickUpSettings() {
  const pickUpTerminal = useHud((s) => s.settings.pickUpTerminal);
  const pickUpLinks = useHud((s) => s.settings.pickUpLinks);
  const [error, setError] = useState<string | null>(null);

  const save = async (changes: UpdateSettingsInput) => {
    try {
      const settings = await window.api.updateSettings(changes);
      useHud.setState({ settings });
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <section aria-labelledby="settings-pick-up" className="flex flex-col gap-3">
      <SectionHeading id="settings-pick-up">Pick up</SectionHeading>
      <p className="-mt-2 text-sm leading-relaxed text-muted">
        &ldquo;Pick up&rdquo; resumes a project and opens it in your editor. It can also open:
      </p>
      <div className="flex flex-col gap-2">
        <Checkbox
          label="Open a terminal in the project folder"
          checked={pickUpTerminal}
          onChange={(on) => void save({ pickUpTerminal: on })}
        />
        <Checkbox
          label="Open the project's 3 newest links"
          checked={pickUpLinks}
          onChange={(on) => void save({ pickUpLinks: on })}
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2.5 text-sm text-ink">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-accent"
      />
      {label}
    </label>
  );
}
