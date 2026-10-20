// Keeps the quick capture shortcut registered with the system, matching the setting.
import type { CaptureStatus } from '../shared/types';

/** The part of Electron's globalShortcut this needs (a fake one in tests). */
export interface ShortcutRegistry {
  register(accelerator: string, callback: () => void): boolean;
  unregister(accelerator: string): void;
}

export class CaptureShortcut {
  private current: CaptureStatus = { shortcut: null, registered: false };

  constructor(
    private readonly registry: ShortcutRegistry,
    private readonly onPress: () => void,
    private readonly onFailed: (accelerator: string, reason: string) => void = () => undefined,
  ) {}

  /** Swaps the registered shortcut for `accelerator` (null turns it off). */
  apply(accelerator: string | null): CaptureStatus {
    if (accelerator === this.current.shortcut && (this.current.registered || !accelerator)) {
      return this.status();
    }
    this.release();
    if (!accelerator) {
      this.current = { shortcut: null, registered: false };
      return this.status();
    }
    let registered = false;
    try {
      // false means another app (or the system) already owns the combination.
      registered = this.registry.register(accelerator, this.onPress);
      if (!registered) this.onFailed(accelerator, 'taken by another app');
    } catch (err) {
      // Thrown for combinations the system can't parse.
      this.onFailed(accelerator, err instanceof Error ? err.message : String(err));
    }
    this.current = { shortcut: accelerator, registered };
    return this.status();
  }

  status(): CaptureStatus {
    return { ...this.current };
  }

  /** Lets go of the shortcut so other apps can have it (on quit). */
  release(): void {
    if (this.current.shortcut && this.current.registered) {
      this.registry.unregister(this.current.shortcut);
    }
    this.current = { ...this.current, registered: false };
  }
}
