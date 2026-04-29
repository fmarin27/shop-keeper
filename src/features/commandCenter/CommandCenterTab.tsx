import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { subscribeToJobs } from '../../services/firebase/jobs';
import type { Job } from '../../types/app';

type CommandCenterTabProps = {
  compact?: boolean;
  mobile?: boolean;
};

type ViewFilter = 'active' | 'closed' | 'all';

function CommandCenterTab({
  compact = false,
  mobile = false,
}: CommandCenterTabProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Job['status']>('all');
  const [viewFilter, setViewFilter] = useState<ViewFilter>('active');

  useEffect(() => {
    const unsubscribe = subscribeToJobs((items) => {
      setJobs(items);
    });

    return () => unsubscribe();
  }, []);

  const filteredJobs = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return jobs.filter((job) => {
      if (viewFilter === 'active' && job.done) {
        return false;
      }

      if (viewFilter === 'closed' && !job.done) {
        return false;
      }

      if (statusFilter !== 'all' && job.status !== statusFilter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return [
        job.roNumber,
        job.customerName,
        job.vehicle,
        job.phoneNumber,
        job.mitchellInsuranceCompany ?? '',
        job.mitchellClaimNumber ?? '',
        job.mitchellLeadTechName ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [jobs, search, statusFilter, viewFilter]);

  useEffect(() => {
    if (!filteredJobs.length) {
      setSelectedJobId(null);
      return;
    }

    if (!selectedJobId || !filteredJobs.some((job) => job.id === selectedJobId)) {
      setSelectedJobId(filteredJobs[0]?.id ?? null);
    }
  }, [filteredJobs, selectedJobId]);

  const selectedJob = filteredJobs.find((job) => job.id === selectedJobId) ?? null;
  const activeCount = jobs.filter((job) => !job.done).length;
  const closedCount = jobs.filter((job) => job.done).length;
  const supplementCount = jobs.filter((job) => job.status === 'supplementNeeded').length;
  const appraiserCount = jobs.filter((job) => job.status === 'waitingOnAppraiser').length;

  return (
    <section
      style={{
        display: 'grid',
        gap: mobile ? 12 : 16,
      }}
    >
      <div
        style={{
          borderRadius: 24,
          border: '2px solid rgba(196,207,223,0.42)',
          background: 'linear-gradient(180deg, rgba(74,92,119,0.97), rgba(48,63,85,0.97))',
          padding: mobile ? 14 : compact ? 16 : 22,
          boxShadow: '0 18px 42px rgba(0,0,0,0.16)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
            alignItems: 'center',
            marginBottom: mobile ? 12 : 16,
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: mobile ? 22 : 30,
                fontWeight: 900,
                color: '#f8fbff',
              }}
            >
              RO Command Center
            </h2>
            <div
              style={{
                marginTop: 6,
                color: '#d8e4f5',
                fontSize: mobile ? 12 : 14,
                fontWeight: 600,
              }}
            >
              Desktop-first production board for repair orders, schedules, claims, and customer detail.
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: mobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(130px, 1fr))',
              gap: 10,
              width: mobile ? '100%' : 'auto',
              minWidth: mobile ? undefined : 560,
            }}
          >
            <SummaryCard label="Active ROs" value={String(activeCount)} tone="blue" />
            <SummaryCard label="Closed ROs" value={String(closedCount)} tone="slate" />
            <SummaryCard label="Supplements" value={String(supplementCount)} tone="amber" />
            <SummaryCard label="Appraiser Wait" value={String(appraiserCount)} tone="green" />
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: mobile ? '1fr' : 'minmax(0, 1.8fr) minmax(300px, 0.9fr)',
            gap: mobile ? 14 : 18,
          }}
        >
          <div
            style={{
              borderRadius: 20,
              border: '1px solid rgba(173,188,208,0.25)',
              background: 'rgba(8,16,28,0.38)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 10,
                padding: 14,
                borderBottom: '1px solid rgba(173,188,208,0.16)',
                background: 'rgba(18,28,44,0.48)',
              }}
            >
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search RO, customer, vehicle, phone, insurance..."
                style={filterInputStyle()}
              />

              <select
                value={viewFilter}
                onChange={(event) => setViewFilter(event.target.value as ViewFilter)}
                style={filterSelectStyle()}
              >
                <option value="active">Active Only</option>
                <option value="closed">Closed Only</option>
                <option value="all">All Jobs</option>
              </select>

              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as 'all' | Job['status'])}
                style={filterSelectStyle()}
              >
                <option value="all">All Statuses</option>
                <option value="notStarted">Not Started</option>
                <option value="inProgress">In Progress</option>
                <option value="waiting">Waiting</option>
                <option value="waitingOnAppraiser">Waiting on Appraiser</option>
                <option value="supplementNeeded">Supplement Needed</option>
                <option value="done">Done</option>
              </select>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  minWidth: 1060,
                }}
              >
                <thead>
                  <tr>
                    {[
                      'RO',
                      'Customer',
                      'Vehicle',
                      'Phone',
                      'Total',
                      'Due Out',
                      'Insurance',
                      'Claim',
                      'Status',
                      'Parts',
                    ].map((label) => (
                      <th key={label} style={tableHeaderStyle()}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredJobs.length ? (
                    filteredJobs.map((job) => {
                      const isSelected = selectedJobId === job.id;
                      return (
                        <tr
                          key={job.id}
                          onClick={() => setSelectedJobId(job.id)}
                          style={{
                            background: isSelected
                              ? 'rgba(59,130,246,0.28)'
                              : job.done
                              ? 'rgba(51,65,85,0.28)'
                              : 'transparent',
                            cursor: 'pointer',
                          }}
                        >
                          <td style={tableCellStyle(isSelected)}>{job.roNumber}</td>
                          <td style={tableCellStyle(isSelected)}>{job.customerName || '-'}</td>
                          <td style={tableCellStyle(isSelected)}>{job.vehicle}</td>
                          <td style={tableCellStyle(isSelected)}>
                            {job.phoneNumber?.trim() ? (
                              <a
                                href={`tel:${sanitizePhoneNumber(job.phoneNumber)}`}
                                onClick={(event) => event.stopPropagation()}
                                style={phoneLinkStyle()}
                              >
                                {job.phoneNumber}
                              </a>
                            ) : (
                              <span style={{ color: '#9fb1c7' }}>Not set</span>
                            )}
                          </td>
                          <td style={tableCellStyle(isSelected)}>{formatCurrency(job.amount)}</td>
                          <td style={tableCellStyle(isSelected)}>{formatDate(job.promiseDate)}</td>
                          <td style={tableCellStyle(isSelected)}>{job.mitchellInsuranceCompany || '-'}</td>
                          <td style={tableCellStyle(isSelected)}>{job.mitchellClaimNumber || '-'}</td>
                          <td style={tableCellStyle(isSelected)}>
                            <span style={statusPillStyle(job.status, job.done)}>{formatStatus(job.status, job.done)}</span>
                          </td>
                          <td style={tableCellStyle(isSelected)}>
                            {(job.partsRequests ?? []).some((part) => part.status !== 'received')
                              ? 'Open'
                              : 'Clear'}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={10} style={{ padding: 24, color: '#c9d7ea', textAlign: 'center' }}>
                        No repair orders match these filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div
            style={{
              borderRadius: 20,
              border: '1px solid rgba(173,188,208,0.25)',
              background: 'rgba(8,16,28,0.38)',
              padding: 18,
            }}
          >
            {selectedJob ? (
              <>
                <div style={{ display: 'grid', gap: 6, marginBottom: 16 }}>
                  <div style={{ color: '#9fb7d5', fontWeight: 800, fontSize: 12, letterSpacing: 0.7 }}>
                    SELECTED REPAIR ORDER
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: '#f8fbff' }}>
                    RO {selectedJob.roNumber}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#dfe9f7' }}>
                    {selectedJob.customerName}
                  </div>
                  <div style={{ color: '#c6d4e7', fontWeight: 700 }}>
                    {selectedJob.vehicle}
                  </div>
                </div>

                <div style={{ display: 'grid', gap: 10 }}>
                  <DetailRow label="Phone" value={selectedJob.phoneNumber || 'Not set'} />
                  <DetailRow label="Insurance" value={selectedJob.mitchellInsuranceCompany || 'Not set'} />
                  <DetailRow label="Claim" value={selectedJob.mitchellClaimNumber || 'Not set'} />
                  <DetailRow label="Estimator" value={selectedJob.mitchellEstimatorName || 'Not set'} />
                  <DetailRow label="Lead Tech" value={selectedJob.mitchellLeadTechName || 'Not set'} />
                  <DetailRow label="Department" value={selectedJob.mitchellDepartmentName || 'Not set'} />
                  <DetailRow label="Promise Date" value={formatDate(selectedJob.promiseDate)} />
                  <DetailRow label="Amount" value={formatCurrency(selectedJob.amount)} />
                  <DetailRow
                    label="Paint Code"
                    value={selectedJob.paintCode || 'NEED PAINTCODE'}
                    highlight={!selectedJob.paintCode}
                  />
                  <DetailRow label="Status" value={formatStatus(selectedJob.status, selectedJob.done)} />
                  <DetailRow
                    label="Notes"
                    value={`${selectedJob.textNotes.length} notes`}
                  />
                  <DetailRow
                    label="Photos"
                    value={`${selectedJob.photos.length} photos`}
                  />
                  <DetailRow
                    label="Parts"
                    value={`${selectedJob.partsRequests.length} requests`}
                  />
                </div>
              </>
            ) : (
              <div style={{ color: '#d4dfef' }}>Select a repair order to inspect the detail panel.</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'blue' | 'slate' | 'amber' | 'green';
}) {
  const tones = {
    blue: {
      background: 'rgba(37,99,235,0.22)',
      border: 'rgba(147,197,253,0.35)',
    },
    slate: {
      background: 'rgba(71,85,105,0.3)',
      border: 'rgba(203,213,225,0.26)',
    },
    amber: {
      background: 'rgba(180,83,9,0.24)',
      border: 'rgba(253,186,116,0.34)',
    },
    green: {
      background: 'rgba(5,150,105,0.22)',
      border: 'rgba(110,231,183,0.34)',
    },
  }[tone];

  return (
    <div
      style={{
        borderRadius: 16,
        padding: '12px 14px',
        background: tones.background,
        border: `1px solid ${tones.border}`,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: '#d7e3f3', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 900, color: '#ffffff' }}>{value}</div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '120px minmax(0, 1fr)',
        gap: 10,
        padding: '10px 12px',
        borderRadius: 12,
        background: highlight ? 'rgba(180,83,9,0.24)' : 'rgba(16,24,39,0.55)',
        border: highlight
          ? '1px solid rgba(251,191,36,0.42)'
          : '1px solid rgba(148,163,184,0.12)',
      }}
    >
      <div style={{ fontWeight: 800, color: '#93a8c3', fontSize: 12, letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontWeight: 700, color: highlight ? '#fde68a' : '#f8fbff' }}>{value}</div>
    </div>
  );
}

function filterInputStyle(): CSSProperties {
  return {
    flex: '1 1 280px',
    minWidth: 220,
    borderRadius: 12,
    border: '1px solid rgba(148,163,184,0.24)',
    background: 'rgba(15,23,42,0.78)',
    color: '#f8fbff',
    padding: '10px 12px',
    fontSize: 14,
    fontWeight: 600,
    outline: 'none',
  };
}

function filterSelectStyle(): CSSProperties {
  return {
    borderRadius: 12,
    border: '1px solid rgba(148,163,184,0.24)',
    background: 'rgba(15,23,42,0.78)',
    color: '#f8fbff',
    padding: '10px 12px',
    fontSize: 14,
    fontWeight: 700,
    outline: 'none',
  };
}

function tableHeaderStyle(): CSSProperties {
  return {
    textAlign: 'left',
    padding: '12px 14px',
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 0.45,
    color: '#d5e3f5',
    background: 'rgba(30,41,59,0.78)',
    borderBottom: '1px solid rgba(148,163,184,0.18)',
    whiteSpace: 'nowrap',
  };
}

function tableCellStyle(selected: boolean): CSSProperties {
  return {
    padding: '12px 14px',
    fontSize: 13,
    fontWeight: selected ? 800 : 600,
    color: '#f8fbff',
    borderBottom: '1px solid rgba(148,163,184,0.08)',
    whiteSpace: 'nowrap',
  };
}

function phoneLinkStyle(): CSSProperties {
  return {
    color: '#93c5fd',
    textDecoration: 'none',
    fontWeight: 800,
  };
}

function statusPillStyle(status: Job['status'], done: boolean): CSSProperties {
  const palette = done
    ? {
        background: 'rgba(71,85,105,0.34)',
        border: 'rgba(203,213,225,0.28)',
      }
    : status === 'supplementNeeded'
    ? {
        background: 'rgba(180,83,9,0.26)',
        border: 'rgba(253,186,116,0.32)',
      }
    : status === 'waitingOnAppraiser'
    ? {
        background: 'rgba(5,150,105,0.24)',
        border: 'rgba(110,231,183,0.3)',
      }
    : status === 'waiting'
    ? {
        background: 'rgba(29,78,216,0.22)',
        border: 'rgba(147,197,253,0.3)',
      }
    : status === 'inProgress'
    ? {
        background: 'rgba(29,78,216,0.26)',
        border: 'rgba(96,165,250,0.32)',
      }
    : {
        background: 'rgba(71,85,105,0.3)',
        border: 'rgba(148,163,184,0.26)',
      };

  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    padding: '6px 10px',
    background: palette.background,
    border: `1px solid ${palette.border}`,
    color: '#eff6ff',
    fontSize: 12,
    fontWeight: 800,
  };
}

function formatStatus(status: Job['status'], done: boolean) {
  if (done || status === 'done') return 'Done';
  if (status === 'notStarted') return 'Not Started';
  if (status === 'inProgress') return 'In Progress';
  if (status === 'waitingOnAppraiser') return 'Waiting on Appraiser';
  if (status === 'supplementNeeded') return 'Supplement Needed';
  return 'Waiting';
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

function formatDate(value: string) {
  if (!value) return 'Not set';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString();
}

function sanitizePhoneNumber(value: string) {
  return value.replace(/[^\d+]/g, '');
}

export default CommandCenterTab;
