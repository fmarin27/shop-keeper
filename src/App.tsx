import { useEffect, useState } from 'react';
import OverlayView from './components/OverlayView';
import { useIsMobile } from './hooks/useIsMobile';
import ManagerPage from './pages/ManagerPage';
import ModeChooserPage from './pages/ModeChooserPage';
import TechPage from './pages/TechPage';
import { ensureFirebaseSession } from './services/firebase/config';
import { subscribeToJobs } from './services/firebase/jobs';
import { DEFAULT_SHOP_PROFILE, setActiveShopProfile } from './services/firebase/shopProfile';
import { appBridge } from './services/platform/appBridge';
import { MANAGER_MODE_PASSWORD } from './utils/constants';
import type {
  AppMode,
  DisplayMode,
  Job,
  MainTab,
  OverlayFocusTarget,
} from './types/app';

const SPLASH_MIN_DURATION_MS = 5000;
const SPLASH_MESSAGES = [
  'Loading jobs...',
  'Syncing parts...',
  'Checking messages...',
  'Preparing dashboard...',
] as const;

function App() {
  const isMobile = useIsMobile();
  const [isLoading, setIsLoading] = useState(true);
  const [appMode, setAppMode] = useState<AppMode | null>(null);
  const [displayMode, setDisplayMode] = useState<DisplayMode>('normal');
  const [selectedTab, setSelectedTab] = useState<MainTab>('jobs');
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [updaterState, setUpdaterState] = useState<UpdaterStatus>({
    phase: 'idle',
  });
  const [managerPassword, setManagerPassword] = useState('');
  const [managerPasswordError, setManagerPasswordError] = useState<string | null>(null);
  const [pendingMode, setPendingMode] = useState<AppMode | null>(null);
  const [appInfo, setAppInfo] = useState<AppInfo>({
    name: 'Shop Keeper',
    version: '1.0.0',
    owner: 'Fernando Marin',
  });
  const [splashMessageIndex, setSplashMessageIndex] = useState(0);
  const [overlayFocusTarget, setOverlayFocusTarget] =
    useState<OverlayFocusTarget | null>(null);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setSplashMessageIndex((current) => (current + 1) % SPLASH_MESSAGES.length);
    }, 1100);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    void ensureFirebaseSession().catch((error) => {
      console.error('Failed to establish Firebase session:', error);
    });
  }, []);

  useEffect(() => {
    const loadSettings = async () => {
      const startedAt = Date.now();

      try {
        const info = await appBridge.getAppInfo();
        setAppInfo(info);

        const settings = await appBridge.getSettings();
        setActiveShopProfile({
          id: settings.activeShopId ?? DEFAULT_SHOP_PROFILE.id,
          name:
            settings.activeShopId && settings.activeShopId !== DEFAULT_SHOP_PROFILE.id
              ? settings.activeShopId
              : DEFAULT_SHOP_PROFILE.name,
        });
        setAppMode(settings.appMode ?? null);
        if (settings.displayMode !== 'normal') {
          await appBridge.setDisplayMode('normal');
        }
        setDisplayMode('normal');
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
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile) return;
    if (displayMode !== 'normal') {
      void handleDisplayModeChange('normal');
    }
    if (selectedTab === 'commandCenter' || selectedTab === 'materialsManager') {
      setSelectedTab('jobs');
    }
  }, [displayMode, isMobile]);

  useEffect(() => {
    let isMounted = true;

    const loadUpdaterStatus = async () => {
      try {
        const status = await appBridge.getUpdaterStatus();
        if (isMounted) {
          setUpdaterState(status);
          setUpdateStatus(status.message ?? null);
        }
      } catch (error) {
        console.error('Failed to load updater status:', error);
      }
    };

    loadUpdaterStatus();

    const unsubscribe = appBridge.onUpdaterStatus((status) => {
      setUpdaterState(status);
      setUpdateStatus(status.message ?? null);
    });

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (!appBridge.isDesktop()) {
      return;
    }

    let cancelled = false;
    const folderSyncSignatures: Record<string, string> = {};
    const jobRecordSyncSignatures: Record<string, string> = {};

    const syncJobsToRoFolders = async (jobs: Job[]) => {
      for (const job of jobs) {
        if (cancelled || !job.roNumber.trim()) {
          continue;
        }

        const folderSignature = [
          job.customerName.trim(),
          job.done ? 'closed' : 'active',
        ].join('|');

        if (folderSyncSignatures[job.id] !== folderSignature) {
          try {
            if (job.done) {
              await appBridge.moveRoFolderForJob({
                roNumber: job.roNumber,
                customerName: job.customerName,
                done: true,
              });
            } else {
              await appBridge.ensureRoFolderForJob({
                roNumber: job.roNumber,
                customerName: job.customerName,
                done: false,
              });
            }

            if (cancelled) {
              return;
            }

            folderSyncSignatures[job.id] = folderSignature;
          } catch (error) {
            console.error('Failed to sync RO folder from app-level job state:', error);
          }
        }

        const jobRecordSignature = JSON.stringify(job);
        if (jobRecordSyncSignatures[job.id] === jobRecordSignature) {
          continue;
        }

        try {
          await appBridge.saveJobRecordToRoFolder({ job });

          if (cancelled) {
            return;
          }

          jobRecordSyncSignatures[job.id] = jobRecordSignature;
        } catch (error) {
          console.error('Failed to save app-level job record into RO folder:', error);
        }
      }
    };

    const unsubscribe = subscribeToJobs((jobs) => {
      void syncJobsToRoFolders(jobs);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const applyModeSelect = async (mode: AppMode) => {
    try {
      const settings = await appBridge.setAppMode(mode);
      setAppMode(settings.appMode ?? mode);
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
    if (
      mode === 'tech' &&
      (selectedTab === 'leads' || selectedTab === 'materialsManager')
    ) {
      setSelectedTab('jobs');
    }
  };

  const handleDisplayModeChange = async (mode: DisplayMode) => {
    const nextMode: DisplayMode = isMobile ? 'normal' : mode;
    try {
      const settings = await appBridge.setDisplayMode(nextMode);
      setDisplayMode(settings.displayMode ?? nextMode);
    } catch (error) {
      console.error('Failed to save display mode:', error);
      setDisplayMode(nextMode);
    }
  };

  const handleSwitchMode = async () => {
    const nextMode: AppMode = appMode === 'manager' ? 'tech' : 'manager';
    if (
      nextMode === 'tech' &&
      (selectedTab === 'leads' || selectedTab === 'materialsManager')
    ) {
      setSelectedTab('jobs');
    }
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
    if (updaterState.phase === 'downloaded' || (isMobile && updaterState.phase === 'available')) {
      const result = await appBridge.installUpdate();
      if (!result.ok) {
        setUpdateStatus(result.message ?? 'Update install could not start.');
      } else {
        setUpdateStatus(result.message ?? null);
      }
      return;
    }

    try {
      const result = await appBridge.checkForUpdates();

      if (!result.ok) {
        setUpdateStatus(result.message ?? 'Update check failed.');
        return;
      }
      if (result.status) {
        setUpdaterState(result.status);
        setUpdateStatus(result.status.message ?? null);
      }
    } catch (error) {
      console.error('Failed to check for updates:', error);
      setUpdateStatus('Update check failed.');
    }
  };

  const openJobsView = async (jobId?: string, done?: boolean) => {
    setOverlayFocusTarget(jobId ? { tab: 'jobs', itemId: jobId, done } : null);
    setSelectedTab('jobs');
    await handleDisplayModeChange('normal');
  };

  const openMaterialsView = async (itemId?: string) => {
    setOverlayFocusTarget(itemId ? { tab: 'materials', itemId } : null);
    setSelectedTab('materials');
    await handleDisplayModeChange('normal');
  };

  const openMessagesView = async (itemId?: string) => {
    setOverlayFocusTarget(itemId ? { tab: 'messages', itemId } : null);
    setSelectedTab('messages');
    await handleDisplayModeChange('normal');
  };

  if (isLoading) {
    return (
      <StartupSplash
        appInfo={appInfo}
        loadingMessage={SPLASH_MESSAGES[splashMessageIndex]}
      />
    );
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

  if (!isMobile && displayMode === 'overlay') {
    return (
      <OverlayView
        appMode={appMode}
        onExpand={() => handleDisplayModeChange('normal')}
        onOpenJobs={() => openJobsView()}
        onOpenMaterialsMessages={() => openMessagesView()}
        onOpenJob={(jobId) => openJobsView(jobId)}
        onOpenMaterial={(itemId) => openMaterialsView(itemId)}
        onOpenMessage={(itemId) => openMessagesView(itemId)}
        onClose={() => appBridge.closeWindow()}
      />
    );
  }

  const sharedProps = {
    selectedTab,
    onTabChange: setSelectedTab,
    displayMode,
    onSwitchMode: handleSwitchMode,
    onCheckForUpdates: handleCheckForUpdates,
    updateStatus,
    updateButtonLabel:
      updaterState.phase === 'downloaded'
        ? 'Restart to Update'
        : isMobile && updaterState.phase === 'available'
        ? 'Download Update'
        : updaterState.phase === 'checking'
        ? 'Checking...'
        : updaterState.phase === 'available' || updaterState.phase === 'downloading'
        ? 'Downloading...'
        : updaterState.phase === 'error'
        ? 'Check Again'
        : 'Check for Updates',
    updateButtonDisabled: updaterState.phase === 'checking',
    onOpenAttentionJob: (jobId: string, done?: boolean) => {
      void openJobsView(jobId, done);
    },
    onOpenAttentionMaterial: (itemId: string) => {
      void openMaterialsView(itemId);
    },
    onOpenAttentionMessage: (itemId: string) => {
      void openMessagesView(itemId);
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

function StartupSplash({
  appInfo,
  loadingMessage,
}: {
  appInfo: AppInfo;
  loadingMessage: string;
}) {
  const isBetaBuild = appInfo.name.toLowerCase().includes('beta');

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background:
          'radial-gradient(circle at top, rgba(56,189,248,0.34), transparent 34%), radial-gradient(circle at 82% 18%, rgba(59,130,246,0.22), transparent 22%), linear-gradient(160deg, #08111f 0%, #101b2d 50%, #09111d 100%)',
        color: '#eef4fb',
        fontFamily: 'Segoe UI, Inter, sans-serif',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%)',
          transform: 'translateX(-35%) skewX(-18deg)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          width: 'min(640px, calc(100vw - 40px))',
          borderRadius: 34,
          padding: '40px 40px 34px',
          background: 'linear-gradient(180deg, rgba(21,32,50,0.96), rgba(10,18,33,0.98))',
          border: '1px solid rgba(125,211,252,0.28)',
          boxShadow: '0 30px 100px rgba(0,0,0,0.42), 0 0 0 1px rgba(255,255,255,0.04)',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(120deg, rgba(34,211,238,0.12), transparent 26%, transparent 72%, rgba(59,130,246,0.12))',
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
                background: isBetaBuild
                  ? 'rgba(249,115,22,0.18)'
                  : 'rgba(14,165,233,0.16)',
                border: isBetaBuild
                  ? '1px solid rgba(251,146,60,0.34)'
                  : '1px solid rgba(34,211,238,0.24)',
                color: isBetaBuild ? '#ffedd5' : '#cffafe',
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: 1.1,
                textTransform: 'uppercase',
              }}
            >
              {isBetaBuild ? 'Beta Testing Build' : 'Collision Workflow System'}
            </span>

            <span
              style={{
                color: '#bfdbfe',
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
              color: '#7dd3fc',
              textTransform: 'uppercase',
            }}
            >
              {isBetaBuild ? 'Keeper Beta' : 'Keeper'}
            </div>
          </div>

          <div
            style={{
              maxWidth: 500,
              color: '#dbe6f3',
              fontSize: 16,
              lineHeight: 1.5,
              fontWeight: 600,
            }}
          >
            Live shop communication, priority tracking, parts flow, and updates in one desktop workspace.
          </div>

          <div
            style={{
              display: 'grid',
              gap: 10,
              marginTop: 2,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 900,
                  color: isBetaBuild ? '#fdba74' : '#d9f99d',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                }}
              >
                {isBetaBuild ? `${loadingMessage} [BETA]` : loadingMessage}
              </div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  color: '#bfd0e4',
                }}
              >
                Starting up...
              </div>
            </div>

            <div
              style={{
                height: 12,
                borderRadius: 999,
                background: 'rgba(15,23,42,0.9)',
                border: '1px solid rgba(148,163,184,0.22)',
                overflow: 'hidden',
                boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.28)',
              }}
            >
              <div
                style={{
                  width: '68%',
                  height: '100%',
                  borderRadius: 999,
                  background:
                    'linear-gradient(90deg, rgba(34,197,94,0.92), rgba(125,211,252,0.95), rgba(59,130,246,0.92))',
                  boxShadow: '0 0 20px rgba(125,211,252,0.32)',
                }}
              />
            </div>
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
            <SplashInfoCard
              label="Environment"
              value={isBetaBuild ? 'Preview / Beta Build' : 'Production Build'}
            />
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
        background: 'rgba(12,19,34,0.62)',
        border: '1px solid rgba(148,163,184,0.22)',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: '#b8c7da',
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
