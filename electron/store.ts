import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

type AppMode = 'manager' | 'tech';
type DisplayMode = 'normal' | 'compact' | 'overlay';

export interface LocalAppSettings {
  appMode: AppMode | null;
  displayMode: DisplayMode;
  overlayWidth: number;
  overlayHeight: number;
  overlayX: number | null;
  overlayY: number | null;
  materialsManagerUnlocked: boolean;
}

const DEFAULT_SETTINGS: LocalAppSettings = {
  appMode: null,
  displayMode: 'normal',
  overlayWidth: 420,
  overlayHeight: 260,
  overlayX: null,
  overlayY: null,
  materialsManagerUnlocked: true,
};

export class SettingsStore {
  private readonly filePath: string;

  constructor() {
    this.filePath = path.join(app.getPath('userData'), 'local-settings.json');
  }

  getSettings(): LocalAppSettings {
    if (!fs.existsSync(this.filePath)) {
      return DEFAULT_SETTINGS;
    }

    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<LocalAppSettings>;
      return { ...DEFAULT_SETTINGS, ...parsed };
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  saveSettings(nextSettings: Partial<LocalAppSettings>): LocalAppSettings {
    const merged = { ...this.getSettings(), ...nextSettings };
    fs.writeFileSync(this.filePath, JSON.stringify(merged, null, 2), 'utf8');
    return merged;
  }

  setAppMode(appMode: AppMode): LocalAppSettings {
    return this.saveSettings({ appMode });
  }

  setDisplayMode(displayMode: DisplayMode): LocalAppSettings {
    return this.saveSettings({ displayMode });
  }

  setOverlayBounds(bounds: {
    width: number;
    height: number;
    x: number | null;
    y: number | null;
  }): LocalAppSettings {
    return this.saveSettings({
      overlayWidth: bounds.width,
      overlayHeight: bounds.height,
      overlayX: bounds.x,
      overlayY: bounds.y,
    });
  }

  setMaterialsManagerUnlocked(unlocked: boolean): LocalAppSettings {
    return this.saveSettings({ materialsManagerUnlocked: unlocked });
  }
}
