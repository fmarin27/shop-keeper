import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import {
  markJobLaborDone,
  markJobLaborPaid,
  reopenJobLabor,
  subscribeToJobs,
  updateJobDetails,
} from '../../services/firebase/jobs';
import type { AmountStatus, EmsEstimateLine, Job } from '../../types/app';
import EmsImportPanel from '../ems/EmsImportPanel';

type CommandCenterTabProps = {
  compact?: boolean;
  mobile?: boolean;
};

type ViewFilter = 'active' | 'closed' | 'all';
type SummaryShortcut = 'active' | 'closed' | 'supplements' | 'appraiser';
type SortDirection = 'asc' | 'desc';
type CommandCenterSortKey =
  | 'ro'
  | 'customer'
  | 'vehicle'
  | 'phone'
  | 'total'
  | 'dueOut'
  | 'insurance'
  | 'claim'
  | 'status'
  | 'parts'
  | 'received';

type CommandCenterSort = {
  key: CommandCenterSortKey;
  direction: SortDirection;
};

type CommandCenterDraft = {
  roNumber: string;
  customerName: string;
  vehicle: string;
  phoneNumber: string;
  customerEmail: string;
  insuranceCompany: string;
  claimNumber: string;
  policyNumber: string;
  paintCode: string;
  amount: string;
  amountStatus: AmountStatus;
  promiseDate: string;
  status: Job['status'];
};

type CommandCenterLaborLine = {
  id: string;
  estimateLineId: string;
  lineNumber: string;
  description: string;
  laborType: string;
  laborHours: number;
  laborAmount: number;
};

