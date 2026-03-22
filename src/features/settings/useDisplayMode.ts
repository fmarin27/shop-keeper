import type { DisplayMode } from '../../types/app';

export function useDisplayMode(displayMode: DisplayMode) {
  return {
    displayMode,
    isOverlay: displayMode === 'overlay',
    isCompact: displayMode === 'compact',
    isNormal: displayMode === 'normal',
  };
}
