import type { AppMode, DisplayMode, LocalAppSettings } from '../../types/app';

const WEB_SETTINGS_KEY = 'shop-keeper:web-settings';
const MOBILE_RELEASE_API =
  'https://api.github.com/repos/fmarin27/shop-keeper/releases/latest';
const MOBILE_RELEASE_PAGE = 'https://github.com/fmarin27/shop-keeper/releases/latest';
const APP_VERSION = __APP_VERSION__;

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
    url?: string;
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

type MobileReleaseInfo = {
  version: string;
  url: string;
};

let cachedMobileReleaseInfo: MobileReleaseInfo | null = null;

function getPlatform() {
  return Capacitor.getPlatform();
}

function isMobilePlatform() {
  const platform = getPlatform();
  return platform === 'android' || platform === 'ios';
}

function normalizeVersion(version: string) {
  return version.trim().replace(/^v/i, '');
}

function compareVersions(left: string, right: string) {
  const leftParts = normalizeVersion(left).split('.').map((part) => Number(part) || 0);
  const rightParts = normalizeVersion(right).split('.').map((part) => Number(part) || 0);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const a = leftParts[index] ?? 0;
    const b = rightParts[index] ?? 0;

    if (a > b) return 1;
    if (a < b) return -1;
  }

  return 0;
}

async function fetchLatestMobileRelease(): Promise<MobileReleaseInfo> {
  const response = await fetch(MOBILE_RELEASE_API, {
    headers: {
      Accept: 'application/vnd.github+json',
    },
  });

  if (!response.ok) {
    throw new Error('Could not reach the latest mobile release.');
  }

  const data = (await response.json()) as {
    tag_name?: string;
    html_url?: string;
    assets?: Array<{ browser_download_url?: string; name?: string }>;
  };

  const version = normalizeVersion(data.tag_name ?? '');
  const apkAsset = data.assets?.find((asset) =>
    (asset.name ?? '').toLowerCase().endsWith('.apk'),
  );

  return {
    version: version || APP_VERSION,
    url: apkAsset?.browser_download_url ?? data.html_url ?? MOBILE_RELEASE_PAGE,
  };
}

function openExternalUrl(url: string) {
  if (typeof window === 'undefined') {
    return;
  }

  const openedWindow = window.open(url, '_blank', 'noopener,noreferrer');
  if (!openedWindow) {
    window.location.assign(url);
  }
}

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

    if (isMobilePlatform()) {
      try {
        const latestRelease = await fetchLatestMobileRelease();
        cachedMobileReleaseInfo = latestRelease;
        const hasUpdate = compareVersions(latestRelease.version, APP_VERSION) > 0;

        if (!hasUpdate) {
          return {
            ok: true,
            message: `You're on the latest mobile build (${APP_VERSION}).`,
            updateInfo: {
              version: APP_VERSION,
            },
            status: {
              phase: 'not-available',
              version: APP_VERSION,
              message: `You're on the latest mobile build (${APP_VERSION}).`,
            },
          };
        }

        return {
          ok: true,
          message: `Update ${latestRelease.version} is ready. Tap to download.`,
          updateInfo: latestRelease,
          status: {
            phase: 'available',
            version: latestRelease.version,
            message: `Update ${latestRelease.version} is ready. Tap to download.`,
          },
        };
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Could not check for the latest mobile release.';

        return {
          ok: false,
          message,
          status: {
            phase: 'error',
            message,
          },
        };
      }
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

    if (isMobilePlatform()) {
      return {
        phase: 'idle',
        message: `Mobile build ${APP_VERSION}`,
      } satisfies UpdaterStatus;
    }

    return unavailableStatus;
  },

  async installUpdate() {
    const desktopBridge = getDesktopBridge();
    if (desktopBridge) {
      return desktopBridge.installUpdate();
    }

    if (isMobilePlatform()) {
      try {
        if (!cachedMobileReleaseInfo) {
          cachedMobileReleaseInfo = await fetchLatestMobileRelease();
        }

        openExternalUrl(cachedMobileReleaseInfo.url);

        return {
          ok: true,
          message: `Opening ${cachedMobileReleaseInfo.version} download...`,
        };
      } catch (error) {
        return {
          ok: false,
          message:
            error instanceof Error
              ? error.message
              : 'Could not open the latest mobile release.',
        };
      }
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

    listener(
      isMobilePlatform()
        ? {
            phase: 'idle',
            message: `Mobile build ${APP_VERSION}`,
          }
        : unavailableStatus,
    );
    return () => undefined;
  },

  async getAppInfo() {
    const desktopBridge = getDesktopBridge();
    if (desktopBridge) {
      return desktopBridge.getAppInfo();
    }

    return {
      name: isMobilePlatform() ? 'Shop Keeper Mobile' : 'Shop Keeper Web',
      version: APP_VERSION,
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