function CommandCenterTab({
  compact = false,
  mobile = false,
}: CommandCenterTabProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Job['status']>('all');
  const [viewFilter, setViewFilter] = useState<ViewFilter>('active');
  const [sort, setSort] = useState<CommandCenterSort>({
    key: 'dueOut',
    direction: 'asc',
  });
  const [detailDraft, setDetailDraft] = useState<CommandCenterDraft | null>(null);
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [laborTechDrafts, setLaborTechDrafts] = useState<Record<string, string>>({});
  const [savingLaborId, setSavingLaborId] = useState<string | null>(null);
  const [laborError, setLaborError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToJobs((items) => {
      setJobs(items);
    });

    return () => unsubscribe();
  }, []);

  const filteredJobs = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    const matches = jobs.filter((job) => {
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

    return sortCommandCenterJobs(matches, sort);
  }, [jobs, search, sort, statusFilter, viewFilter]);

  const toggleSort = (key: CommandCenterSortKey) => {
    setSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const applySummaryShortcut = (shortcut: SummaryShortcut) => {
    setSearch('');

    if (shortcut === 'active') {
      setViewFilter('active');
      setStatusFilter('all');
      return;
    }

    if (shortcut === 'closed') {
      setViewFilter('closed');
      setStatusFilter('all');
      return;
    }

    if (shortcut === 'supplements') {
      setViewFilter('all');
      setStatusFilter('supplementNeeded');
      return;
    }

    setViewFilter('all');
    setStatusFilter('waitingOnAppraiser');
  };

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
  const activeShortcut = getActiveSummaryShortcut(viewFilter, statusFilter, search);

  useEffect(() => {
    if (!selectedJob) {
      setDetailDraft(null);
      setDetailError(null);
      return;
    }

    setDetailDraft({
      roNumber: selectedJob.roNumber,
      customerName: selectedJob.customerName,
      vehicle: selectedJob.vehicle,
      phoneNumber: selectedJob.phoneNumber,
      customerEmail: selectedJob.customerEmail ?? '',
      insuranceCompany:
        selectedJob.insuranceCompany || selectedJob.mitchellInsuranceCompany || '',
      claimNumber: selectedJob.claimNumber || selectedJob.mitchellClaimNumber || '',
      policyNumber: selectedJob.policyNumber ?? '',
      paintCode: selectedJob.paintCode,
      amount: String(selectedJob.amount ?? 0),
      amountStatus: selectedJob.amountStatus,
      promiseDate: selectedJob.promiseDate,
      status: selectedJob.status,
    });
    setLaborTechDrafts(
      Object.fromEntries(
        getJobLaborLines(selectedJob).map((line) => [
          line.id,
          getLaborCompletion(selectedJob, line.id)?.completedBy ||
            selectedJob.mitchellLeadTechName ||
            '',
        ]),
      ),
    );
    setDetailError(null);
    setLaborError(null);
  }, [selectedJob?.id]);

  const saveSelectedJobDetails = async () => {
    if (!selectedJob || !detailDraft) return;

    const amount = Number(detailDraft.amount);
    if (Number.isNaN(amount) || amount < 0) {
      setDetailError('Amount must be a valid number.');
      return;
    }

    try {
      setSavingDetails(true);
      setDetailError(null);
      await updateJobDetails(selectedJob.id, {
        roNumber: detailDraft.roNumber,
        customerName: detailDraft.customerName,
        vehicle: detailDraft.vehicle,
        phoneNumber: detailDraft.phoneNumber,
        customerEmail: detailDraft.customerEmail,
        insuranceCompany: detailDraft.insuranceCompany,
        claimNumber: detailDraft.claimNumber,
        policyNumber: detailDraft.policyNumber,
        paintCode: detailDraft.paintCode,
        amount,
        amountStatus: detailDraft.amountStatus,
        promiseDate: detailDraft.promiseDate,
        status: detailDraft.status,
      });
    } catch (error) {
      setDetailError(
        error instanceof Error ? error.message : 'Could not save RO details.',
      );
    } finally {
      setSavingDetails(false);
    }
  };

  const markSelectedLaborDone = async (line: CommandCenterLaborLine) => {
    if (!selectedJob) return;

    try {
      setSavingLaborId(line.id);
      setLaborError(null);
      await markJobLaborDone(selectedJob, {
        ...line,
        completedBy:
          laborTechDrafts[line.id] ||
          selectedJob.mitchellLeadTechName ||
          '',
      });
    } catch (error) {
      setLaborError(
        error instanceof Error ? error.message : 'Could not mark labor done.',
      );
    } finally {
      setSavingLaborId(null);
    }
  };

  const markSelectedLaborPaid = async (laborId: string) => {
    if (!selectedJob) return;

    try {
      setSavingLaborId(laborId);
      setLaborError(null);
      await markJobLaborPaid(selectedJob, laborId);
    } catch (error) {
      setLaborError(
        error instanceof Error ? error.message : 'Could not mark labor paid.',
      );
    } finally {
      setSavingLaborId(null);
    }
  };

  const reopenSelectedLabor = async (laborId: string) => {
    if (!selectedJob) return;

    try {
      setSavingLaborId(laborId);
      setLaborError(null);
      await reopenJobLabor(selectedJob, laborId);
    } catch (error) {
      setLaborError(
        error instanceof Error ? error.message : 'Could not reopen labor.',
      );
    } finally {
      setSavingLaborId(null);
    }
  };

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
            <SummaryCard
              label="Active ROs"
              value={String(activeCount)}
              tone="blue"
              active={activeShortcut === 'active'}
              onClick={() => applySummaryShortcut('active')}
            />
            <SummaryCard
              label="Closed ROs"
              value={String(closedCount)}
              tone="slate"
              active={activeShortcut === 'closed'}
              onClick={() => applySummaryShortcut('closed')}
            />
            <SummaryCard
              label="Supplements"
              value={String(supplementCount)}
              tone="amber"
              active={activeShortcut === 'supplements'}
              onClick={() => applySummaryShortcut('supplements')}
            />
            <SummaryCard
              label="Appraiser Wait"
              value={String(appraiserCount)}
              tone="green"
              active={activeShortcut === 'appraiser'}
              onClick={() => applySummaryShortcut('appraiser')}
            />
          </div>
        </div>

        <EmsImportPanel compact={compact} mobile={mobile} />

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
                  minWidth: 1120,
                }}
              >
                <thead>
                  <tr>
                    {[
                      { key: 'ro' as const, label: 'RO' },
                      { key: 'customer' as const, label: 'Customer' },
                      { key: 'vehicle' as const, label: 'Vehicle' },
                      { key: 'phone' as const, label: 'Phone' },
                      { key: 'total' as const, label: 'Total' },
                      { key: 'dueOut' as const, label: 'Due Out' },
                      { key: 'insurance' as const, label: 'Insurance' },
                      { key: 'claim' as const, label: 'Claim' },
                      { key: 'status' as const, label: 'Status' },
                      { key: 'parts' as const, label: 'Parts' },
                      { key: 'received' as const, label: 'P%' },
                    ].map((header) => (
                      <SortableTableHeader
                        key={header.key}
                        active={sort.key === header.key}
                        direction={sort.direction}
                        onClick={() => toggleSort(header.key)}
                      >
                        {header.label}
                      </SortableTableHeader>
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
                          <td style={tableCellStyle(isSelected)}>{job.insuranceCompany || job.mitchellInsuranceCompany || '-'}</td>
                          <td style={tableCellStyle(isSelected)}>{job.claimNumber || job.mitchellClaimNumber || '-'}</td>
                          <td style={tableCellStyle(isSelected)}>
                            <span style={statusPillStyle(job.status, job.done)}>{formatStatus(job.status, job.done)}</span>
                          </td>
                          <td style={tableCellStyle(isSelected)}>
                            {getPartsOrderedLabel(job)}
                          </td>
                          <td style={tableCellStyle(isSelected)}>
                            {getPartsReceivedPercent(job)}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={11} style={{ padding: 24, color: '#c9d7ea', textAlign: 'center' }}>
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
                  <DetailRow label="Insurance" value={selectedJob.insuranceCompany || selectedJob.mitchellInsuranceCompany || 'Not set'} />
                  <DetailRow label="Claim" value={selectedJob.claimNumber || selectedJob.mitchellClaimNumber || 'Not set'} />
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
                    value={getPartsDetailSummary(selectedJob)}
                  />
                </div>

                <LaborTrackingSection
                  job={selectedJob}
                  mobile={mobile}
                  laborTechDrafts={laborTechDrafts}
                  savingLaborId={savingLaborId}
                  error={laborError}
                  onTechChange={(laborId, value) =>
                    setLaborTechDrafts((current) => ({
                      ...current,
                      [laborId]: value,
                    }))
                  }
                  onMarkDone={(line) => void markSelectedLaborDone(line)}
                  onMarkPaid={(laborId) => void markSelectedLaborPaid(laborId)}
                  onReopen={(laborId) => void reopenSelectedLabor(laborId)}
                />

                {detailDraft ? (
                  <div
                    style={{
                      marginTop: 16,
                      borderRadius: 16,
                      border: '1px solid rgba(148,163,184,0.18)',
                      background: 'rgba(15,23,42,0.46)',
                      padding: 14,
                      display: 'grid',
                      gap: 10,
                    }}
                  >
                    <div style={{ color: '#d5e3f5', fontWeight: 900, fontSize: 13 }}>
                      Edit RO Info
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: mobile ? '1fr' : '1fr 1fr',
                        gap: 10,
                      }}
                    >
                      <EditField
                        label="RO #"
                        value={detailDraft.roNumber}
                        onChange={(value) =>
                          setDetailDraft({ ...detailDraft, roNumber: value })
                        }
                      />
                      <EditField
                        label="Customer"
                        value={detailDraft.customerName}
                        onChange={(value) =>
                          setDetailDraft({ ...detailDraft, customerName: value })
                        }
                      />
                      <EditField
                        label="Vehicle"
                        value={detailDraft.vehicle}
                        onChange={(value) =>
                          setDetailDraft({ ...detailDraft, vehicle: value })
                        }
                      />
                      <EditField
                        label="Phone"
                        value={detailDraft.phoneNumber}
                        onChange={(value) =>
                          setDetailDraft({ ...detailDraft, phoneNumber: value })
                        }
                      />
                      <EditField
                        label="Email"
                        value={detailDraft.customerEmail}
                        onChange={(value) =>
                          setDetailDraft({ ...detailDraft, customerEmail: value })
                        }
                      />
                      <EditField
                        label="Insurance"
                        value={detailDraft.insuranceCompany}
                        onChange={(value) =>
                          setDetailDraft({ ...detailDraft, insuranceCompany: value })
                        }
                      />
                      <EditField
                        label="Claim"
                        value={detailDraft.claimNumber}
                        onChange={(value) =>
                          setDetailDraft({ ...detailDraft, claimNumber: value })
                        }
                      />
                      <EditField
                        label="Policy"
                        value={detailDraft.policyNumber}
                        onChange={(value) =>
                          setDetailDraft({ ...detailDraft, policyNumber: value })
                        }
                      />
                      <EditField
                        label="Paint Code"
                        value={detailDraft.paintCode}
                        onChange={(value) =>
                          setDetailDraft({ ...detailDraft, paintCode: value })
                        }
                      />
                      <EditField
                        label="Amount"
                        value={detailDraft.amount}
                        onChange={(value) =>
                          setDetailDraft({ ...detailDraft, amount: value })
                        }
                      />
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={editLabelStyle()}>Status</span>
                        <select
                          value={detailDraft.status}
                          onChange={(event) =>
                            setDetailDraft({
                              ...detailDraft,
                              status: event.target.value as Job['status'],
                            })
                          }
                          style={editInputStyle()}
                        >
                          <option value="notStarted">Not Started</option>
                          <option value="inProgress">In Progress</option>
                          <option value="waiting">Waiting</option>
                          <option value="waitingOnAppraiser">Waiting on Appraiser</option>
                          <option value="supplementNeeded">Supplement Needed</option>
                          <option value="done">Done</option>
                        </select>
                      </label>
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={editLabelStyle()}>Final</span>
                        <select
                          value={detailDraft.amountStatus}
                          onChange={(event) =>
                            setDetailDraft({
                              ...detailDraft,
                              amountStatus: event.target.value as AmountStatus,
                            })
                          }
                          style={editInputStyle()}
                        >
                          <option value="notFinal">Not Final</option>
                          <option value="final">Final</option>
                        </select>
                      </label>
                      <EditField
                        label="Promise Date"
                        type="date"
                        value={detailDraft.promiseDate}
                        onChange={(value) =>
                          setDetailDraft({ ...detailDraft, promiseDate: value })
                        }
                      />
                    </div>
                    {detailError ? (
                      <div style={{ color: '#fecaca', fontWeight: 800, fontSize: 12 }}>
                        {detailError}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void saveSelectedJobDetails()}
                      disabled={savingDetails}
                      style={{
                        border: '1px solid rgba(96,165,250,0.45)',
                        background: savingDetails ? 'rgba(51,65,85,0.92)' : '#1d4ed8',
                        color: '#eff6ff',
                        fontWeight: 900,
                        fontSize: 13,
                        padding: '10px 12px',
                        borderRadius: 12,
                        cursor: savingDetails ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {savingDetails ? 'Saving...' : 'Save RO Info'}
                    </button>
                  </div>
                ) : null}
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

function EditField({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label style={{ display: 'grid', gap: 6 }}>
      <span style={editLabelStyle()}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={editInputStyle()}
      />
    </label>
  );
}

function SummaryCard({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: string;
  tone: 'blue' | 'slate' | 'amber' | 'green';
  active: boolean;
  onClick: () => void;
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
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={`Show ${label.toLowerCase()}`}
      style={{
        appearance: 'none',
        width: '100%',
        textAlign: 'left',
        font: 'inherit',
        borderRadius: 16,
        padding: '12px 14px',
        background: tones.background,
        border: `1px solid ${tones.border}`,
        outline: active ? '2px solid rgba(255,255,255,0.82)' : 'none',
        outlineOffset: active ? 2 : 0,
        boxShadow: active
          ? '0 0 0 3px rgba(147,197,253,0.18)'
          : 'none',
        cursor: 'pointer',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: '#d7e3f3', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 900, color: '#ffffff' }}>{value}</div>
    </button>
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

function LaborTrackingSection({
  job,
  mobile,
  laborTechDrafts,
  savingLaborId,
  error,
  onTechChange,
  onMarkDone,
  onMarkPaid,
  onReopen,
}: {
  job: Job;
  mobile: boolean;
  laborTechDrafts: Record<string, string>;
  savingLaborId: string | null;
  error: string | null;
  onTechChange: (laborId: string, value: string) => void;
  onMarkDone: (line: CommandCenterLaborLine) => void;
  onMarkPaid: (laborId: string) => void;
  onReopen: (laborId: string) => void;
}) {
  const laborLines = getJobLaborLines(job);
  const summary = getLaborSummary(job, laborLines);

  return (
    <section
      style={{
        marginTop: 16,
        borderRadius: 16,
        border: '1px solid rgba(96,165,250,0.22)',
        background: 'rgba(15,23,42,0.48)',
        padding: 14,
        display: 'grid',
        gap: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 10,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <div>
          <div style={{ color: '#e8f1ff', fontWeight: 900, fontSize: 15 }}>
            Labor Tracking
          </div>
          <div style={{ color: '#9fb7d5', fontWeight: 700, fontSize: 12, marginTop: 3 }}>
            Mark completed labor so tech hours are ready for payroll.
          </div>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: mobile ? '1fr' : 'repeat(3, minmax(92px, 1fr))',
            gap: 8,
            width: mobile ? '100%' : undefined,
          }}
        >
          <LaborMetric label="Total" value={`${formatHours(summary.totalHours)}h`} />
          <LaborMetric label="Done" value={`${formatHours(summary.doneHours)}h`} />
          <LaborMetric label="Payable" value={`${formatHours(summary.unpaidHours)}h`} />
        </div>
      </div>

      {error ? (
        <div style={{ color: '#fecaca', fontWeight: 800, fontSize: 12 }}>
          {error}
        </div>
      ) : null}

      {laborLines.length ? (
        <div style={{ display: 'grid', gap: 10, maxHeight: 520, overflowY: 'auto' }}>
          {laborLines.map((line) => {
            const completion = getLaborCompletion(job, line.id);
            const saving = savingLaborId === line.id;
            const techName =
              laborTechDrafts[line.id] ??
              completion?.completedBy ??
              job.mitchellLeadTechName ??
              '';

            return (
              <div
                key={line.id}
                style={{
                  borderRadius: 14,
                  border: '1px solid rgba(148,163,184,0.18)',
                  background: completion
                    ? 'rgba(6,78,59,0.24)'
                    : 'rgba(8,16,28,0.52)',
                  padding: 12,
                  display: 'grid',
                  gap: 10,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <div style={{ color: '#f8fbff', fontWeight: 900, fontSize: 13 }}>
                      {line.description || 'Labor line'}
                    </div>
                    <div style={{ color: '#a8bed9', fontSize: 12, fontWeight: 700, marginTop: 3 }}>
                      Line {line.lineNumber || '-'} - {line.laborType}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span style={laborPillStyle()}>
                      {formatHours(line.laborHours)}h
                    </span>
                    {line.laborAmount > 0 ? (
                      <span style={laborPillStyle()}>
                        {formatCurrency(line.laborAmount)}
                      </span>
                    ) : null}
                    <span style={completionStatusStyle(Boolean(completion), Boolean(completion?.paidAt))}>
                      {completion?.paidAt
                        ? 'Paid'
                        : completion
                        ? 'Done'
                        : 'Open'}
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: mobile ? '1fr' : 'minmax(150px, 1fr) auto',
                    gap: 10,
                    alignItems: 'center',
                  }}
                >
                  <label style={{ display: 'grid', gap: 5 }}>
                    <span style={editLabelStyle()}>Technician</span>
                    <input
                      value={techName}
                      onChange={(event) => onTechChange(line.id, event.target.value)}
                      placeholder="Tech name"
                      style={editInputStyle()}
                    />
                  </label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {completion ? (
                      <>
                        <button
                          type="button"
                          disabled={saving || Boolean(completion.paidAt)}
                          onClick={() => onMarkPaid(line.id)}
                          style={laborActionButtonStyle('green', saving || Boolean(completion.paidAt))}
                        >
                          {completion.paidAt ? 'Paid' : 'Mark Paid'}
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => onReopen(line.id)}
                          style={laborActionButtonStyle('slate', saving)}
                        >
                          Reopen
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => onMarkDone(line)}
                        style={laborActionButtonStyle('blue', saving)}
                      >
                        {saving ? 'Saving...' : 'Mark Done'}
                      </button>
                    )}
                  </div>
                </div>

                {completion ? (
                  <div style={{ color: '#b7c8dd', fontWeight: 700, fontSize: 12 }}>
                    Completed by {completion.completedBy} on {formatDateTime(completion.completedAt)}
                    {completion.paidAt ? ` - paid ${formatDateTime(completion.paidAt)}` : ''}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div
          style={{
            borderRadius: 12,
            border: '1px dashed rgba(148,163,184,0.28)',
            color: '#c8d6e8',
            padding: 12,
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          No labor lines are loaded for this RO yet. Use the EMS update on this
          repair order to bring in labor detail.
        </div>
      )}
    </section>
  );
}

function LaborMetric({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        borderRadius: 12,
        border: '1px solid rgba(147,197,253,0.18)',
        background: 'rgba(30,64,175,0.18)',
        padding: '8px 10px',
      }}
    >
      <div style={{ color: '#9fb7d5', fontSize: 11, fontWeight: 900 }}>{label}</div>
      <div style={{ color: '#eff6ff', fontSize: 18, fontWeight: 900 }}>{value}</div>
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

function editLabelStyle(): CSSProperties {
  return {
    color: '#93a8c3',
    fontSize: 11,
    fontWeight: 900,
  };
}

function editInputStyle(): CSSProperties {
  return {
    width: '100%',
    boxSizing: 'border-box',
    borderRadius: 10,
    border: '1px solid rgba(148,163,184,0.24)',
    background: '#0f172a',
    color: '#f8fbff',
    padding: '9px 10px',
    fontSize: 13,
    fontWeight: 700,
    outline: 'none',
  };
}

function SortableTableHeader({
  children,
  active,
  direction,
  onClick,
}: {
  children: ReactNode;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
}) {
  return (
    <th style={tableHeaderStyle()}>
      <button
        type="button"
        onClick={onClick}
        style={{
          border: 0,
          padding: 0,
          margin: 0,
          background: 'transparent',
          color: active ? '#ffffff' : '#d5e3f5',
          font: 'inherit',
          fontWeight: 900,
          cursor: 'pointer',
          display: 'inline-flex',
          gap: 5,
          alignItems: 'center',
        }}
      >
        <span>{children}</span>
        <span style={{ color: active ? '#93c5fd' : '#64748b' }}>
          {active ? (direction === 'asc' ? '^' : 'v') : '-'}
        </span>
      </button>
    </th>
  );
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

function laborPillStyle(): CSSProperties {
  return {
    borderRadius: 999,
    padding: '6px 9px',
    background: 'rgba(30,41,59,0.72)',
    border: '1px solid rgba(148,163,184,0.2)',
    color: '#e8f1ff',
    fontSize: 12,
    fontWeight: 900,
    whiteSpace: 'nowrap',
  };
}

function completionStatusStyle(done: boolean, paid: boolean): CSSProperties {
  return {
    ...laborPillStyle(),
    background: paid
      ? 'rgba(6,95,70,0.4)'
      : done
      ? 'rgba(29,78,216,0.36)'
      : 'rgba(180,83,9,0.28)',
    border: paid
      ? '1px solid rgba(110,231,183,0.34)'
      : done
      ? '1px solid rgba(147,197,253,0.34)'
      : '1px solid rgba(253,186,116,0.34)',
  };
}

function laborActionButtonStyle(
  tone: 'blue' | 'green' | 'slate',
  disabled: boolean,
): CSSProperties {
  const palette = {
    blue: {
      background: '#1d4ed8',
      border: 'rgba(96,165,250,0.45)',
    },
    green: {
      background: '#059669',
      border: 'rgba(110,231,183,0.42)',
    },
    slate: {
      background: 'rgba(71,85,105,0.92)',
      border: 'rgba(148,163,184,0.26)',
    },
  }[tone];

  return {
    border: `1px solid ${palette.border}`,
    background: disabled ? 'rgba(51,65,85,0.74)' : palette.background,
    color: '#eff6ff',
    fontWeight: 900,
    fontSize: 12,
    padding: '9px 11px',
    borderRadius: 11,
    cursor: disabled ? 'not-allowed' : 'pointer',
    whiteSpace: 'nowrap',
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

function formatDateTime(value: string) {
  if (!value) return 'Not set';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function formatHours(value: number) {
  return (Math.round((value || 0) * 10) / 10).toFixed(1);
}

function getActiveSummaryShortcut(
  viewFilter: ViewFilter,
  statusFilter: 'all' | Job['status'],
  search: string,
): SummaryShortcut | null {
  if (search.trim()) {
    return null;
  }

  if (viewFilter === 'active' && statusFilter === 'all') {
    return 'active';
  }

  if (viewFilter === 'closed' && statusFilter === 'all') {
    return 'closed';
  }

  if (viewFilter === 'all' && statusFilter === 'supplementNeeded') {
    return 'supplements';
  }

  if (viewFilter === 'all' && statusFilter === 'waitingOnAppraiser') {
    return 'appraiser';
  }

  return null;
}

function getJobLaborLines(job: Job): CommandCenterLaborLine[] {
  const estimateLines = job.estimateLines ?? [];
  const lineItems = estimateLines
    .filter(isLaborEstimateLine)
    .map((line) => {
      const laborHours = getLineLaborHours(line);
      const laborAmount = getLineLaborAmount(line);

      return {
        id: `estimate-${line.id}`,
        estimateLineId: line.id,
        lineNumber: line.lineNumber,
        description: line.description,
        laborType: getLaborTypeLabel(line),
        laborHours,
        laborAmount,
      };
    })
    .filter((line) => line.laborHours > 0 || line.laborAmount > 0);

  if (lineItems.length) {
    return lineItems;
  }

  return getLaborSummaryFallbackLines(job);
}

function isLaborEstimateLine(line: EmsEstimateLine) {
  if (line.isSublet) return false;

  const kind = String(line.lineKind ?? '').toLowerCase();
  const label = `${line.operationLabel ?? ''} ${line.operationCategory ?? ''} ${line.laborType ?? ''}`
    .toLowerCase();

  if (kind === 'labor' || kind === 'paint') return true;
  if (line.laborHours > 0 || (line.paintHours ?? 0) > 0) return true;
  if (line.laborAmount > 0 || (line.paintAmount ?? 0) > 0) return true;

  return (
    !line.partNumber &&
    (label.includes('body labor') ||
      label.includes('mechanical') ||
      label.includes('refinish') ||
      label.includes('paint'))
  );
}

function getLineLaborHours(line: EmsEstimateLine) {
  if (String(line.lineKind ?? '').toLowerCase() === 'paint') {
    return line.paintHours || line.laborHours || 0;
  }

  return line.laborHours || line.paintHours || 0;
}

function getLineLaborAmount(line: EmsEstimateLine) {
  const kind = String(line.lineKind ?? '').toLowerCase();
  if (kind === 'paint') {
    return line.paintAmount || line.laborAmount || line.totalAmount || 0;
  }

  return line.laborAmount || line.paintAmount || line.totalAmount || 0;
}

function getLaborTypeLabel(line: EmsEstimateLine) {
  const label = String(line.operationLabel ?? '').trim();
  const kind = String(line.lineKind ?? '').trim();

  if (label) return label;
  if (kind === 'paint') return 'Refinish';
  if (kind === 'labor') return 'Body Labor';
  if (String(line.laborType ?? '').toUpperCase() === 'LAM') return 'Mechanical Labor';

  return 'Labor';
}

function getLaborSummaryFallbackLines(job: Job): CommandCenterLaborLine[] {
  const totals = job.estimateTotals;
  if (!totals) return [];

  return [
    {
      id: 'summary-body-labor',
      estimateLineId: 'summary-body-labor',
      lineNumber: 'Body',
      description: 'Body labor total',
      laborType: 'Body Labor',
      laborHours: totals.bodyLaborHours || 0,
      laborAmount: 0,
    },
    {
      id: 'summary-refinish-labor',
      estimateLineId: 'summary-refinish-labor',
      lineNumber: 'Paint',
      description: 'Refinish labor total',
      laborType: 'Refinish',
      laborHours: totals.refinishLaborHours || 0,
      laborAmount: 0,
    },
    {
      id: 'summary-mechanical-labor',
      estimateLineId: 'summary-mechanical-labor',
      lineNumber: 'Mech',
      description: 'Mechanical labor total',
      laborType: 'Mechanical Labor',
      laborHours: totals.mechanicalLaborHours || 0,
      laborAmount: 0,
    },
  ].filter((line) => line.laborHours > 0);
}

function getLaborCompletion(job: Job, laborId: string) {
  return (job.laborCompletions ?? []).find((completion) => completion.id === laborId);
}

function getLaborSummary(job: Job, laborLines: CommandCenterLaborLine[]) {
  const totalHours = laborLines.reduce((sum, line) => sum + line.laborHours, 0);
  const lineHoursById = new Map(laborLines.map((line) => [line.id, line.laborHours]));
  const doneHours = (job.laborCompletions ?? []).reduce(
    (sum, completion) => sum + (lineHoursById.get(completion.id) ?? completion.laborHours ?? 0),
    0,
  );
  const paidHours = (job.laborCompletions ?? []).reduce(
    (sum, completion) =>
      completion.paidAt
        ? sum + (lineHoursById.get(completion.id) ?? completion.laborHours ?? 0)
        : sum,
    0,
  );

  return {
    totalHours,
    doneHours,
    unpaidHours: Math.max(doneHours - paidHours, 0),
  };
}

function sortCommandCenterJobs(jobs: Job[], sort: CommandCenterSort) {
  return [...jobs].sort((left, right) => {
    const comparison = compareSortValues(
      getCommandCenterSortValue(left, sort.key),
      getCommandCenterSortValue(right, sort.key),
    );

    return sort.direction === 'asc' ? comparison : comparison * -1;
  });
}

function getCommandCenterSortValue(job: Job, key: CommandCenterSortKey) {
  switch (key) {
    case 'ro':
      return job.roNumber;
    case 'customer':
      return job.customerName;
    case 'vehicle':
      return job.vehicle;
    case 'phone':
      return job.phoneNumber;
    case 'total':
      return job.amount ?? 0;
    case 'dueOut':
      return getDateSortValue(job.promiseDate);
    case 'insurance':
      return job.insuranceCompany || job.mitchellInsuranceCompany || '';
    case 'claim':
      return job.claimNumber || job.mitchellClaimNumber || '';
    case 'status':
      return formatStatus(job.status, job.done);
    case 'parts':
      return getPartsOrderedLabel(job);
    case 'received':
      return getPartsReceivedSortValue(job);
    default:
      return '';
  }
}

function getDateSortValue(value: string) {
  if (!value) {
    return Number.MAX_SAFE_INTEGER;
  }

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

function compareSortValues(left: string | number, right: string | number) {
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }

  return String(left).localeCompare(String(right), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

function getPartItems(job: Job) {
  return (job.partsRequests ?? []).filter((part) => (part.kind ?? 'part') === 'part');
}

function getEstimatePartItems(job: Job) {
  return (job.estimateLines ?? []).filter(isOrderableEstimatePart);
}

function isOrderableEstimatePart(line: EmsEstimateLine) {
  if (isRefinishEstimateLine(line)) return false;

  const partPrice = Number(line.partPrice ?? 0);
  if (!Number.isFinite(partPrice) || partPrice <= 0) return false;
  if (line.isOrderablePart) return true;

  const kind = String(line.lineKind ?? '').trim().toLowerCase();
  if (kind) return kind === 'part';

  return Boolean(line.partNumber);
}

function isRefinishEstimateLine(line: EmsEstimateLine) {
  const label = [
    line.operationLabel,
    line.operationCategory,
    line.laborType,
  ]
    .map((value) => String(value ?? '').toLowerCase())
    .join(' ');

  return label.includes('refinish') || label.includes('paint');
}

function getPartsOrderedLabel(job: Job) {
  const parts = getPartItems(job);
  if (parts.length || job.partsWaiting) {
    return 'Yes';
  }

  const estimateParts = getEstimatePartItems(job);
  if (estimateParts.length) {
    return `${estimateParts.length} estimate`;
  }

  return 'No';
}

function getPartsReceivedPercent(job: Job) {
  const parts = getPartItems(job);
  if (!parts.length) {
    return getEstimatePartItems(job).length ? 'N/A' : job.partsWaiting ? '0' : '100';
  }

  const received = parts.filter((part) => part.status === 'received').length;
  return String(Math.round((received / parts.length) * 100));
}

function getPartsReceivedSortValue(job: Job) {
  const parts = getPartItems(job);
  if (!parts.length) {
    return job.partsWaiting ? 0 : 100;
  }

  const received = parts.filter((part) => part.status === 'received').length;
  return Math.round((received / parts.length) * 100);
}

function getPartsDetailSummary(job: Job) {
  const liveParts = getPartItems(job);
  const estimateParts = getEstimatePartItems(job);

  if (liveParts.length) {
    return `${liveParts.length} live / ${getPartsReceivedPercent(job)}% received`;
  }

  if (estimateParts.length) {
    return `${estimateParts.length} estimate part${estimateParts.length === 1 ? '' : 's'} / no live requests`;
  }

  return job.partsWaiting ? 'Waiting flag set / no parts listed' : 'No parts listed';
}

function sanitizePhoneNumber(value: string) {
  return value.replace(/[^\d+]/g, '');
}

export default CommandCenterTab;
