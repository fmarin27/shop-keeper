import type { DisplayMode, MainTab, OverlayFocusTarget } from '../types/app';
import AppTopBar from '../components/AppTopBar';
import JobsTab from '../features/jobs/JobsTab';
import LeadsTab from '../features/leads/LeadsTab';
import MaterialsMessagesTab from '../features/messages/MaterialsMessagesTab';
import PartsTab from '../features/parts/PartsTab';
import CommandCenterTab from '../features/commandCenter/CommandCenterTab';
import MaterialsManagerTab from '../features/materialsManager/MaterialsManagerTab';
import { useIsMobile } from '../hooks/useIsMobile';
import { appBridge } from '../services/platform/appBridge';

type ManagerPageProps = {
  selectedTab: MainTab;
  onTabChange: (tab: MainTab) => void;
  displayMode: DisplayMode;
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

function ManagerPage({
  selectedTab,
  onTabChange,
  displayMode,
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
}: ManagerPageProps) {
  const isMobile = useIsMobile();
  const isCompact = displayMode === 'compact';
  const isDesktopApp = appBridge.isDesktop();

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
        modeLabel="Manager"
        selectedTab={selectedTab}
        onTabChange={onTabChange}
        displayMode={displayMode}
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
        showMaterialsManager={isDesktopApp}
      />

      <main style={{ padding: isMobile ? 10 : isCompact ? 14 : 24 }}>
        {selectedTab === 'commandCenter' && !isMobile ? (
          <CommandCenterTab compact={isCompact} mobile={isMobile} />
        ) : selectedTab === 'jobs' ? (
          <JobsTab
            showAddJob
            compact={isCompact}
            mobile={isMobile}
            appMode="manager"
            focusedJobId={overlayFocusTarget?.tab === 'jobs' ? overlayFocusTarget.itemId : null}
            focusedJobDone={overlayFocusTarget?.tab === 'jobs' ? !!overlayFocusTarget.done : false}
            onFocusedJobHandled={onOverlayFocusHandled}
          />
        ) : selectedTab === 'parts' ? (
          <PartsTab
            appMode="manager"
            compact={isCompact || isMobile}
            mobile={isMobile}
            onOpenJob={(jobId) => {
              onTabChange('jobs');
              onOpenAttentionJob(jobId);
            }}
          />
        ) : selectedTab === 'leads' ? (
          <LeadsTab compact={isCompact} mobile={isMobile} />
        ) : selectedTab === 'materials' ? (
          <div style={{ display: 'grid', gap: isCompact ? 10 : 24 }}>
            {isDesktopApp ? (
              <MaterialsManagerTab compact={isCompact} mobile={isMobile} />
            ) : null}
            <MaterialsMessagesTab
              appMode="manager"
              view="materials"
              compact={isCompact}
              mobile={isMobile}
              focusedMaterialId={
                overlayFocusTarget?.tab === 'materials'
                  ? overlayFocusTarget.itemId
                  : null
              }
              onFocusHandled={onOverlayFocusHandled}
            />
          </div>
        ) : selectedTab === 'materialsManager' && isDesktopApp ? (
          <MaterialsManagerTab compact={isCompact} mobile={isMobile} />
        ) : selectedTab === 'messages' ? (
          <MaterialsMessagesTab
            appMode="manager"
            view="messages"
            compact={isCompact}
            mobile={isMobile}
            focusedMessageId={
              overlayFocusTarget?.tab === 'messages'
                ? overlayFocusTarget.itemId
                : null
            }
            onFocusHandled={onOverlayFocusHandled}
          />
        ) : (
          <JobsTab
            showAddJob
            compact={isCompact}
            mobile={isMobile}
            appMode="manager"
            focusedJobId={overlayFocusTarget?.tab === 'jobs' ? overlayFocusTarget.itemId : null}
            focusedJobDone={overlayFocusTarget?.tab === 'jobs' ? !!overlayFocusTarget.done : false}
            onFocusedJobHandled={onOverlayFocusHandled}
          />
        )}
      </main>
    </div>
  );
}

export default ManagerPage;
