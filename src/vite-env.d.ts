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
    status?: UpdaterStatus;
  };

  type UpdaterStatus =
    | {
        phase: 'idle';
        message?: string;
      }
    | {
        phase: 'checking';
        message: string;
      }
    | {
        phase: 'available';
        version: string;
        message: string;
      }
    | {
        phase: 'downloading';
        version?: string;
        progressPercent: number;
        message: string;
      }
    | {
        phase: 'downloaded';
        version: string;
        message: string;
      }
    | {
        phase: 'not-available';
        version?: string;
        message: string;
      }
    | {
        phase: 'error';
        message: string;
      };

  type UpdateInstallResult = {
    ok: boolean;
    message?: string;
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
      getUpdaterStatus: () => Promise<UpdaterStatus>;
      installUpdate: () => Promise<UpdateInstallResult>;
      onUpdaterStatus: (listener: (status: UpdaterStatus) => void) => () => void;
      getAppInfo: () => Promise<AppInfo>;
    };
  }
}

export {};
