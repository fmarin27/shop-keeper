import { useEffect, useMemo, useState } from 'react';
import { subscribeToJobs } from '../services/firebase/jobs';
import { subscribeToMaterials } from '../services/firebase/materials';
import { subscribeToGeneralMessages } from '../services/firebase/messages';
import type { Job } from '../types/app';
import type {
  GeneralMessage,
  MaterialRequest,
} from '../features/messages/types';
import type { AppMode } from '../types/app';

type OverlayViewProps = {
  appMode: AppMode;
  onExpand: () => void;
  onOpenJobs: () => void;
  onOpenMaterialsMessages: () => void;
  onOpenJob: (jobId: string) => void;
  onOpenMaterial: (itemId: string) => void;
  onOpenMessage: (itemId: string) => void;
  onClose: () => void;
};

type OverlayActivity = {
  id: string;
  kind: 'job' | 'material' | 'message';
  itemId: string;
  label: string;
  text: string;
  createdAt: string;
};

export default function OverlayView({
  appMode,
  onExpand,
  onOpenJobs,
  onOpenMaterialsMessages,
  onOpenJob,
  onOpenMaterial,
  onOpenMessage,
  onClose,
}: OverlayViewProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [materials, setMaterials] = useState<MaterialRequest[]>([]);
  const [messages, setMessages] = useState<GeneralMessage[]>([]);

  useEffect(() => {
    const unsubJobs = subscribeToJobs(setJobs);
    const unsubMaterials = subscribeToMaterials(appMode, setMaterials);
    const unsubMessages = subscribeToGeneralMessages(appMode, setMessages);

    return () => {
      unsubJobs();
      unsubMaterials();
      unsubMessages();
    };
  }, [appMode]);

  const unreadJobNotesCount = useMemo(
    () =>
      jobs.reduce(
        (count, job) => count + job.textNotes.filter((note) => !note.read).length,
        0,
      ),
    [jobs],
  );

  const topPriorityJob = useMemo(
    () =>
      jobs.find((job) => !job.done) ??
      null,
    [jobs],
  );

  const unreadActivities = useMemo(() => {
    const jobItems: OverlayActivity[] = jobs.flatMap((job) =>
      job.textNotes
        .filter((note) => !note.read)
        .map((note) => ({
          id: note.id,
          itemId: job.id,
          kind: 'job' as const,
          label: 'Job Note',
          text: `${job.vehicle || 'Unnamed job'} has an unread note`,
          createdAt: note.createdAt,
        })),
    );

    const materialItems: OverlayActivity[] = materials
      .filter((item) => item.unread)
      .map((item) => ({
        id: item.id,
        itemId: item.id,
        kind: 'material' as const,
        label: 'Material',
        text: `${item.itemName} requested${item.quantity ? ` x${item.quantity}` : ''}`,
        createdAt: item.createdAt,
      }));

    const messageItems: OverlayActivity[] = messages
      .filter((item) => item.unread)
      .map((item) => ({
        id: item.id,
        itemId: item.id,
        kind: 'message' as const,
        label: 'Message',
        text: item.type === 'audio' ? 'Unread audio message' : item.text,
        createdAt: item.createdAt,
      }));

    return [...jobItems, ...materialItems, ...messageItems]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 4);
  }, [jobs, materials, messages]);

  const unreadActivityCount = unreadActivities.length;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'transparent',
        padding: 12,
        boxSizing: 'border-box',
        fontFamily: 'Segoe UI, Inter, sans-serif',
        color: '#f8fafc',
      }}
    >
      <div
        style={{
          borderRadius: 22,
          padding: 14,
          background: 'rgba(2, 6, 23, 0.42)',
          border: '1px solid rgba(96, 165, 250, 0.18)',
          boxShadow: '0 18px 50px rgba(0,0,0,0.28)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)' as any,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 12,
            WebkitAppRegion: 'drag' as any,
          }}
        >
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.05 }}>
              Shop Floor
            </div>
            <div
              style={{
                marginTop: 5,
                fontSize: 12,
                color: 'rgba(226,232,240,0.82)',
              }}
            >
              {appMode === 'manager' ? 'Manager' : 'Tech'} Overlay
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 8,
              WebkitAppRegion: 'no-drag' as any,
            }}
          >
            <button onClick={onExpand} style={buttonStyle(true)}>
              Expand
            </button>
            <button onClick={onClose} style={buttonStyle(false)}>
              Close
            </button>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gap: 10,
            WebkitAppRegion: 'no-drag' as any,
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 8,
            }}
          >
            <button type="button" onClick={onOpenJobs} style={miniStatButtonStyle()}>
              <MiniStat label="Unread Job Notes" value={String(unreadJobNotesCount)} glow />
            </button>
            <button
              type="button"
              onClick={onOpenMaterialsMessages}
              style={miniStatButtonStyle()}
            >
              <MiniStat
                label="Unread Activity"
                value={String(unreadActivityCount)}
                glow={unreadActivityCount > 0}
              />
            </button>
            <button type="button" onClick={onExpand} style={miniStatButtonStyle()}>
              <MiniStat label="Mode" value={appMode === 'manager' ? 'Manager' : 'Tech'} />
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              if (topPriorityJob) {
                onOpenJob(topPriorityJob.id);
                return;
              }
              onOpenJobs();
            }}
            style={{
              ...panelButtonStyle(),
              textAlign: 'left',
            }}
          >
            {topPriorityJob ? (
              <>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 10,
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                    marginBottom: 8,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>
                      Top Priority Job
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.15 }}>
                      {topPriorityJob.vehicle}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: 'rgba(226,232,240,0.78)',
                        marginTop: 4,
                      }}
                    >
                      RO {topPriorityJob.roNumber}
                    </div>
                  </div>

                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      padding: '5px 9px',
                      borderRadius: 999,
                      background: 'rgba(37,99,235,0.2)',
                      border: '1px solid rgba(96,165,250,0.24)',
                      color: '#dbeafe',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {formatJobStatus(topPriorityJob.status)}
                  </span>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                    gap: 8,
                    marginBottom: 10,
                  }}
                >
                  <InfoTile
                    label="Paint"
                    value={topPriorityJob.paintCode || 'Not set'}
                  />
                  <InfoTile
                    label="Amount"
                    value={`$${topPriorityJob.amount.toLocaleString()} - ${formatAmountStatus(
                      topPriorityJob.amountStatus,
                    )}`}
                  />
                  <InfoTile
                    label="Promise"
                    value={topPriorityJob.promiseDate || 'Not set'}
                  />
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 10,
                    alignItems: 'center',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {hasPartsWaiting(topPriorityJob) ? (
                      <span style={chipStyle('warning')}>
                        {getPartsWorkflowSummary(topPriorityJob)}
                      </span>
                    ) : null}
                    <span style={chipStyle('neutral')}>
                      {getPartsReceiptSummary(topPriorityJob)}
                    </span>
                    {topPriorityJob.textNotes.some((note) => !note.read) ? (
                      <span style={chipStyle('glow')}>Unread Note</span>
                    ) : null}
                  </div>

                  <span style={inlineActionStyle()}>Open Full View</span>
                </div>
              </>
            ) : (
              <EmptyState
                title="No active jobs"
                description="Open the jobs view to add or manage work."
                action="Open Jobs"
              />
            )}
          </button>

          <div style={panelStyle()}>
            <div
              style={{
                fontSize: 12,
                opacity: 0.82,
                marginBottom: 8,
              }}
            >
              Unread Activity
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              {unreadActivities.length > 0 ? (
                unreadActivities.map((item) => (
                  <button
                    key={`${item.kind}-${item.id}`}
                    type="button"
                    onClick={() => {
                      if (item.kind === 'job') {
                        onOpenJob(item.itemId);
                        return;
                      }

                      if (item.kind === 'material') {
                        onOpenMaterial(item.itemId);
                        return;
                      }

                      onOpenMessage(item.itemId);
                    }}
                    style={activityButtonStyle()}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 800,
                          color: '#93c5fd',
                          marginBottom: 3,
                        }}
                      >
                        {item.label}
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          color: '#f8fafc',
                          fontWeight: 600,
                          lineHeight: 1.2,
                          textAlign: 'left',
                        }}
                      >
                        {item.text}
                      </div>
                    </div>

                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        color: '#93c5fd',
                        textShadow: '0 0 8px rgba(96,165,250,0.4)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Open
                    </span>
                  </button>
                ))
              ) : (
                <button
                  type="button"
                  onClick={onOpenMaterialsMessages}
                  style={activityButtonStyle()}
                >
                  <EmptyState
                    title="No unread activity"
                    description="Materials requests and messages will show up here."
                    action="Open Messages"
                  />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action: string;
}) {
  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>{title}</div>
      <div
        style={{
          fontSize: 12,
          color: 'rgba(226,232,240,0.78)',
          lineHeight: 1.35,
          marginBottom: 8,
        }}
      >
        {description}
      </div>
      <span style={inlineActionStyle()}>{action}</span>
    </div>
  );
}

