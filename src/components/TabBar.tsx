import type { MainTab } from '../types/app';

type TabBarProps = {
  selectedTab: MainTab;
  onTabChange: (tab: MainTab) => void;
  compact?: boolean;
  mobile?: boolean;
  showLeads?: boolean;
  showCommandCenter?: boolean;
  showMaterialsManager?: boolean;
  jobsUnreadCount?: number;
  partsUnreadCount?: number;
  materialsMessagesUnreadCount?: number;
  leadsCount?: number;
};

function tabStyle(
  active: boolean,
  compact: boolean,
  hasUnread: boolean,
): React.CSSProperties {
  return {
    border: active
      ? '1px solid #60a5fa'
      : hasUnread
      ? '1px solid #3b82f6'
      : '1px solid #475569',
    background: active
      ? '#1d4ed8'
      : hasUnread
      ? '#1e3a8a'
      : '#0f172a',
    color: '#e5e7eb',
    borderRadius: compact ? 14 : 18,
    padding: compact ? '10px 18px' : '16px 34px',
    fontSize: compact ? 14 : 18,
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: hasUnread ? '0 0 18px rgba(96,165,250,0.14)' : 'none',
    transition: 'all 140ms ease',
  };
}

function TabBar({
  selectedTab,
  onTabChange,
  compact = false,
  mobile = false,
  showLeads = false,
  showCommandCenter = false,
  showMaterialsManager = false,
  jobsUnreadCount = 0,
  partsUnreadCount = 0,
  materialsMessagesUnreadCount = 0,
  leadsCount = 0,
}: TabBarProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: mobile ? 'wrap' : 'nowrap',
        gap: compact ? 8 : 14,
        padding: compact ? 8 : 12,
        borderRadius: compact ? 18 : 28,
        background: '#0f172a',
        border: '1px solid #334155',
        width: mobile ? '100%' : 'auto',
      }}
    >
      {showCommandCenter ? (
        <TabButton
          label="RO Command Center"
          active={selectedTab === 'commandCenter'}
          compact={compact}
          mobile={mobile}
          unreadCount={0}
          onClick={() => onTabChange('commandCenter')}
        />
      ) : null}

      <TabButton
        label="Jobs"
        active={selectedTab === 'jobs'}
        compact={compact}
        mobile={mobile}
        unreadCount={jobsUnreadCount}
        onClick={() => onTabChange('jobs')}
      />

      <TabButton
        label="Parts/Sublet"
        active={selectedTab === 'parts'}
        compact={compact}
        mobile={mobile}
        unreadCount={partsUnreadCount}
        onClick={() => onTabChange('parts')}
      />

      <TabButton
        label="Materials & Messages"
        active={selectedTab === 'materialsMessages'}
        compact={compact}
        mobile={mobile}
        unreadCount={materialsMessagesUnreadCount}
        onClick={() => onTabChange('materialsMessages')}
      />

      {showLeads ? (
        <TabButton
          label="Leads"
          active={selectedTab === 'leads'}
          compact={compact}
          mobile={mobile}
          unreadCount={leadsCount}
          onClick={() => onTabChange('leads')}
        />
      ) : null}

      {showMaterialsManager ? (
        <TabButton
          label="Materials Manager"
          active={selectedTab === 'materialsManager'}
          compact={compact}
          mobile={mobile}
          unreadCount={0}
          onClick={() => onTabChange('materialsManager')}
        />
      ) : null}
    </div>
  );
}

function TabButton({
  label,
  active,
  compact,
  mobile,
  unreadCount,
  onClick,
}: {
  label: string;
  active: boolean;
  compact: boolean;
  mobile: boolean;
  unreadCount: number;
  onClick: () => void;
}) {
  const hasUnread = unreadCount > 0;

  return (
    <button
      onClick={onClick}
      style={{
        ...tabStyle(active, compact, hasUnread),
        flex: mobile ? '1 1 100%' : '0 0 auto',
        width: mobile ? '100%' : 'auto',
        textAlign: 'left',
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: compact ? 8 : 10,
          whiteSpace: mobile ? 'normal' : 'nowrap',
        }}
      >
        <span>{label}</span>

        {hasUnread ? (
          <span
            style={{
              minWidth: compact ? 20 : 22,
              height: compact ? 20 : 22,
              padding: compact ? '0 6px' : '0 7px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 999,
              background: active ? '#2563eb' : '#1d4ed8',
              border: '1px solid #93c5fd',
              color: '#dbeafe',
              fontSize: compact ? 11 : 12,
              fontWeight: 900,
              lineHeight: 1,
              boxShadow: '0 0 12px rgba(96,165,250,0.18)',
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </span>
    </button>
  );
}

export default TabBar;
