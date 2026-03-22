/// <reference types="vite/client" />

import type { AppMode, DisplayMode, LocalAppSettings } from './types/app';

declare global {
  interface Window {
    appBridge: {
      getSettings: () => Promise<LocalAppSettings>;
      setAppMode: (mode: AppMode) => Promise<LocalAppSettings>;
      setDisplayMode: (mode: DisplayMode) => Promise<LocalAppSettings>;
      setOverlayBounds: (bounds: {
        width: number;
        height: number;
        x: number | null;
        y: number | null;
      }) => Promise<LocalAppSettings>;
      switchToNormalWindow: () => Promise<void>;
    };
  }
}

export {};
