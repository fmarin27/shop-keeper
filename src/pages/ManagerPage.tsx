import type { DisplayMode, MainTab } from '../types/app';
import AppTopBar from '../components/AppTopBar';
import JobsTab from '../features/jobs/JobsTab';
import MaterialsMessagesTab from '../features/messages/MaterialsMessagesTab';

type ManagerPageProps = {
  selectedTab: MainTab;
  onTabChange: (tab: MainTab) => void;
  displayMode: DisplayMode;
  onDisplayModeChange: (mode: DisplayMode) => void;
  onSwitchMode: () => void;
};

function ManagerPage({
  selectedTab,
  onTabChange,
  displayMode,
  onDisplayModeChange,
  onSwitchMode,
}: ManagerPageProps) {
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
        modeLabel="Manager"
        selectedTab={selectedTab}
        onTabChange={onTabChange}
        displayMode={displayMode}
        onDisplayModeChange={onDisplayModeChange}
        onSwitchMode={onSwitchMode}
      />

      <main style={{ padding: isCompact ? 14 : 24 }}>
        {selectedTab === 'jobs' ? (
          <JobsTab showAddJob compact={isCompact} />
        ) : (
          <MaterialsMessagesTab compact={isCompact} />
        )}
      </main>
    </div>
  );
}

export default ManagerPage;