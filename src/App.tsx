import { useEffect, useState } from 'react';
import OverlayView from './components/OverlayView';
import ManagerPage from './pages/ManagerPage';
import ModeChooserPage from './pages/ModeChooserPage';
import TechPage from './pages/TechPage';
import { MANAGER_MODE_PASSWORD } from './utils/constants';
import type {
  AppMode,
  DisplayMode,
  MainTab,
  OverlayFocusTarget,
} from './types/app';

const SPLASH_MIN_DURATION_MS = 1800;

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [appMode, setAppMode] = useState<AppMode | null>(null);
  const [displayMode, setDisplayMode] = useState<DisplayMode>('normal');
  const [selectedTab, setSelectedTab] = useState<MainTab>('jobs');
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [managerPassword, setManagerPassword] = useState('');
  const [managerPasswordError, setManagerPasswordError] = useState<string | null>(null);
  const [pendingMode, setPendingMode] = useState<AppMode | null>(null);
  const [appInfo, setAppInfo] = useState<AppInfo>({
    name: 'Shop Keeper',
    version: '1.0.0',
    owner: 'Fernando Marin',
  });
  const [overlayFocusTarget, setOverlayFocusTarget] =
    useState<OverlayFocusTarget | null>(null);

  useEffect(() => {
    const loadSettings = async () => {
      const startedAt = Date.now();

      try {
        if (window.appBridge?.getAppInfo) {
          const info = await window.appBridge.getAppInfo();
          setAppInfo(info);
        }

        if (window.appBridge?.getSettings) {
          const settings = await window.appBridge.getSettings();
          setAppMode(settings.appMode ?? null);
          setDisplayMode(settings.displayMode ?? 'normal');
        }
      } catch (error) {
        console.error('Failed to load local settings:', error);
      } finally {
        const elapsed = Date.now() - startedAt;
        const remaining = Math.max(SPLASH_MIN_DURATION_MS - elapsed, 0);

        window.setTimeout(() => {
          setIsLoading(false);
        }, remaining);
      }
    };

    loadSettings();
  }, []);

  const applyModeSelect = async (mode: AppMode) => {
    try {
      if (window.appBridge?.setAppMode) {
        const settings = await window.appBridge.setAppMode(mode);
        setAppMode(settings.appMode ?? mode);
      } else {
        setAppMode(mode);
      }
    } catch (error) {
      console.error('Failed to save app mode:', error);
      setAppMode(mode);
    }
  };

  const handleModeSelect = async (mode: AppMode) => {
    if (mode === 'manager' && appMode !== 'manager') {
      setPendingMode('manager');
      setManagerPassword('');
      setManagerPasswordError(null);
      return;
    }

    await applyModeSelect(mode);
  };

  const handleDisplayModeChange = async (mode: DisplayMode) => {
    try {
      if (window.appBridge?.setDisplayMode) {
        const settings = await window.appBridge.setDisplayMode(mode);
        setDisplayMode(settings.displayMode ?? mode);
      } else {
        setDisplayMode(mode);
      }
    } catch (error) {
      console.error('Failed to save display mode:', error);
      setDisplayMode(mode);
    }
  };

  const handleSwitchMode = async () => {
    const nextMode: AppMode = appMode === 'manager' ? 'tech' : 'manager';
    await handleModeSelect(nextMode);
  };

  const handleManagerPasswordSubmit = async () => {
    if (managerPassword !== MANAGER_MODE_PASSWORD) {
      setManagerPasswordError('Incorrect manager password.');
      return;
    }

    setPendingMode(null);
    setManagerPassword('');
    setManagerPasswordError(null);
    await applyModeSelect('manager');
  };

  const handleManagerPasswordCancel = () => {
    setPendingMode(null);
    setManagerPassword('');
    setManagerPasswordError(null);
  };

  const handleCheckForUpdates = async () => {
    if (!window.appBridge?.checkForUpdates) {
      setUpdateStatus('Update checks are unavailable in this build.');
      return;
    }

    setUpdateStatus('Checking for updates...');

    try {
      const result = await window.appBridge.checkForUpdates();

      if (!result.ok) {
        setUpdateStatus(result.message ?? 'Update check failed.');
        return;
      }

      if (result.updateInfo?.version) {
        setUpdateStatus(`Latest published version: ${result.updateInfo.version}`);
        return;
      }

      setUpdateStatus('No update is currently available.');
    } catch (error) {
      console.error('Failed to check for updates:', error);
      setUpdateStatus('Update check failed.');
    }
  };

  const openJobsView = async (jobId?: string) => {
    setOverlayFocusTarget(jobId ? { tab: 'jobs', itemId: jobId } : null);
    setSelectedTab('jobs');
    await handleDisplayModeChange('normal');
  };

  const openMaterialsMessagesView = async (
    itemType?: 'material' | 'message',
    itemId?: string,
  ) => {
    setOverlayFocusTarget(
      itemType && itemId
        ? {
            tab: 'materialsMessages',
            itemType,
            itemId,
          }
        : null,
    );
    setSelectedTab('materialsMessages');
    await handleDisplayModeChange('normal');
  };

  if (isLoading) {
    return <StartupSplash appInfo={appInfo} />;
  }

  if (!appMode) {
    return (
      <>
        <ModeChooserPage onSelectMode={handleModeSelect} />
        {pendingMode === 'manager' ? (
          <ManagerPasswordDialog
            password={managerPassword}
            error={managerPasswordError}
            onPasswordChange={setManagerPassword}
            onCancel={handleManagerPasswordCancel}
            onSubmit={() => {
              void handleManagerPasswordSubmit();
            }}
          />
        ) : null}
      </>
    );
  }

  if (displayMode === 'overlay') {
    return (
      <OverlayView
        appMode={appMode}
        onExpand={() => handleDisplayModeChange('normal')}
        onOpenJobs={() => openJobsView()}
        onOpenMaterialsMessages={() => openMaterialsMessagesView()}
        onOpenJob={(jobId) => openJobsView(jobId)}
        onOpenMaterial={(itemId) => openMaterialsMessagesView('material', itemId)}
        onOpenMessage={(itemId) => openMaterialsMessagesView('message', itemId)}
        onClose={() => window.close()}
      />
    );
  }

  const sharedProps = {
    selectedTab,
    onTabChange: setSelectedTab,
    displayMode,
    onDisplayModeChange: handleDisplayModeChange,
    onSwitchMode: handleSwitchMode,
    onCheckForUpdates: handleCheckForUpdates,
    updateStatus,
    onOpenAttentionJob: (jobId: string) => {
      void openJobsView(jobId);
    },
    onOpenAttentionMaterial: (itemId: string) => {
      void openMaterialsMessagesView('material', itemId);
    },
    onOpenAttentionMessage: (itemId: string) => {
      void openMaterialsMessagesView('message', itemId);
    },
    overlayFocusTarget,
    onOverlayFocusHandled: () => setOverlayFocusTarget(null),
  };

  if (appMode === 'manager') {
    return (
      <>
        <ManagerPage {...sharedProps} />
        {pendingMode === 'manager' ? (
          <ManagerPasswordDialog
            password={managerPassword}
            error={managerPasswordError}
            onPasswordChange={setManagerPassword}
            onCancel={handleManagerPasswordCancel}
            onSubmit={() => {
              void handleManagerPasswordSubmit();
            }}
          />
        ) : null}
      </>
    );
  }

  return (
    <>
      <TechPage {...sharedProps} />
      {pendingMode === 'manager' ? (
        <ManagerPasswordDialog
          password={managerPassword}
          error={managerPasswordError}
          onPasswordChange={setManagerPassword}
          onCancel={handleManagerPasswordCancel}
          onSubmit={() => {
            void handleManagerPasswordSubmit();
          }}
        />
      ) : null}
    </>
  );
}

