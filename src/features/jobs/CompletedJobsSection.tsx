import React, { useState } from 'react';
import type { Job } from '../../types/app';

type CompletedJobsSectionProps = {
  jobs: Job[];
  compact?: boolean;
  onUndoDone: (jobId: string) => void;
};

function CompletedJobsSection({
  jobs,
  compact = false,
  onUndoDone,
}: CompletedJobsSectionProps) {
  const [sectionOpen, setSectionOpen] = useState(false);
  const [openJobIds, setOpenJobIds] = useState<string[]>([]);

  if (compact) {
    return null;
  }

  const toggleJob = (jobId: string) => {
    setOpenJobIds((current) =>
      current.includes(jobId)
        ? current.filter((id) => id !== jobId)
        : [...current, jobId],
    );
  };

  return (
    <section
      style={{
        borderRadius: 24,
        background: 'rgba(15,23,42,0.52)',
        border: '1px solid rgba(148,163,184,0.14)',
        overflow: 'hidden',
      }}
    >
      <button
        onClick={() => setSectionOpen((v) => !v)}
        style={{
          width: '100%',
          textAlign: 'left',
          border: 'none',
          background: 'transparent',
          color: 'inherit',
          cursor: 'pointer',
          padding: 28,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 24,
            fontWeight: 800,
            color: '#e5e7eb',
          }}
        >
          Completed Jobs
        </h2>

        <span
          style={{
            fontSize: 14,
            color: '#94a3b8',
            border: '1px solid rgba(148,163,184,0.18)',
            borderRadius: 999,
            padding: '6px 12px',
            fontWeight: 700,
          }}
        >
          {sectionOpen ? 'Open' : 'Collapsed'}
        </span>
      </button>

      {sectionOpen ? (
        <div
          style={{
            padding: '0 28px 28px',
            display: 'grid',
            gap: 12,
          }}
        >
          {jobs.length ? (
            jobs.map((job) => {
              const isOpen = openJobIds.includes(job.id);

              return (
                <div
                  key={job.id}
                  style={{
                    borderRadius: 16,
                    background: 'rgba(2,6,23,0.42)',
                    border: '1px solid rgba(148,163,184,0.12)',
                    overflow: 'hidden',
                  }}
                >
                  <button
                    onClick={() => toggleJob(job.id)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      border: 'none',
                      background: 'transparent',
                      color: 'inherit',
                      cursor: 'pointer',
                      padding: 14,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12,
                        alignItems: 'flex-start',
                        flexWrap: 'wrap',
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: 16,
                            fontWeight: 700,
                            color: '#e5e7eb',
                            marginBottom: 4,
                          }}
                        >
                          {job.vehicle}
                        </div>

                        <div
                          style={{
                            fontSize: 13,
                            color: '#94a3b8',
                          }}
                        >
                          RO {job.roNumber} • {formatAmount(job.amount)} -{' '}
                          {job.amountStatus === 'final' ? 'Final' : 'Not Final'}
                        </div>
                      </div>

                      <span
                        style={{
                          fontSize: 18,
                          color: '#94a3b8',
                          fontWeight: 700,
                        }}
                      >
                        {isOpen ? '−' : '+'}
                      </span>
                    </div>
                  </button>

                  {isOpen ? (
                    <div
                      style={{
                        borderTop: '1px solid rgba(148,163,184,0.12)',
                        padding: 14,
                        background: 'rgba(15,23,42,0.42)',
                        display: 'grid',
                        gap: 12,
                      }}
                    >
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                          gap: 12,
                        }}
                      >
                        <DetailBox
                          label="Customer"
                          value={job.customerName}
                        />
                        <DetailBox
                          label="Paint Code"
                          value={job.paintCode || 'Not set'}
                        />
                        <DetailBox
                          label="Promise Date"
                          value={formatDate(job.promiseDate)}
                        />
                        <DetailBox
                          label="Amount"
                          value={`${formatAmount(job.amount)} - ${
                            job.amountStatus === 'final' ? 'Final' : 'Not Final'
                          }`}
                        />
                        <DetailBox
                          label="Parts Status"
                          value={getPartsWorkflowSummary(job)}
                        />
                        <DetailBox
                          label="Parts Received"
                          value={getPartsReceiptSummary(job)}
                        />
                      </div>

                      <div
                        style={{
                          borderRadius: 14,
                          padding: 12,
                          background: 'rgba(2,6,23,0.35)',
                          border: '1px solid rgba(148,163,184,0.1)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 800,
                            color: '#f8fafc',
                            marginBottom: 5,
                          }}
                        >
                          Notes
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            color: '#94a3b8',
                          }}
                        >
                          Placeholder completed notes area
                        </div>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 10,
                        }}
                      >
                        <ActionButton onClick={() => onUndoDone(job.id)}>
                          Undo Done
                        </ActionButton>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })
          ) : (
            <div
              style={{
                fontSize: 13,
                color: '#94a3b8',
              }}
            >
              No completed jobs yet.
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

function DetailBox({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        borderRadius: 14,
        padding: 12,
        background: 'rgba(2,6,23,0.35)',
        border: '1px solid rgba(148,163,184,0.1)',
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 800,
          color: '#94a3b8',
          marginBottom: 4,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: '#f8fafc',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        border: '1px solid rgba(148,163,184,0.18)',
        background: 'rgba(30,41,59,0.72)',
        color: '#f8fafc',
        borderRadius: 14,
        padding: '11px 14px',
        fontSize: 13,
        fontWeight: 800,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function formatAmount(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: '2-digit',
  }).format(date);
}

function hasPartsWaiting(job: Job) {
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

export default CompletedJobsSection;
