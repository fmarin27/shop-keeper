import type { DisplayMode, MainTab, OverlayFocusTarget } from '../types/app';
import AppTopBar from '../components/AppTopBar';
import JobsTab from '../features/jobs/JobsTab';
import MaterialsMessagesTab from '../features/messages/MaterialsMessagesTab';

type TechPageProps = {
  selectedTab: MainTab;
  onTabChange: (tab: MainTab) => void;
  displayMode: DisplayMode;
  onDisplayModeChange: (mode: DisplayMode) => void;
  onSwitchMode: () => void;
  onCheckForUpdates: () => void;
  updateStatus: string | null;
  onOpenAttentionJob: (jobId: string) => void;
  onOpenAttentionMaterial: (itemId: string) => void;
  onOpenAttentionMessage: (itemId: string) => void;
  overlayFocusTarget: OverlayFocusTarget | null;
  onOverlayFocusHandled: () => void;
};

function TechPage({
  selectedTab,
  onTabChange,
  displayMode,
  onDisplayModeChange,
  onSwitchMode,
  onCheckForUpdates,
  updateStatus,
  onOpenAttentionJob,
  onOpenAttentionMaterial,
  onOpenAttentionMessage,
  overlayFocusTarget,
  onOverlayFocusHandled,
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
        onCheckForUpdates={onCheckForUpdates}
        updateStatus={updateStatus}
        onOpenAttentionJob={onOpenAttentionJob}
        onOpenAttentionMaterial={onOpenAttentionMaterial}
        onOpenAttentionMessage={onOpenAttentionMessage}
      />

      <main style={{ padding: isCompact ? 14 : 24 }}>
        {selectedTab === 'jobs' ? (
          <JobsTab
            showAddJob={false}
            compact={isCompact}
            appMode="tech"
            focusedJobId={overlayFocusTarget?.tab === 'jobs' ? overlayFocusTarget.itemId : null}
            onFocusedJobHandled={onOverlayFocusHandled}
          />
        ) : (
          <MaterialsMessagesTab
            compact={isCompact}
            focusedMaterialId={
              overlayFocusTarget?.tab === 'materialsMessages' &&
              overlayFocusTarget.itemType === 'material'
                ? overlayFocusTarget.itemId
                : null
            }
            focusedMessageId={
              overlayFocusTarget?.tab === 'materialsMessages' &&
              overlayFocusTarget.itemType === 'message'
                ? overlayFocusTarget.itemId
                : null
            }
            onFocusHandled={onOverlayFocusHandled}
          />
        )}
      </main>
    </div>
  );
}

export default TechPage;
