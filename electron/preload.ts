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
});
