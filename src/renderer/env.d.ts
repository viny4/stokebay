import type { HudApi } from '../shared/ipc';

declare global {
  interface Window {
    api: HudApi;
  }
}

export {};
