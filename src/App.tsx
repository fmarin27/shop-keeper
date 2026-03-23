import { useEffect, useState } from 'react';
import OverlayView from './components/OverlayView';
import ManagerPage from './pages/ManagerPage';
import ModeChooserPage from './pages/ModeChooserPage';
import TechPage from './pages/TechPage';
import type {
  AppMode,
  DisplayMode,
  MainTab,
  OverlayFocusTarget,
} from './types/app';

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [appMode, setAppMode] = useState<AppMode | null>(null);
  const [displayMode, setDisplayMode] = useState<DisplayMode>('normal');
  const [selectedTab, setSelectedTab] = useState<MainTab>('jobs');
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [overlayFocusTarget, setOverlayFocusTarget] =
    useState<OverlayFocusTarget | null>(null);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        if (window.appBridge?.getSettings) {
          const settings = await window.appBridge.getSettings();
          setAppMode(settings.appMode ?? null);
          setDisplayMode(settings.displayMode ?? 'normal');
        }
      } catch (error) {
        console.error('Failed to load local settings:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, []);

  const handleModeSelect = async (mode: AppMode) => {
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
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: '#020617',
          color: '#e5e7eb',
          fontFamily: 'Segoe UI, Inter, sans-serif',
        }}
      >
        Loading...
      </div>
    );
  }

  if (!appMode) {
    return <ModeChooserPage onSelectMode={handleModeSelect} />;
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
    return <ManagerPage {...sharedProps} />;
  }

  return <TechPage {...sharedProps} />;
}

export default App;
