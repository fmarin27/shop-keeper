import { useEffect, useMemo, useState } from 'react';
import type { DisplayMode, Job, MainTab } from '../types/app';
import TabBar from './TabBar';
import ViewModeControl from './ViewModeControl';
import { subscribeToJobs } from '../services/firebase/jobs';
import { subscribeToMaterials } from '../services/firebase/materials';
import { subscribeToGeneralMessages } from '../services/firebase/messages';
import type {
  GeneralMessage,
  MessageAudienceMode,
  MaterialRequest,
} from '../features/messages/types';

type AppTopBarProps = {
  modeLabel: 'Manager' | 'Tech';
  selectedTab: MainTab;
  onTabChange: (tab: MainTab) => void;
  displayMode: DisplayMode;
  onDisplayModeChange: (mode: DisplayMode) => void;
  onSwitchMode: () => void;
  onCheckForUpdates: () => void;
  updateStatus: string | null;
  updateButtonLabel: string;
  updateButtonDisabled: boolean;
  onOpenAttentionJob: (jobId: string) => void;
  onOpenAttentionMaterial: (itemId: string) => void;
  onOpenAttentionMessage: (itemId: string) => void;
};

function AppTopBar({
  modeLabel,
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
}: AppTopBarProps) {
  const isCompact = displayMode === 'compact';
  const appMode: MessageAudienceMode =
    modeLabel === 'Manager' ? 'manager' : 'tech';

  const [jobs, setJobs] = useState<Job[]>([]);
  const [materials, setMaterials] = useState<MaterialRequest[]>([]);
  const [messages, setMessages] = useState<GeneralMessage[]>([]);

  useEffect(() => {
    const unsubJobs = subscribeToJobs((items) => {
      setJobs(items);
    });

    const unsubMaterials = subscribeToMaterials(appMode, (items) => {
      setMaterials(items);
    });

    const unsubMessages = subscribeToGeneralMessages(appMode, (items) => {
      setMessages(items);
    });

    return () => {
      unsubJobs();
      unsubMaterials();
      unsubMessages();
    };
  }, [appMode]);

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

  const attentionItems = useMemo(() => {
    const jobNoteItems = jobs.flatMap((job) =>
      job.textNotes
        .filter((note) => !note.read)
        .map((note) => ({
          id: note.id,
          type: 'job' as const,
          itemId: job.id,
          label: 'Unread Job Note',
          title: job.vehicle,
          description: note.text ?? 'Unread audio note',
          createdAt: note.createdAt,
        })),
    );

    const partsItems = jobs
      .filter(
        (job) =>
          job.partsWaiting ||
          (job.partsRequests ?? []).some((part) => part.status !== 'received'),
      )
      .map((job) => {
        const nextPart = (job.partsRequests ?? []).find(
          (part) => part.status !== 'received',
        );
        return {
          id: `${job.id}-parts`,
          type: 'job' as const,
          itemId: job.id,
          label: nextPart?.status === 'ordered' ? 'Part Ordered' : 'Part Waiting',
          title: job.vehicle,
          description: nextPart
            ? `${nextPart.name} (${nextPart.quantity})`
            : 'Legacy parts waiting flag',
          createdAt: nextPart?.createdAt ?? '',
        };
      });

    const materialItems = materials
      .filter((item) => item.unread)
      .map((item) => ({
        id: item.id,
        type: 'material' as const,
        itemId: item.id,
        label: 'Material Request',
        title: item.itemName,
        description: `${item.quantity}${item.note ? ` • ${item.note}` : ''}`,
        createdAt: item.createdAt,
      }));

    const messageItems = messages
      .filter((item) => item.unread)
      .map((item) => ({
        id: item.id,
        type: 'message' as const,
        itemId: item.id,
        label: item.type === 'audio' ? 'Audio Message' : 'Message',
        title: item.type === 'audio' ? 'Unread audio message' : item.text,
        description: 'Unread general message',
        createdAt: item.createdAt,
      }));

    return [...jobNoteItems, ...partsItems, ...materialItems, ...messageItems]
      .sort((a, b) => Date.parse(b.createdAt || '1970-01-01') - Date.parse(a.createdAt || '1970-01-01'))
      .slice(0, 6);
  }, [jobs, materials, messages]);

  return (
    <header
      style={{
        padding: isCompact ? 12 : 24,
        borderBottom: '2px solid rgba(148,163,184,0.36)',
        background: 'linear-gradient(180deg, rgba(44,60,82,0.98), rgba(33,46,65,0.98))',
        boxShadow: '0 14px 34px rgba(0,0,0,0.16)',
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
            background: '#315aab',
            border: '1px solid #7fb0ff',
            fontSize: isCompact ? 12 : 18,
            fontWeight: 700,
            color: '#eef6ff',
          }}
        >
          {modeLabel}
        </span>

        {isCompact ? (
          <span
            style={{
              padding: '5px 10px',
              borderRadius: 999,
              background: '#315aab',
              border: '1px solid #7fb0ff',
              fontSize: 11,
              fontWeight: 800,
              color: '#eef6ff',
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
          onClick={onCheckForUpdates}
          disabled={updateButtonDisabled}
          style={{
            border: '1px solid #2563eb',
            background: updateButtonDisabled ? '#61748f' : '#3865bb',
            color: '#f7fbff',
            borderRadius: isCompact ? 12 : 16,
            padding: isCompact ? '8px 12px' : '14px 20px',
            fontSize: isCompact ? 12 : 16,
            fontWeight: 700,
            cursor: updateButtonDisabled ? 'not-allowed' : 'pointer',
            opacity: updateButtonDisabled ? 0.8 : 1,
          }}
        >
          {updateButtonLabel}
        </button>

        <button
          onClick={onSwitchMode}
          style={{
            border: '1px solid #7f93ab',
            background: '#435267',
            color: '#f8fbff',
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

      {updateStatus ? (
        <div
          style={{
            marginTop: isCompact ? 10 : 14,
            fontSize: isCompact ? 11 : 13,
            color: '#bfdbfe',
            fontWeight: 600,
          }}
        >
          {updateStatus}
        </div>
      ) : null}

      {!isCompact ? (
        <AttentionPanel
          items={attentionItems}
          onOpenJob={onOpenAttentionJob}
          onOpenMaterial={onOpenAttentionMaterial}
          onOpenMessage={onOpenAttentionMessage}
        />
      ) : null}
    </header>
  );
}

function AttentionPanel({
  items,
  onOpenJob,
  onOpenMaterial,
  onOpenMessage,
}: {
  items: Array<{
    id: string;
    type: 'job' | 'material' | 'message';
    itemId: string;
    label: string;
    title: string;
    description: string;
  }>;
  onOpenJob: (jobId: string) => void;
  onOpenMaterial: (itemId: string) => void;
  onOpenMessage: (itemId: string) => void;
}) {
  return (
        <div
          style={{
            marginTop: 18,
            padding: 18,
            borderRadius: 18,
            background: 'rgba(57,74,97,0.96)',
            border: '2px solid rgba(168,184,204,0.34)',
            boxShadow: '0 0 24px rgba(96,165,250,0.06), inset 0 0 0 1px rgba(255,255,255,0.05)',
          }}
        >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          alignItems: 'center',
          marginBottom: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span
              style={{
                borderRadius: 999,
                padding: '7px 12px',
                background:
                  'linear-gradient(180deg, rgba(37,99,235,0.26), rgba(29,78,216,0.36))',
                border: '1px solid rgba(147,197,253,0.42)',
                color: '#eff6ff',
                fontSize: 12,
                fontWeight: 900,
                letterSpacing: 0.8,
                textTransform: 'uppercase',
              }}
            >
              Attention
            </span>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#f8fafc' }}>
              Needs Attention
            </div>
          </div>
          <div style={{ fontSize: 12, color: '#d2dceb', marginTop: 4 }}>
            Unread notes, waiting parts, unread materials, and unread messages.
          </div>
        </div>
      </div>

      {items.length ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 10,
          }}
        >
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                if (item.type === 'job') {
                  onOpenJob(item.itemId);
                  return;
                }

                if (item.type === 'material') {
                  onOpenMaterial(item.itemId);
                  return;
                }

                onOpenMessage(item.itemId);
              }}
              style={{
                border: '2px solid rgba(168,184,204,0.3)',
                background: 'rgba(39,53,73,0.98)',
                color: '#f8fafc',
                borderRadius: 16,
                padding: '12px 13px',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 900,
                  color: '#93c5fd',
                  marginBottom: 6,
                  textTransform: 'uppercase',
                  letterSpacing: 0.4,
                }}
              >
                {item.label}
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 6 }}>
                {item.title}
              </div>
              <div style={{ fontSize: 12, color: '#e3eaf4', lineHeight: 1.35 }}>
                {item.description}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div
          style={{
            borderRadius: 14,
            padding: '12px 14px',
            background: 'rgba(39,53,73,0.98)',
            border: '2px solid rgba(168,184,204,0.3)',
            color: '#d2dceb',
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          Nothing new needs attention right now.
        </div>
      )}
    </div>
  );
}

export default AppTopBar;
