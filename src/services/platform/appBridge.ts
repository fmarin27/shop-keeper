import { Capacitor } from '@capacitor/core';
import type {
  AppMode,
  DisplayMode,
  EmsImportCandidate,
  EmsImportCandidateConversionResult,
  EmsImportCandidatesSnapshot,
  EmsImportSelectionResult,
  Job,
  LocalAppSettings,
  MaterialsManagerSnapshot,
  MitchellJobsSnapshot,
} from '../../types/app';

const WEB_SETTINGS_KEY = 'shop-keeper:web-settings';
const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.shopkeeper.app';
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
  materialsManagerUnlocked: false,
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
  unlockMaterialsManager: (accessCode: string) => Promise<{
    ok: boolean;
    message: string;
    settings: LocalAppSettings;
  }>;
  getMaterialsManagerAccess: () => Promise<{
    unlocked: boolean;
  }>;
  getMaterialsManagerSnapshot: () => Promise<MaterialsManagerSnapshot>;
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
  getMitchellJobsSnapshot: () => Promise<MitchellJobsSnapshot>;
  selectEmsRepairOrder: () => Promise<EmsImportSelectionResult>;
  listEmsImportCandidates: () => Promise<EmsImportCandidatesSnapshot>;
  convertEmsImportCandidate: (
    candidate: EmsImportCandidate,
  ) => Promise<EmsImportCandidateConversionResult>;
  saveJobPhotoToRoFolder: (payload: {
    roNumber: string;
    customerName: string;
    done?: boolean;
    bytes: number[];
  }) => Promise<{ savedPath: string }>;
  saveJobAudioToRoFolder: (payload: {
    roNumber: string;
    customerName: string;
    done?: boolean;
    bytes: number[];
    extension: string;
  }) => Promise<{ savedPath: string }>;
  saveJobTextNoteToRoFolder: (payload: {
    roNumber: string;
    customerName: string;
    done?: boolean;
    text: string;
    createdAt?: string;
  }) => Promise<{ savedPath: string }>;
  moveRoFolderForJob: (payload: {
    roNumber: string;
    customerName: string;
    done: boolean;
  }) => Promise<{ folderPath: string }>;
  ensureRoFolderForJob: (payload: {
    roNumber: string;
    customerName: string;
    done?: boolean;
  }) => Promise<{ folderPath: string }>;
  saveJobRecordToRoFolder: (payload: {
    job: Job;
  }) => Promise<{
    folderPath: string;
    summaryPath: string;
  }>;
  onUpdaterStatus: (listener: (status: UpdaterStatus) => void) => () => void;
  getAppInfo: () => Promise<AppInfo>;
  launchMaterialsManager: () => Promise<{
    ok: boolean;
    message: string;
  }>;
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
  try {
    return Capacitor.getPlatform();
  } catch (error) {
    console.warn('Falling back to web platform detection:', error);
    return 'web';
  }
}

function isNativePlatform() {
  try {
    return Capacitor.isNativePlatform();
  } catch (error) {
    console.warn('Falling back to browser runtime detection:', error);
    return false;
  }
}

function isMobilePlatform() {
  const platform = getPlatform();
  if (platform === 'android' || platform === 'ios') {
    return true;
  }

  if (isNativePlatform()) {
    return true;
  }

  if (typeof navigator === 'undefined') {
    return false;
  }

  return /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}

function getMobileStoreUrl() {
  return getPlatform() === 'android' ? PLAY_STORE_URL : null;
}

