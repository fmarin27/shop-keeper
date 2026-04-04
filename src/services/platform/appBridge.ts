import type { AppMode, DisplayMode, LocalAppSettings } from '../../types/app';

const WEB_SETTINGS_KEY = 'shop-keeper:web-settings';

const DEFAULT_SETTINGS: LocalAppSettings = {
  appMode: null,
  displayMode: 'normal',
  overlayWidth: 420,
  overlayHeight: 720,
  overlayX: null,
  overlayY: null,
};

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

type UpdateInstallResult = {
  ok: boolean;
  message?: string;
};

type SendMaterialEmailResult = {
  ok: boolean;
  message?: string;
};

type AppBridge = {
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
  sendMaterialRequestEmail: (payload: {
    materialId: string;
    itemName: string;
    quantity: string;
    note?: string;
    requestedBy: AppMode;
  }) => Promise<SendMaterialEmailResult>;
  onUpdaterStatus: (listener: (status: UpdaterStatus) => void) => () => void;
  getAppInfo: () => Promise<AppInfo>;
};

const getDesktopBridge = (): AppBridge | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.appBridge ?? null;
};

const readWebSettings = (): LocalAppSettings => {
  if (typeof window === 'undefined') {
    return DEFAULT_SETTINGS;
  }

  try {
    const raw = window.localStorage.getItem(WEB_SETTINGS_KEY);
    if (!raw) {
      return DEFAULT_SETTINGS;
    }

    const parsed = JSON.parse(raw) as Partial<LocalAppSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
    };
  } catch (error) {
    console.error('Failed to read web settings:', error);
    return DEFAULT_SETTINGS;
  }
};

const writeWebSettings = (nextSettings: LocalAppSettings): LocalAppSettings => {
  if (typeof window === 'undefined') {
    return nextSettings;
  }

  try {
    window.localStorage.setItem(WEB_SETTINGS_KEY, JSON.stringify(nextSettings));
  } catch (error) {
    console.error('Failed to write web settings:', error);
  }

  return nextSettings;
};

const updateWebSettings = (
  updater: (settings: LocalAppSettings) => LocalAppSettings,
) => {
  const nextSettings = updater(readWebSettings());
  return writeWebSettings(nextSettings);
};

const unavailableStatus: UpdaterStatus = {
  phase: 'not-available',
  message: 'Updates are only available in the desktop app.',
};

export const appBridge = {
  isDesktop() {
    return getDesktopBridge() !== null;
  },

  async getSettings() {
    const desktopBridge = getDesktopBridge();
    if (desktopBridge) {
      return desktopBridge.getSettings();
    }

    return readWebSettings();
  },

  async setAppMode(mode: AppMode) {
    const desktopBridge = getDesktopBridge();
    if (desktopBridge) {
      return desktopBridge.setAppMode(mode);
    }

    return updateWebSettings((settings) => ({
      ...settings,
      appMode: mode,
    }));
  },

  async setDisplayMode(mode: DisplayMode) {
    const desktopBridge = getDesktopBridge();
    if (desktopBridge) {
      return desktopBridge.setDisplayMode(mode);
    }

    return updateWebSettings((settings) => ({
      ...settings,
      displayMode: mode,
    }));
  },

  async setOverlayBounds(bounds: {
    width: number;
    height: number;
    x: number | null;
    y: number | null;
  }) {
    const desktopBridge = getDesktopBridge();
    if (desktopBridge) {
      return desktopBridge.setOverlayBounds(bounds);
    }

    return updateWebSettings((settings) => ({
      ...settings,
      overlayWidth: bounds.width,
      overlayHeight: bounds.height,
      overlayX: bounds.x,
      overlayY: bounds.y,
    }));
  },

  async switchToNormalWindow() {
    const desktopBridge = getDesktopBridge();
    if (desktopBridge) {
      await desktopBridge.switchToNormalWindow();
      return;
    }

    updateWebSettings((settings) => ({
      ...settings,
      displayMode: 'normal',
    }));
  },

  async checkForUpdates() {
    const desktopBridge = getDesktopBridge();
    if (desktopBridge) {
      return desktopBridge.checkForUpdates();
    }

    return {
      ok: false,
      message: unavailableStatus.message,
      status: unavailableStatus,
    };
  },

  async getUpdaterStatus() {
    const desktopBridge = getDesktopBridge();
    if (desktopBridge) {
      return desktopBridge.getUpdaterStatus();
    }

    return unavailableStatus;
  },

  async installUpdate() {
    const desktopBridge = getDesktopBridge();
    if (desktopBridge) {
      return desktopBridge.installUpdate();
    }

    return {
      ok: false,
      message: unavailableStatus.message,
    };
  },

  async sendMaterialRequestEmail(payload: {
    materialId: string;
    itemName: string;
    quantity: string;
    note?: string;
    requestedBy: AppMode;
  }) {
    const desktopBridge = getDesktopBridge();
    if (desktopBridge) {
      return desktopBridge.sendMaterialRequestEmail(payload);
    }

    return {
      ok: false,
      message: 'Automatic material emails are only available in the desktop app right now.',
    };
  },

  onUpdaterStatus(listener: (status: UpdaterStatus) => void) {
    const desktopBridge = getDesktopBridge();
    if (desktopBridge) {
      return desktopBridge.onUpdaterStatus(listener);
    }

    listener(unavailableStatus);
    return () => undefined;
  },

  async getAppInfo() {
    const desktopBridge = getDesktopBridge();
    if (desktopBridge) {
      return desktopBridge.getAppInfo();
    }

    return {
      name: 'Shop Keeper Web',
      version: 'web-preview',
      owner: 'Fernando Marin',
    };
  },

  closeWindow() {
    if (typeof window === 'undefined') {
      return;
    }

    if (getDesktopBridge()) {
      window.close();
    }
  },
};
