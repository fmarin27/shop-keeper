/// <reference types="vite/client" />

import type {
  AppMode,
  DisplayMode,
  EmsImportCandidate,
  EmsImportCandidateConversionResult,
  EmsImportCandidatesSnapshot,
  Job,
  EmsImportSelectionResult,
  LocalAppSettings,
  MaterialsManagerSnapshot,
  MitchellJobsSnapshot,
} from './types/app';

declare global {
  const __APP_VERSION__: string;

  interface AppBridge {
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
  }

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
        phase: 'installing';
        version?: string;
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

  type SendMaterialEmailResult = {
    ok: boolean;
    message?: string;
  };

  interface Window {
    appBridge?: AppBridge;
  }
}

export {};
