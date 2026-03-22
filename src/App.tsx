import { useEffect, useState } from 'react';
import OverlayView from './components/OverlayView';
import ManagerPage from './pages/ManagerPage';
import ModeChooserPage from './pages/ModeChooserPage';
import TechPage from './pages/TechPage';
import type { AppMode, DisplayMode, LocalAppSettings, MainTab } from './types/app';

declare global {
  interface Window {
    shopFloorApi?: {
      getSettings: () => Promise<LocalAppSettings>;
      setAppMode: (mode: AppMode) => Promise<LocalAppSettings>;
      setDisplayMode: (mode: DisplayMode) => Promise<LocalAppSettings>;
      setOverlayBounds: (bounds: {
        overlayWidth: number;
        overlayHeight: number;
        overlayX: number;
        overlayY: number;
      }) => Promise<LocalAppSettings>;
    };
  }
}

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [appMode, setAppMode] = useState<AppMode | null>(null);
  const [displayMode, setDisplayMode] = useState<DisplayMode>('normal');
  const [selectedTab, setSelectedTab] = useState<MainTab>('jobs');

  useEffect(() => {
    const loadSettings = async () => {
      try {
        if (window.shopFloorApi?.getSettings) {
          const settings = await window.shopFloorApi.getSettings();
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
      if (window.shopFloorApi?.setAppMode) {
        const settings = await window.shopFloorApi.setAppMode(mode);
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
      if (window.shopFloorApi?.setDisplayMode) {
        const settings = await window.shopFloorApi.setDisplayMode(mode);
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
  };

  if (appMode === 'manager') {
    return <ManagerPage {...sharedProps} />;
  }

  return <TechPage {...sharedProps} />;
}

export default App;