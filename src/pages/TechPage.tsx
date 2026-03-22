import type { DisplayMode, MainTab } from '../types/app';
import AppTopBar from '../components/AppTopBar';
import JobsTab from '../features/jobs/JobsTab';
import MaterialsMessagesTab from '../features/messages/MaterialsMessagesTab';

type TechPageProps = {
  selectedTab: MainTab;
  onTabChange: (tab: MainTab) => void;
  displayMode: DisplayMode;
  onDisplayModeChange: (mode: DisplayMode) => void;
  onSwitchMode: () => void;
};

function TechPage({
  selectedTab,
  onTabChange,
  displayMode,
  onDisplayModeChange,
  onSwitchMode,
}: TechPageProps) {
  const isCompact = displayMode === 'compact';

  return (
    <div
      style={{
        minHeight: '100vh',
        background:
          'linear-gradient(180deg, rgba(2,6,23,1) 0%, rgba(8,15,30,1) 100%)',
        color: '#e5e7eb',
        fontFamily: 'Segoe UI, Inter, sans-serif',
      }}
    >
      <AppTopBar
        modeLabel="Tech"
        selectedTab={selectedTab}
        onTabChange={onTabChange}
        displayMode={displayMode}
        onDisplayModeChange={onDisplayModeChange}
        onSwitchMode={onSwitchMode}
      />

      <main style={{ padding: isCompact ? 14 : 24 }}>
        {selectedTab === 'jobs' ? (
          <JobsTab showAddJob={false} compact={isCompact} />
        ) : (
          <MaterialsMessagesTab compact={isCompact} />
        )}
      </main>
    </div>
  );
}

export default TechPage;