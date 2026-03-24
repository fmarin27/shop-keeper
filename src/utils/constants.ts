import type { LocalAppSettings } from '../types/app';

export const APP_TITLE = 'Shop Floor';
export const MANAGER_MODE_PASSWORD = '1981';

export const TAB_LABELS = {
  jobs: 'Jobs',
  materialsMessages: 'Materials & Messages',
} as const;

export const MODE_LABELS = {
  manager: 'Manager',
  tech: 'Tech',
} as const;

export const DISPLAY_MODE_LABELS = {
  normal: 'Normal',
  compact: 'Compact',
  overlay: 'Overlay',
} as const;

export const DEFAULT_SETTINGS: LocalAppSettings = {
  appMode: null,
  displayMode: 'normal',
  overlayWidth: 420,
  overlayHeight: 260,
  overlayX: null,
  overlayY: null,
};
