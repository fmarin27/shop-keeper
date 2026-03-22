import type { AppMode } from '../../types/app';

export function useAppMode(appMode: AppMode | null) {
  return {
    isConfigured: appMode !== null,
    appMode,
  };
}