function ManagerPasswordDialog({
  password,
  error,
  onPasswordChange,
  onCancel,
  onSubmit,
}: {
  password: string;
  error: string | null;
  onPasswordChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(2, 6, 23, 0.78)',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        zIndex: 1000,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          borderRadius: 20,
          border: '1px solid rgba(96,165,250,0.22)',
          background: 'rgba(15,23,42,0.96)',
          color: '#e5e7eb',
          boxShadow: '0 20px 60px rgba(0,0,0,0.38)',
          padding: 24,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 24 }}>Manager Password</h2>
        <p style={{ margin: '10px 0 0', color: '#cbd5e1', lineHeight: 1.5 }}>
          Enter the password to switch into Manager mode.
        </p>

        <input
          autoFocus
          type="password"
          value={password}
          onChange={(event) => {
            onPasswordChange(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              onSubmit();
            }
          }}
          style={{
            width: '100%',
            marginTop: 18,
            padding: '14px 16px',
            borderRadius: 14,
            border: error ? '1px solid #ef4444' : '1px solid #475569',
            background: '#020617',
            color: '#f8fafc',
            fontSize: 16,
            boxSizing: 'border-box',
          }}
        />

        {error ? (
          <div
            style={{
              marginTop: 10,
              color: '#fca5a5',
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {error}
          </div>
        ) : null}

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 12,
            marginTop: 20,
          }}
        >
          <button
            onClick={onCancel}
            style={{
              border: '1px solid #475569',
              background: '#1e293b',
              color: '#f8fafc',
              borderRadius: 14,
              padding: '12px 16px',
              fontSize: 15,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            style={{
              border: '1px solid #2563eb',
              background: '#1d4ed8',
              color: '#eff6ff',
              borderRadius: 14,
              padding: '12px 18px',
              fontSize: 15,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Unlock Manager
          </button>
        </div>
      </div>
    </div>
  );
}

function StartupSplash({ appInfo }: { appInfo: AppInfo }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background:
          'radial-gradient(circle at top, rgba(14,165,233,0.22), transparent 32%), linear-gradient(160deg, #020617 0%, #08111f 55%, #020617 100%)',
        color: '#e5e7eb',
        fontFamily: 'Segoe UI, Inter, sans-serif',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: 'min(640px, calc(100vw - 40px))',
          borderRadius: 30,
          padding: '34px 34px 30px',
          background: 'linear-gradient(180deg, rgba(15,23,42,0.9), rgba(2,6,23,0.94))',
          border: '1px solid rgba(56,189,248,0.2)',
          boxShadow: '0 30px 100px rgba(0,0,0,0.4)',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(120deg, rgba(34,211,238,0.08), transparent 26%, transparent 72%, rgba(59,130,246,0.08))',
            pointerEvents: 'none',
          }}
        />

        <div
          style={{
            position: 'relative',
            display: 'grid',
            gap: 18,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{
                borderRadius: 999,
                padding: '8px 12px',
                background: 'rgba(14,165,233,0.16)',
                border: '1px solid rgba(34,211,238,0.24)',
                color: '#cffafe',
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: 1.1,
                textTransform: 'uppercase',
              }}
            >
              Collision Workflow System
            </span>

            <span
              style={{
                color: '#93c5fd',
                fontSize: 13,
                fontWeight: 800,
              }}
            >
              Version {appInfo.version}
            </span>
          </div>

          <div>
            <div
              style={{
                fontSize: 'clamp(44px, 9vw, 82px)',
                fontWeight: 900,
                lineHeight: 0.94,
                letterSpacing: -2.2,
                color: '#f8fafc',
                textTransform: 'uppercase',
              }}
            >
              Shop
            </div>
            <div
              style={{
                fontSize: 'clamp(44px, 9vw, 82px)',
                fontWeight: 900,
                lineHeight: 0.94,
                letterSpacing: -2.2,
                color: '#67e8f9',
                textTransform: 'uppercase',
              }}
            >
              Keeper
            </div>
          </div>

          <div
            style={{
              maxWidth: 460,
              color: '#cbd5e1',
              fontSize: 15,
              lineHeight: 1.5,
              fontWeight: 600,
            }}
          >
            Live shop communication, priority tracking, parts flow, and updates in one desktop workspace.
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
            }}
          >
            <SplashInfoCard label="Owner / Creator" value={appInfo.owner} />
            <SplashInfoCard label="Application" value={appInfo.name} />
            <SplashInfoCard label="Build" value={appInfo.version} />
          </div>
        </div>
      </div>
    </div>
  );
}

function SplashInfoCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        borderRadius: 18,
        padding: '14px 16px',
        background: 'rgba(2,6,23,0.5)',
        border: '1px solid rgba(148,163,184,0.14)',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: '#94a3b8',
          marginBottom: 6,
          textTransform: 'uppercase',
          letterSpacing: 0.7,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 800,
          color: '#f8fafc',
          lineHeight: 1.2,
        }}
      >
        {value}
      </div>
    </div>
  );
}

export default App;
