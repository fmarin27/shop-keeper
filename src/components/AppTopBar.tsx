import { useEffect, useMemo, useState } from 'react';
import type { DisplayMode, Job, MainTab } from '../types/app';
import TabBar from './TabBar';
import ViewModeControl from './ViewModeControl';
import { subscribeToJobs } from '../services/firebase/jobs';
import { subscribeToMaterials } from '../services/firebase/materials';
import { subscribeToGeneralMessages } from '../services/firebase/messages';
import type { GeneralMessage, MaterialRequest } from '../features/messages/mockMessages';

type AppTopBarProps = {
  modeLabel: 'Manager' | 'Tech';
  selectedTab: MainTab;
  onTabChange: (tab: MainTab) => void;
  displayMode: DisplayMode;
  onDisplayModeChange: (mode: DisplayMode) => void;
  onSwitchMode: () => void;
};

function AppTopBar({
  modeLabel,
  selectedTab,
  onTabChange,
  displayMode,
  onDisplayModeChange,
  onSwitchMode,
}: AppTopBarProps) {
  const isCompact = displayMode === 'compact';

  const [jobs, setJobs] = useState<Job[]>([]);
  const [materials, setMaterials] = useState<MaterialRequest[]>([]);
  const [messages, setMessages] = useState<GeneralMessage[]>([]);

  useEffect(() => {
    const unsubJobs = subscribeToJobs((items) => {
      setJobs(items);
    });

    const unsubMaterials = subscribeToMaterials((items) => {
      setMaterials(items);
    });

    const unsubMessages = subscribeToGeneralMessages((items) => {
      setMessages(items);
    });

    return () => {
      unsubJobs();
      unsubMaterials();
      unsubMessages();
    };
  }, []);

  const jobsUnreadCount = useMemo(
    () =>
      jobs.reduce(
        (count, job) => count + job.textNotes.filter((note) => !note.read).length,
        0,
      ),
    [jobs],
  );

  const materialsMessagesUnreadCount = useMemo(() => {
    const materialsUnread = materials.filter((item) => item.unread).length;
    const messagesUnread = messages.filter((item) => item.unread).length;
    return materialsUnread + messagesUnread;
  }, [materials, messages]);

  return (
    <header
      style={{
        padding: isCompact ? 12 : 24,
        borderBottom: '1px solid #334155',
        background: '#020617',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: isCompact ? 8 : 18,
          marginBottom: isCompact ? 10 : 18,
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: isCompact ? 18 : 34,
            fontWeight: 800,
            lineHeight: 1.05,
          }}
        >
          Shop Floor
        </h1>

        <span
          style={{
            padding: isCompact ? '5px 10px' : '10px 18px',
            borderRadius: 999,
            background: '#1e40af',
            border: '1px solid #3b82f6',
            fontSize: isCompact ? 12 : 18,
            fontWeight: 700,
            color: '#dbeafe',
          }}
        >
          {modeLabel}
        </span>

        {isCompact ? (
          <span
            style={{
              padding: '5px 10px',
              borderRadius: 999,
              background: '#1d4ed8',
              border: '1px solid #60a5fa',
              fontSize: 11,
              fontWeight: 800,
              color: '#dbeafe',
            }}
          >
            Priority View
          </span>
        ) : null}
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: isCompact ? 10 : 18,
        }}
      >
        <TabBar
          selectedTab={selectedTab}
          onTabChange={onTabChange}
          compact={isCompact}
          jobsUnreadCount={jobsUnreadCount}
          materialsMessagesUnreadCount={materialsMessagesUnreadCount}
        />

        <ViewModeControl
          value={displayMode}
          onChange={onDisplayModeChange}
          compact={isCompact}
        />

        <button
          onClick={onSwitchMode}
          style={{
            border: '1px solid #475569',
            background: '#1e293b',
            color: '#f8fafc',
            borderRadius: isCompact ? 12 : 16,
            padding: isCompact ? '8px 12px' : '14px 26px',
            fontSize: isCompact ? 12 : 16,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Switch Mode
        </button>
      </div>
    </header>
  );
}

export default AppTopBar;