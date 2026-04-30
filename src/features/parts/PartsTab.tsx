import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { AppMode, Job, JobPartRequest, JobPartStatus } from '../../types/app';
import {
  markJobPartReceived,
  saveJobPartNote,
  subscribeToJobs,
  updateJobPartStatus,
} from '../../services/firebase/jobs';

type PartsTabProps = {
  appMode: AppMode;
  compact?: boolean;
  mobile?: boolean;
  onOpenJob?: (jobId: string) => void;
};

type PartBoardRow = {
  job: Job;
  part: JobPartRequest;
};

type FilterMode = 'open' | 'requested' | 'ordered' | 'reorderNeeded' | 'received' | 'all';

const FILTERS: Array<{ value: FilterMode; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'requested', label: 'Requested' },
  { value: 'ordered', label: 'Ordered' },
  { value: 'reorderNeeded', label: 'Reorder' },
  { value: 'received', label: 'Received' },
  { value: 'all', label: 'All' },
];

function PartsTab({ appMode, compact = false, mobile = false, onOpenJob }: PartsTabProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterMode>('open');
  const [savingPartId, setSavingPartId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToJobs((items) => {
      setJobs(items);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const allParts = useMemo(
    () =>
      jobs.flatMap((job) =>
        (job.partsRequests ?? []).map((part) => ({
          job,
          part,
        })),
      ),
    [jobs],
  );

  const visibleParts = useMemo(() => {
    if (filter === 'all') {
      return allParts;
    }

    if (filter === 'open') {
      return allParts.filter(({ job, part }) => !job.done && part.status !== 'received');
    }

    return allParts.filter(({ part }) => part.status === filter);
  }, [allParts, filter]);

  const stats = useMemo(() => {
    const open = allParts.filter(({ job, part }) => !job.done && part.status !== 'received').length;
    const ordered = allParts.filter(({ part }) => part.status === 'ordered').length;
    const received = allParts.filter(({ part }) => part.status === 'received').length;
    const reorderNeeded = allParts.filter(({ part }) => part.status === 'reorderNeeded').length;

    return {
      open,
      ordered,
      received,
      reorderNeeded,
      total: allParts.length,
    };
  }, [allParts]);

  const legacyWaitingJobs = useMemo(
    () =>
      jobs.filter(
        (job) => !job.done && job.partsWaiting && !(job.partsRequests ?? []).length,
      ),
    [jobs],
  );

  const updateStatus = async (
    job: Job,
    part: JobPartRequest,
    status: JobPartStatus,
  ) => {
    setSavingPartId(part.id);
    try {
      if (status === 'received') {
        await markJobPartReceived(job, part.id);
      } else {
        await updateJobPartStatus(job, part.id, status);
      }
    } finally {
      setSavingPartId(null);
    }
  };

  const saveNote = async (job: Job, part: JobPartRequest, note: string) => {
    if ((part.note ?? '') === note) {
      return;
    }

    setSavingPartId(part.id);
    try {
      await saveJobPartNote(job, part.id, note);
    } finally {
      setSavingPartId(null);
    }
  };

  if (loading) {
    return (
      <section style={panelStyle(compact)}>
        <div style={titleStyle(compact)}>Loading parts...</div>
      </section>
    );
  }

  return (
    <section style={{ display: 'grid', gap: compact ? 12 : 18 }}>
      <div style={panelStyle(compact)}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h2 style={titleStyle(compact)}>Parts Board</h2>
            <p style={subtitleStyle(compact)}>
              Cross-job parts status, tied back to the priority job list.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(4, minmax(92px, 1fr))',
              gap: compact ? 8 : 10,
              minWidth: mobile ? '100%' : 440,
            }}
          >
            <Metric label="Open" value={stats.open} compact={compact} tone="blue" />
            <Metric label="Ordered" value={stats.ordered} compact={compact} tone="amber" />
            <Metric label="Received" value={stats.received} compact={compact} tone="green" />
            <Metric label="Reorder" value={stats.reorderNeeded} compact={compact} tone="red" />
          </div>
        </div>
      </div>

      <div style={panelStyle(compact)}>
        <div
          style={{
            display: 'flex',
            gap: compact ? 8 : 10,
            flexWrap: 'wrap',
            marginBottom: compact ? 12 : 16,
          }}
        >
          {FILTERS.map((item) => (
            <button
              key={item.value}
              onClick={() => setFilter(item.value)}
              style={filterButtonStyle(filter === item.value, compact)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {legacyWaitingJobs.length && filter === 'open' ? (
          <div style={legacyBannerStyle(compact)}>
            {legacyWaitingJobs.length} job{legacyWaitingJobs.length === 1 ? '' : 's'} still use the old
            waiting-on-parts flag without listed parts. Open the job to add the missing part detail.
          </div>
        ) : null}

        {visibleParts.length ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: mobile
                ? '1fr'
                : 'minmax(210px, 1.1fr) minmax(220px, 1.4fr) 140px 150px minmax(180px, 1fr)',
              gap: compact ? 8 : 10,
              alignItems: 'stretch',
            }}
          >
            {!mobile ? (
              <>
                <HeaderCell compact={compact}>Job</HeaderCell>
                <HeaderCell compact={compact}>Part</HeaderCell>
                <HeaderCell compact={compact}>Quantity</HeaderCell>
                <HeaderCell compact={compact}>Status</HeaderCell>
                <HeaderCell compact={compact}>Note</HeaderCell>
              </>
            ) : null}

            {visibleParts.map(({ job, part }) => (
              <PartRow
                key={`${job.id}-${part.id}`}
                appMode={appMode}
                job={job}
                part={part}
                compact={compact}
                mobile={mobile}
                saving={savingPartId === part.id}
                onOpenJob={onOpenJob}
                onUpdateStatus={updateStatus}
                onSaveNote={saveNote}
              />
            ))}
          </div>
        ) : (
          <div style={emptyStateStyle(compact)}>
            No parts match this view.
          </div>
        )}
      </div>
    </section>
  );
}

function PartRow({
  appMode,
  job,
  part,
  compact,
  mobile,
  saving,
  onOpenJob,
  onUpdateStatus,
  onSaveNote,
}: {
  appMode: AppMode;
  job: Job;
  part: JobPartRequest;
  compact: boolean;
  mobile: boolean;
  saving: boolean;
  onOpenJob?: (jobId: string) => void;
  onUpdateStatus: (job: Job, part: JobPartRequest, status: JobPartStatus) => Promise<void>;
  onSaveNote: (job: Job, part: JobPartRequest, note: string) => Promise<void>;
}) {
  const disabled = saving;
  const jobMeta = [
    job.roNumber ? `RO ${job.roNumber}` : '',
    job.claimNumber ? `Claim ${job.claimNumber}` : '',
    job.insuranceCompany ?? '',
  ].filter(Boolean).join(' | ');

  return (
    <>
      <div style={cellStyle(compact, mobile)}>
        <button
          onClick={() => onOpenJob?.(job.id)}
          style={jobButtonStyle(compact)}
          disabled={!onOpenJob}
        >
          {job.vehicle || 'Untitled job'}
        </button>
        <div style={mutedStyle(compact)}>{job.customerName || 'No customer'}</div>
        <div style={mutedStyle(compact)}>{jobMeta || 'No claim summary'}</div>
      </div>

      <div style={cellStyle(compact, mobile)}>
        <div style={{ fontWeight: 900, color: '#f8fafc' }}>{part.name}</div>
        <div style={mutedStyle(compact)}>
          Requested by {part.requestedBy === 'tech' ? 'Tech' : 'Manager'}
          {part.requestedBy !== appMode ? ' | other mode' : ''}
        </div>
      </div>

      <div style={cellStyle(compact, mobile)}>
        <div style={{ fontWeight: 800 }}>{part.quantity}</div>
      </div>

      <div style={cellStyle(compact, mobile)}>
        <select
          value={part.status}
          disabled={disabled}
          onChange={(event) => void onUpdateStatus(job, part, event.target.value as JobPartStatus)}
          style={selectStyle(compact)}
        >
          <option value="requested">Requested</option>
          <option value="ordered">Ordered</option>
          <option value="reorderNeeded">Reorder Needed</option>
          <option value="received">Received</option>
        </select>
      </div>

      <div style={cellStyle(compact, mobile)}>
        <input
          defaultValue={part.note ?? ''}
          disabled={disabled}
          placeholder="Add vendor, ETA, or issue"
          onBlur={(event) => void onSaveNote(job, part, event.target.value)}
          style={inputStyle(compact)}
        />
      </div>
    </>
  );
}

function Metric({
  label,
  value,
  compact,
  tone,
}: {
  label: string;
  value: number;
  compact: boolean;
  tone: 'blue' | 'amber' | 'green' | 'red';
}) {
  const colors = {
    blue: '#93c5fd',
    amber: '#fbbf24',
    green: '#86efac',
    red: '#fca5a5',
  };

  return (
    <div
      style={{
        borderRadius: compact ? 12 : 16,
        border: '1px solid rgba(148,163,184,0.2)',
        background: 'rgba(15,23,42,0.46)',
        padding: compact ? '8px 10px' : '12px 14px',
      }}
    >
      <div style={{ color: '#94a3b8', fontSize: compact ? 10 : 12, fontWeight: 800 }}>
        {label}
      </div>
      <div style={{ color: colors[tone], fontSize: compact ? 20 : 28, fontWeight: 950 }}>
        {value}
      </div>
    </div>
  );
}

function HeaderCell({ children, compact }: { children: ReactNode; compact: boolean }) {
  return (
    <div
      style={{
        color: '#93a4ba',
        fontSize: compact ? 10 : 11,
        fontWeight: 900,
        textTransform: 'uppercase',
        letterSpacing: 0,
        padding: '0 4px',
      }}
    >
      {children}
    </div>
  );
}

function panelStyle(compact: boolean): CSSProperties {
  return {
    borderRadius: compact ? 16 : 24,
    padding: compact ? 14 : 22,
    background: 'rgba(15,23,42,0.78)',
    border: '1px solid rgba(148,163,184,0.18)',
    boxShadow: '0 22px 50px rgba(0,0,0,0.22)',
  };
}

function titleStyle(compact: boolean): CSSProperties {
  return {
    margin: 0,
    color: '#f8fafc',
    fontSize: compact ? 18 : 28,
    fontWeight: 950,
    lineHeight: 1.05,
  };
}

function subtitleStyle(compact: boolean): CSSProperties {
  return {
    margin: compact ? '5px 0 0' : '8px 0 0',
    color: '#cbd5e1',
    fontSize: compact ? 12 : 14,
    fontWeight: 600,
  };
}

function filterButtonStyle(active: boolean, compact: boolean): CSSProperties {
  return {
    border: active ? '1px solid #93c5fd' : '1px solid rgba(148,163,184,0.28)',
    background: active ? '#1d4ed8' : 'rgba(15,23,42,0.5)',
    color: '#f8fafc',
    borderRadius: compact ? 12 : 14,
    padding: compact ? '8px 12px' : '10px 16px',
    fontSize: compact ? 12 : 13,
    fontWeight: 800,
    cursor: 'pointer',
  };
}

function legacyBannerStyle(compact: boolean): CSSProperties {
  return {
    marginBottom: compact ? 10 : 14,
    borderRadius: compact ? 12 : 14,
    border: '1px solid rgba(251,191,36,0.42)',
    background: 'rgba(146,64,14,0.22)',
    color: '#fde68a',
    padding: compact ? '9px 10px' : '12px 14px',
    fontSize: compact ? 12 : 13,
    fontWeight: 800,
  };
}

function cellStyle(compact: boolean, mobile: boolean): CSSProperties {
  return {
    minHeight: compact ? 54 : 68,
    borderRadius: compact ? 12 : 14,
    border: '1px solid rgba(148,163,184,0.16)',
    background: 'rgba(30,41,59,0.62)',
    padding: compact ? 10 : 12,
    color: '#e5e7eb',
    fontSize: compact ? 12 : 13,
    ...(mobile ? { minWidth: 0 } : null),
  };
}

function jobButtonStyle(compact: boolean): CSSProperties {
  return {
    appearance: 'none',
    border: 0,
    background: 'transparent',
    color: '#bfdbfe',
    fontSize: compact ? 13 : 15,
    fontWeight: 900,
    padding: 0,
    margin: 0,
    textAlign: 'left',
    cursor: 'pointer',
  };
}

function mutedStyle(compact: boolean): CSSProperties {
  return {
    marginTop: 4,
    color: '#94a3b8',
    fontSize: compact ? 11 : 12,
    fontWeight: 650,
  };
}

function selectStyle(compact: boolean): CSSProperties {
  return {
    width: '100%',
    borderRadius: compact ? 10 : 12,
    border: '1px solid rgba(148,163,184,0.34)',
    background: '#0f172a',
    color: '#f8fafc',
    padding: compact ? '7px 8px' : '9px 10px',
    fontSize: compact ? 12 : 13,
    fontWeight: 800,
  };
}

function inputStyle(compact: boolean): CSSProperties {
  return {
    width: '100%',
    boxSizing: 'border-box',
    borderRadius: compact ? 10 : 12,
    border: '1px solid rgba(148,163,184,0.32)',
    background: '#0f172a',
    color: '#f8fafc',
    padding: compact ? '7px 8px' : '9px 10px',
    fontSize: compact ? 12 : 13,
    fontWeight: 650,
  };
}

function emptyStateStyle(compact: boolean): CSSProperties {
  return {
    borderRadius: compact ? 14 : 18,
    border: '1px dashed rgba(148,163,184,0.25)',
    background: 'rgba(15,23,42,0.38)',
    color: '#cbd5e1',
    padding: compact ? 16 : 28,
    fontSize: compact ? 13 : 16,
    fontWeight: 800,
    textAlign: 'center',
  };
}

export default PartsTab;
