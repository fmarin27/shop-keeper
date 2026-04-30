import type { LocalAppSettings } from '../types/app';

export const APP_TITLE = 'Shop Floor';
export const MANAGER_MODE_PASSWORD = '1981';

export const TAB_LABELS = {
  commandCenter: 'RO Command Center',
  jobs: 'Jobs',
  parts: 'Parts/Sublet',
  materials: 'Materials',
  messages: 'Messages',
  leads: 'Leads',
  materialsManager: 'Materials Manager',
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
  materialsManagerUnlocked: true,
};
