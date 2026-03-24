import path from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, session } from 'electron';
import { autoUpdater } from 'electron-updater';
import { SettingsStore } from './store';

const isDev = !!process.env.VITE_DEV_SERVER_URL;
const settingsStore = new SettingsStore();
let mainWindow: BrowserWindow | null = null;
let updateCheckStarted = false;

function getHtmlPath() {
  return path.join(app.getAppPath(), 'dist', 'index.html');
}

function getWindowOptions(): Electron.BrowserWindowConstructorOptions {
  const settings = settingsStore.getSettings();
  const isCompact = settings.displayMode === 'compact';
  const isOverlay = settings.displayMode === 'overlay';

  return {
    width: isOverlay ? settings.overlayWidth : isCompact ? 900 : 1400,
    height: isOverlay ? settings.overlayHeight : isCompact ? 560 : 900,
    x: isOverlay && settings.overlayX !== null ? settings.overlayX : undefined,
    y: isOverlay && settings.overlayY !== null ? settings.overlayY : undefined,
    minWidth: 700,
    minHeight: 500,
    autoHideMenuBar: true,
    title: 'Shop Keeper',
    alwaysOnTop: isOverlay,
    frame: true,
    transparent: false,
    backgroundColor: '#020617',
    hasShadow: true,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  };
}

function applyDisplayMode(window: BrowserWindow) {
  const settings = settingsStore.getSettings();
  const isCompact = settings.displayMode === 'compact';
  const isOverlay = settings.displayMode === 'overlay';

  if (isOverlay) {
    window.setAlwaysOnTop(true, 'screen-saver');
    window.setResizable(true);
    window.setMinimumSize(360, 220);
    window.setSize(settings.overlayWidth, settings.overlayHeight);
    window.setOpacity(0.88);

    if (settings.overlayX !== null && settings.overlayY !== null) {
      window.setPosition(settings.overlayX, settings.overlayY);
    }
  } else if (isCompact) {
    window.setAlwaysOnTop(false);
    window.setResizable(true);
    window.setMinimumSize(700, 500);
    window.setSize(900, 560);
    window.setOpacity(1);
    window.center();
  } else {
    window.setAlwaysOnTop(false);
    window.setResizable(true);
    window.setMinimumSize(900, 600);
    window.setSize(1400, 900);
    window.setOpacity(1);
    window.center();
  }

  window.show();
  window.focus();
}

function setupAutoUpdates() {
  if (isDev || updateCheckStarted) {
    return;
  }

  updateCheckStarted = true;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    console.log('[updater] Checking for update...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[updater] Update available:', info.version);
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('[updater] No update available. Current/latest:', info.version);
  });

  autoUpdater.on('download-progress', (progress) => {
    console.log(
      `[updater] Downloading ${Math.round(progress.percent)}% (${progress.transferred}/${progress.total})`,
    );
  });

  autoUpdater.on('update-downloaded', async (info) => {
    console.log('[updater] Update downloaded:', info.version);

    const targetWindow = mainWindow ?? BrowserWindow.getFocusedWindow();

    const result = targetWindow
      ? await dialog.showMessageBox(targetWindow, {
          type: 'info',
          buttons: ['Restart now', 'Later'],
          defaultId: 0,
          cancelId: 1,
          title: 'Update ready',
          message: 'A new version of Shop Keeper has been downloaded.',
          detail: 'Restart the app to install the update.',
          noLink: true,
        })
      : await dialog.showMessageBox({
          type: 'info',
          buttons: ['Restart now', 'Later'],
          defaultId: 0,
          cancelId: 1,
          title: 'Update ready',
          message: 'A new version of Shop Keeper has been downloaded.',
          detail: 'Restart the app to install the update.',
          noLink: true,
        });

    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });

  autoUpdater.on('error', (error) => {
    console.error('[updater] Auto update error:', error);
  });

  void autoUpdater.checkForUpdatesAndNotify();

  setInterval(() => {
    void autoUpdater.checkForUpdatesAndNotify();
  }, 1000 * 60 * 60 * 4);
}

async function createWindow() {
  mainWindow = new BrowserWindow(getWindowOptions());

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    await mainWindow.loadFile(getHtmlPath());
  }

  applyDisplayMode(mainWindow);

  mainWindow.on('resize', () => {
    const settings = settingsStore.getSettings();
    if (settings.displayMode !== 'overlay' || !mainWindow) return;

    const [width, height] = mainWindow.getSize();
    const [x, y] = mainWindow.getPosition();
    settingsStore.setOverlayBounds({ width, height, x, y });
  });

  mainWindow.on('move', () => {
    const settings = settingsStore.getSettings();
    if (settings.displayMode !== 'overlay' || !mainWindow) return;

    const [width, height] = mainWindow.getSize();
    const [x, y] = mainWindow.getPosition();
    settingsStore.setOverlayBounds({ width, height, x, y });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      if (permission === 'media') {
        callback(true);
        return;
      }

      callback(false);
    },
  );

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    if (permission === 'media') {
      return true;
    }

    return false;
  });

  ipcMain.handle('settings:get', () => settingsStore.getSettings());

  ipcMain.handle('settings:setAppMode', (_event, mode: 'manager' | 'tech') =>
    settingsStore.setAppMode(mode),
  );

  ipcMain.handle(
    'settings:setDisplayMode',
    (_event, mode: 'normal' | 'compact' | 'overlay') => {
      const nextSettings = settingsStore.setDisplayMode(mode);

      if (mainWindow) {
        applyDisplayMode(mainWindow);
      }

      return nextSettings;
    },
  );

  ipcMain.handle(
    'settings:setOverlayBounds',
    (
      _event,
      bounds: {
        width: number;
        height: number;
        x: number | null;
        y: number | null;
      },
    ) => settingsStore.setOverlayBounds(bounds),
  );

  ipcMain.handle('window:switchToNormal', () => {
    const nextSettings = settingsStore.setDisplayMode('normal');

    if (mainWindow) {
      applyDisplayMode(mainWindow);
    }

    return nextSettings;
  });

  ipcMain.handle('updater:checkNow', async () => {
    if (isDev) {
      return { ok: false, message: 'Updater disabled in development mode.' };
    }

    try {
      const result = await autoUpdater.checkForUpdates();
      return {
        ok: true,
        updateInfo: result?.updateInfo ?? null,
      };
    } catch (error) {
      console.error('[updater] Manual check failed:', error);
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Update check failed.',
      };
    }
  });

  ipcMain.handle('app:getInfo', () => ({
    name: app.getName(),
    version: app.getVersion(),
    owner: 'Fernando Marin',
  }));

  await createWindow();
  setupAutoUpdates();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
      setupAutoUpdates();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
