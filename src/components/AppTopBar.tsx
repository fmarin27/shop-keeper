import { useEffect, useMemo, useState } from 'react';
import type { DisplayMode, Job, MainTab } from '../types/app';
import TabBar from './TabBar';
import ViewModeControl from './ViewModeControl';
import { subscribeToJobs } from '../services/firebase/jobs';
import { subscribeToMaterials } from '../services/firebase/materials';
import { subscribeToGeneralMessages } from '../services/firebase/messages';
import type {
  GeneralMessage,
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
  onOpenAttentionJob,
  onOpenAttentionMaterial,
  onOpenAttentionMessage,
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
          onClick={onCheckForUpdates}
          style={{
            border: '1px solid #2563eb',
            background: '#1d4ed8',
            color: '#eff6ff',
            borderRadius: isCompact ? 12 : 16,
            padding: isCompact ? '8px 12px' : '14px 20px',
            fontSize: isCompact ? 12 : 16,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Check for Updates
        </button>

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
        padding: 16,
        borderRadius: 18,
        background: 'rgba(15,23,42,0.82)',
        border: '1px solid rgba(96,165,250,0.18)',
        boxShadow: '0 0 24px rgba(96,165,250,0.08)',
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
          <div style={{ fontSize: 18, fontWeight: 900, color: '#f8fafc' }}>
            Needs Attention
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
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
                border: '1px solid rgba(96,165,250,0.18)',
                background: 'rgba(2,6,23,0.56)',
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
              <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.35 }}>
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
            background: 'rgba(2,6,23,0.48)',
            border: '1px solid rgba(148,163,184,0.12)',
            color: '#94a3b8',
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
