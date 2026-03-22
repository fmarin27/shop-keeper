import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('appBridge', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setAppMode: (mode: 'manager' | 'tech') => ipcRenderer.invoke('settings:setAppMode', mode),
  setDisplayMode: (mode: 'normal' | 'compact' | 'overlay') =>
    ipcRenderer.invoke('settings:setDisplayMode', mode),
  setOverlayBounds: (bounds: { width: number; height: number; x: number | null; y: number | null }) =>
    ipcRenderer.invoke('settings:setOverlayBounds', bounds),
  switchToNormalWindow: () => ipcRenderer.invoke('window:switchToNormal'),
});
