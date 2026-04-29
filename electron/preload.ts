import { contextBridge, ipcRenderer } from 'electron';

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

contextBridge.exposeInMainWorld('appBridge', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setAppMode: (mode: 'manager' | 'tech') => ipcRenderer.invoke('settings:setAppMode', mode),
  setDisplayMode: (mode: 'normal' | 'compact' | 'overlay') =>
    ipcRenderer.invoke('settings:setDisplayMode', mode),
  setOverlayBounds: (bounds: { width: number; height: number; x: number | null; y: number | null }) =>
    ipcRenderer.invoke('settings:setOverlayBounds', bounds),
  unlockMaterialsManager: (accessCode: string) =>
    ipcRenderer.invoke('settings:unlockMaterialsManager', accessCode),
  getMaterialsManagerAccess: () => ipcRenderer.invoke('settings:getMaterialsManagerAccess'),
  getMaterialsManagerSnapshot: () => ipcRenderer.invoke('materialsManager:getSnapshot'),
  switchToNormalWindow: () => ipcRenderer.invoke('window:switchToNormal'),
  checkForUpdates: () => ipcRenderer.invoke('updater:checkNow'),
  getUpdaterStatus: () => ipcRenderer.invoke('updater:getStatus'),
  installUpdate: () => ipcRenderer.invoke('updater:installNow'),
  sendMaterialRequestEmail: (payload: {
    materialId: string;
    itemName: string;
    quantity: string;
    note?: string;
    requestedBy: 'manager' | 'tech';
  }) => ipcRenderer.invoke('mail:sendMaterialRequestEmail', payload),
  getMitchellJobsSnapshot: () => ipcRenderer.invoke('mitchell:getJobsSnapshot'),
  saveJobPhotoToRoFolder: (payload: {
    roNumber: string;
    customerName: string;
    done?: boolean;
    bytes: number[];
  }) => ipcRenderer.invoke('jobs:savePhotoToRoFolder', payload),
  saveJobAudioToRoFolder: (payload: {
    roNumber: string;
    customerName: string;
    done?: boolean;
    bytes: number[];
    extension: string;
  }) => ipcRenderer.invoke('jobs:saveAudioToRoFolder', payload),
  saveJobTextNoteToRoFolder: (payload: {
    roNumber: string;
    customerName: string;
    done?: boolean;
    text: string;
    createdAt?: string;
  }) => ipcRenderer.invoke('jobs:saveTextNoteToRoFolder', payload),
  moveRoFolderForJob: (payload: {
    roNumber: string;
    customerName: string;
    done: boolean;
  }) => ipcRenderer.invoke('jobs:moveRoFolderForJob', payload),
  ensureRoFolderForJob: (payload: {
    roNumber: string;
    customerName: string;
    done?: boolean;
  }) => ipcRenderer.invoke('jobs:ensureRoFolderForJob', payload),
  saveJobRecordToRoFolder: (payload: {
    job: {
      id: string;
      vehicle: string;
      roNumber: string;
      customerName: string;
      paintCode: string;
      amount: number;
      amountStatus: string;
      status: string;
      done: boolean;
      promiseDate: string;
      partsWaiting: boolean;
      partsRequests: any[];
      textNotes: any[];
      photos: any[];
      sortOrder?: number;
    };
  }) => ipcRenderer.invoke('jobs:saveJobRecordToRoFolder', payload),
  onUpdaterStatus: (listener: (status: UpdaterStatus) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: UpdaterStatus) => {
      listener(status);
    };

    ipcRenderer.on('updater:status', handler);

    return () => {
      ipcRenderer.removeListener('updater:status', handler);
    };
  },
  getAppInfo: () => ipcRenderer.invoke('app:getInfo'),
  launchMaterialsManager: () => ipcRenderer.invoke('materialsManager:launch'),
});