function getMobileUpdateMessage() {
  return getPlatform() === 'android'
    ? `Mobile build ${APP_VERSION}. Updates are available through Google Play.`
    : `Mobile build ${APP_VERSION}.`;
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

  async unlockMaterialsManager(accessCode: string) {
    const desktopBridge = getDesktopBridge();
    if (desktopBridge) {
      return desktopBridge.unlockMaterialsManager(accessCode);
    }

    const trimmed = accessCode.trim();
    const settings = updateWebSettings((current) => ({
      ...current,
      materialsManagerUnlocked: trimmed === 'UAB-MATERIALS-PRO',
    }));

    return {
      ok: settings.materialsManagerUnlocked,
      message: settings.materialsManagerUnlocked
        ? 'Materials Manager unlocked on this device.'
        : 'That access code did not work.',
      settings,
    };
  },

  async getMaterialsManagerAccess() {
    const desktopBridge = getDesktopBridge();
    if (desktopBridge) {
      return desktopBridge.getMaterialsManagerAccess();
    }

    return {
      unlocked: readWebSettings().materialsManagerUnlocked,
    };
  },

  async getMaterialsManagerSnapshot() {
    const desktopBridge = getDesktopBridge();
    if (desktopBridge) {
      return desktopBridge.getMaterialsManagerSnapshot();
    }

    throw new Error('Materials Manager data is only available in the desktop app.');
  },

  async checkForUpdates() {
    const desktopBridge = getDesktopBridge();
    if (desktopBridge) {
      return desktopBridge.checkForUpdates();
    }

    if (isMobilePlatform()) {
      try {
        const storeUrl = getMobileStoreUrl();
        if (storeUrl) {
          openExternalUrl(storeUrl);

          return {
            ok: true,
            message: 'Opening Google Play to check for updates...',
            updateInfo: {
              version: APP_VERSION,
              url: storeUrl,
            },
            status: {
              phase: 'idle',
              message: getMobileUpdateMessage(),
            },
          };
        }

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
        message: getMobileUpdateMessage(),
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
        const storeUrl = getMobileStoreUrl();
        if (storeUrl) {
          openExternalUrl(storeUrl);

          return {
            ok: true,
            message: 'Opening Google Play...',
          };
        }

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

  async getMitchellJobsSnapshot() {
    const desktopBridge = getDesktopBridge();
    if (desktopBridge) {
      return desktopBridge.getMitchellJobsSnapshot();
    }

    throw new Error('Mitchell job sync is only available in the desktop app.');
  },

  async selectEmsRepairOrder() {
    const desktopBridge = getDesktopBridge();
    if (desktopBridge) {
      return desktopBridge.selectEmsRepairOrder();
    }

    throw new Error('EMS import is only available in the desktop app.');
  },

  async listEmsImportCandidates() {
    const desktopBridge = getDesktopBridge();
    if (desktopBridge) {
      return desktopBridge.listEmsImportCandidates();
    }

    throw new Error('EMS watch is only available in the desktop app.');
  },

  async convertEmsImportCandidate(candidate: EmsImportCandidate) {
    const desktopBridge = getDesktopBridge();
    if (desktopBridge) {
      return desktopBridge.convertEmsImportCandidate(candidate);
    }

    throw new Error('EMS import is only available in the desktop app.');
  },

  async saveJobPhotoToRoFolder(payload: {
    roNumber: string;
    customerName: string;
    done?: boolean;
    bytes: number[];
  }) {
    const desktopBridge = getDesktopBridge();
    if (desktopBridge) {
      return desktopBridge.saveJobPhotoToRoFolder(payload);
    }

    throw new Error('Saving job photos into RO folders is only available in the desktop app.');
  },

  async saveJobAudioToRoFolder(payload: {
    roNumber: string;
    customerName: string;
    done?: boolean;
    bytes: number[];
    extension: string;
  }) {
    const desktopBridge = getDesktopBridge();
    if (desktopBridge) {
      return desktopBridge.saveJobAudioToRoFolder(payload);
    }

    throw new Error('Saving job audio into RO folders is only available in the desktop app.');
  },

  async saveJobTextNoteToRoFolder(payload: {
    roNumber: string;
    customerName: string;
    done?: boolean;
    text: string;
    createdAt?: string;
  }) {
    const desktopBridge = getDesktopBridge();
    if (desktopBridge) {
      return desktopBridge.saveJobTextNoteToRoFolder(payload);
    }

    throw new Error('Saving job text notes into RO folders is only available in the desktop app.');
  },

  async moveRoFolderForJob(payload: {
    roNumber: string;
    customerName: string;
    done: boolean;
  }) {
    const desktopBridge = getDesktopBridge();
    if (desktopBridge) {
      return desktopBridge.moveRoFolderForJob(payload);
    }

    throw new Error('Moving RO folders is only available in the desktop app.');
  },

  async ensureRoFolderForJob(payload: {
    roNumber: string;
    customerName: string;
    done?: boolean;
  }) {
    const desktopBridge = getDesktopBridge();
    if (desktopBridge) {
      return desktopBridge.ensureRoFolderForJob(payload);
    }

    throw new Error('Ensuring RO folders is only available in the desktop app.');
  },

  async saveJobRecordToRoFolder(payload: { job: Job }) {
    const desktopBridge = getDesktopBridge();
    if (desktopBridge) {
      return desktopBridge.saveJobRecordToRoFolder(payload);
    }

    throw new Error('Saving job records into RO folders is only available in the desktop app.');
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
            message: getMobileUpdateMessage(),
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

  async launchMaterialsManager() {
    const desktopBridge = getDesktopBridge();
    if (desktopBridge) {
      return desktopBridge.launchMaterialsManager();
    }

    return {
      ok: false,
      message: 'Materials Manager launch is only available in the desktop app.',
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
