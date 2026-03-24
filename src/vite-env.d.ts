/// <reference types="vite/client" />

import type { AppMode, DisplayMode, LocalAppSettings } from './types/app';

declare global {
  type AppInfo = {
    name: string;
    version: string;
    owner: string;
  };

  type UpdateCheckResult = {
    ok: boolean;
    message?: string;
    updateInfo?: {
      version: string;
    } | null;
  };

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
      checkForUpdates: () => Promise<UpdateCheckResult>;
      getAppInfo: () => Promise<AppInfo>;
    };
  }
}

export {};
