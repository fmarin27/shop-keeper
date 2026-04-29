import type { DisplayMode, MainTab, OverlayFocusTarget } from '../types/app';
import AppTopBar from '../components/AppTopBar';
import JobsTab from '../features/jobs/JobsTab';
import MaterialsMessagesTab from '../features/messages/MaterialsMessagesTab';
import CommandCenterTab from '../features/commandCenter/CommandCenterTab';
import { useIsMobile } from '../hooks/useIsMobile';

type TechPageProps = {
  selectedTab: MainTab;
  onTabChange: (tab: MainTab) => void;
  displayMode: DisplayMode;
  onDisplayModeChange: (mode: DisplayMode) => void;
  onSwitchMode: () => void;
  onCheckForUpdates: () => void;
  updateStatus: string | null;
  updateButtonLabel: string;
  updateButtonDisabled: boolean;
  onOpenAttentionJob: (jobId: string, done?: boolean) => void;
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
  updateButtonLabel,
  updateButtonDisabled,
  onOpenAttentionJob,
  onOpenAttentionMaterial,
  onOpenAttentionMessage,
  overlayFocusTarget,
  onOverlayFocusHandled,
}: TechPageProps) {
  const isMobile = useIsMobile();
  const isCompact = displayMode === 'compact';

  return (
    <div
      style={{
        minHeight: '100vh',
        height: '100vh',
        overflowY: 'auto',
        overflowX: 'hidden',
        background:
          'linear-gradient(180deg, #263447 0%, #1d2a3b 38%, #172233 100%)',
        color: '#f4f7fb',
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
        updateButtonLabel={updateButtonLabel}
        updateButtonDisabled={updateButtonDisabled}
        mobile={isMobile}
        onOpenAttentionJob={onOpenAttentionJob}
        onOpenAttentionMaterial={onOpenAttentionMaterial}
        onOpenAttentionMessage={onOpenAttentionMessage}
        showCommandCenter={!isMobile}
      />

      <main style={{ padding: isMobile ? 10 : isCompact ? 14 : 24 }}>
        {selectedTab === 'commandCenter' && !isMobile ? (
          <CommandCenterTab compact={isCompact} mobile={isMobile} />
        ) : selectedTab === 'jobs' ? (
          <JobsTab
            showAddJob={false}
            compact={isCompact}
            mobile={isMobile}
            appMode="tech"
            focusedJobId={overlayFocusTarget?.tab === 'jobs' ? overlayFocusTarget.itemId : null}
            focusedJobDone={overlayFocusTarget?.tab === 'jobs' ? !!overlayFocusTarget.done : false}
            onFocusedJobHandled={onOverlayFocusHandled}
          />
        ) : (
          <MaterialsMessagesTab
            appMode="tech"
            compact={isCompact}
            mobile={isMobile}
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