function MiniStat({
  label,
  value,
  glow = false,
}: {
  label: string;
  value: string;
  glow?: boolean;
}) {
  return (
    <div
      style={{
        borderRadius: 14,
        padding: '10px 11px',
        background: glow ? 'rgba(37,99,235,0.18)' : 'rgba(15,23,42,0.28)',
        border: glow
          ? '1px solid rgba(96,165,250,0.22)'
          : '1px solid rgba(148,163,184,0.12)',
        boxShadow: glow ? '0 0 16px rgba(96,165,250,0.12)' : 'none',
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          color: 'rgba(226,232,240,0.72)',
          marginBottom: 4,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          textAlign: 'left',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 900,
          color: '#f8fafc',
          lineHeight: 1,
          textAlign: 'left',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function InfoTile({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        borderRadius: 12,
        padding: '9px 10px',
        background: 'rgba(2,6,23,0.26)',
        border: '1px solid rgba(148,163,184,0.1)',
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          color: 'rgba(226,232,240,0.68)',
          marginBottom: 4,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          textAlign: 'left',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: '#f8fafc',
          lineHeight: 1.15,
          textAlign: 'left',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function panelStyle(): React.CSSProperties {
  return {
    borderRadius: 16,
    padding: 12,
    background: 'rgba(15,23,42,0.30)',
    border: '1px solid rgba(148,163,184,0.14)',
  };
}

function panelButtonStyle(): React.CSSProperties {
  return {
    ...panelStyle(),
    cursor: 'pointer',
    width: '100%',
  };
}

function miniStatButtonStyle(): React.CSSProperties {
  return {
    border: 'none',
    padding: 0,
    background: 'transparent',
    cursor: 'pointer',
  };
}

function activityButtonStyle(): React.CSSProperties {
  return {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 10,
    alignItems: 'center',
    borderRadius: 12,
    padding: '10px 11px',
    background: 'rgba(2,6,23,0.28)',
    border: '1px solid rgba(148,163,184,0.12)',
    cursor: 'pointer',
    color: '#f8fafc',
    width: '100%',
    textAlign: 'left',
  };
}

function chipStyle(kind: 'warning' | 'glow' | 'neutral'): React.CSSProperties {
  if (kind === 'warning') {
    return {
      fontSize: 11,
      fontWeight: 800,
      color: '#fde68a',
      background: 'rgba(180,83,9,0.18)',
      border: '1px solid rgba(251,191,36,0.2)',
      borderRadius: 999,
      padding: '5px 8px',
      whiteSpace: 'nowrap',
    };
  }

  if (kind === 'neutral') {
    return {
      fontSize: 11,
      fontWeight: 800,
      color: '#cbd5e1',
      background: 'rgba(30,41,59,0.72)',
      border: '1px solid rgba(148,163,184,0.16)',
      borderRadius: 999,
      padding: '5px 8px',
      whiteSpace: 'nowrap',
    };
  }

  return {
    fontSize: 11,
    fontWeight: 800,
    color: '#93c5fd',
    background: 'rgba(37,99,235,0.18)',
    border: '1px solid rgba(96,165,250,0.22)',
    borderRadius: 999,
    padding: '5px 8px',
    whiteSpace: 'nowrap',
    textShadow: '0 0 8px rgba(96,165,250,0.35)',
  };
}

function inlineActionStyle(): React.CSSProperties {
  return {
    border: '1px solid rgba(96,165,250,0.28)',
    background: 'rgba(37,99,235,0.2)',
    color: '#eff6ff',
    borderRadius: 12,
    padding: '8px 11px',
    fontSize: 12,
    fontWeight: 800,
    display: 'inline-block',
  };
}

function buttonStyle(primary: boolean): React.CSSProperties {
  return {
    border: primary
      ? '1px solid rgba(96,165,250,0.48)'
      : '1px solid rgba(148,163,184,0.22)',
    background: primary ? 'rgba(37,99,235,0.28)' : 'rgba(30,41,59,0.56)',
    color: '#f8fafc',
    borderRadius: 12,
    padding: '8px 12px',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  };
}

function formatJobStatus(status: Job['status']): string {
  switch (status) {
    case 'notStarted':
      return 'Not Started';
    case 'inProgress':
      return 'In Progress';
    case 'waiting':
      return 'Waiting';
    case 'done':
      return 'Done';
    default:
      return status;
  }
}

function formatAmountStatus(status: Job['amountStatus']): string {
  return status === 'final' ? 'Final' : 'Not Final';
}

function hasPartsWaiting(job: Job): boolean {
  return (
    job.partsWaiting ||
    (job.partsRequests ?? []).some((part) => part.status !== 'received')
  );
}

function getPartsWorkflowSummary(job: Job) {
  if (!job.partsRequests.length) {
    return job.partsWaiting ? 'Waiting on parts' : 'No parts needed';
  }

  return hasPartsWaiting(job) ? 'Waiting on parts' : 'All parts received';
}

function getPartsReceiptSummary(job: Job) {
  if (!job.partsRequests.length) {
    return job.partsWaiting ? 'No parts listed yet' : 'No parts needed';
  }

  const receivedCount = job.partsRequests.filter(
    (part) => part.status === 'received',
  ).length;

  if (receivedCount === 0) {
    return 'No parts are in';
  }

  if (receivedCount === job.partsRequests.length) {
    return 'All parts are in';
  }

  return 'Some parts are in';
}
