import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, MutableRefObject, ReactNode } from 'react';
import { processJobImage } from '../../services/media/imageProcessor';
import {
  canUseNativeMobileCamera,
  getNativeMobilePhoto,
} from '../../services/media/mobileCamera';
import type {
  AppMode,
  EmsEstimateLine,
  Job,
  JobPartRequest,
  JobPartStatus,
} from '../../types/app';
import {
  addInvoicePhotoToJobPart,
  markJobPartPaid,
  markJobPartReceived,
  requestPartForJob,
  saveJobPartInvoice,
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

type EstimatePartBoardRow = {
  job: Job;
  line: EmsEstimateLine;
};

type FilterMode = 'open' | 'requested' | 'ordered' | 'reorderNeeded' | 'received' | 'unpaid' | 'all';
type SortDirection = 'asc' | 'desc';
type PartsSortKey = 'job' | 'item' | 'quantity' | 'status' | 'invoice' | 'paid' | 'note';
type PartsSort = {
  key: PartsSortKey;
  direction: SortDirection;
};

const FILTERS: Array<{ value: FilterMode; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'requested', label: 'Requested' },
  { value: 'ordered', label: 'Ordered' },
  { value: 'reorderNeeded', label: 'Reorder' },
  { value: 'received', label: 'Received' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'all', label: 'All' },
];

function PartsTab({ appMode, compact = false, mobile = false, onOpenJob }: PartsTabProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterMode>('open');
  const [sort, setSort] = useState<PartsSort>({ key: 'job', direction: 'asc' });
  const [savingPartId, setSavingPartId] = useState<string | null>(null);
  const [savingEstimateLineId, setSavingEstimateLineId] = useState<string | null>(null);
  const [invoicePhotoActionState, setInvoicePhotoActionState] = useState<{
    jobId: string;
    partId: string;
    phase: 'processing' | 'uploading';
  } | null>(null);
  const invoicePhotoInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const invoiceGalleryInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

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

  const estimateParts = useMemo(
    () =>
      jobs
        .filter((job) => !job.done)
        .flatMap((job) =>
          (job.estimateLines ?? [])
            .filter(isOrderableEstimatePart)
            .map((line) => ({ job, line })),
        ),
    [jobs],
  );

  const visibleParts = useMemo(() => {
    let matches = allParts;

    if (filter === 'open') {
      matches = allParts.filter(
        ({ job, part }) => !job.done && isPartBoardItemOpen(part),
      );
    } else if (filter === 'unpaid') {
      matches = allParts.filter(({ part }) => !part.paidAt);
    } else if (filter !== 'all') {
      matches = allParts.filter(({ part }) => part.status === filter);
    }

    return sortPartRows(matches, sort);
  }, [allParts, filter, sort]);

  const toggleSort = (key: PartsSortKey) => {
    setSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const stats = useMemo(() => {
    const open = allParts.filter(
      ({ job, part }) => !job.done && isPartBoardItemOpen(part),
    ).length;
    const ordered = allParts.filter(({ part }) => part.status === 'ordered').length;
    const received = allParts.filter(({ part }) => part.status === 'received').length;
    const reorderNeeded = allParts.filter(({ part }) => part.status === 'reorderNeeded').length;
    const unpaid = allParts.filter(({ part }) => !part.paidAt).length;

    return {
      open,
      ordered,
      received,
      reorderNeeded,
      unpaid,
      estimate: estimateParts.length,
      total: allParts.length,
    };
  }, [allParts, estimateParts.length]);

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

  const addInvoicePhoto = async (
    job: Job,
    part: JobPartRequest,
    file: File | null,
  ) => {
    if (!file) return;

    const refKey = `${job.id}-${part.id}`;

    try {
      setSavingPartId(part.id);
      setInvoicePhotoActionState({ jobId: job.id, partId: part.id, phase: 'processing' });
      const processed = await processJobImage(file, {
        addTimestamp: false,
        maxDimension: mobile ? 1200 : 1600,
        quality: mobile ? 0.72 : 0.78,
        targetMaxBytes: mobile ? 520 * 1024 : 700 * 1024,
        minDimension: mobile ? 720 : 900,
      });

      setInvoicePhotoActionState({ jobId: job.id, partId: part.id, phase: 'uploading' });
      await addInvoicePhotoToJobPart(job, part.id, {
        file: processed.blob,
        width: processed.width,
        height: processed.height,
        fileSize: processed.fileSize,
        timestampIncluded: processed.timestampIncluded,
      });
    } catch (error) {
      console.error('Failed to add invoice photo:', error);
      alert(
        error instanceof Error
          ? error.message
          : 'Could not upload invoice photo.',
      );
    } finally {
      setInvoicePhotoActionState(null);
      setSavingPartId(null);
      const photoInput = invoicePhotoInputRefs.current[refKey];
      const galleryInput = invoiceGalleryInputRefs.current[refKey];
      if (photoInput) {
        photoInput.value = '';
      }
      if (galleryInput) {
        galleryInput.value = '';
      }
    }
  };

  const addNativeInvoicePhoto = async (
    job: Job,
    part: JobPartRequest,
    source: 'camera' | 'gallery',
  ) => {
    try {
      const file = await getNativeMobilePhoto(source);
      await addInvoicePhoto(job, part, file);
    } catch (error) {
      console.error('Failed to pick mobile invoice photo:', error);
      alert(
        error instanceof Error
          ? error.message
          : 'Could not open the phone camera or gallery.',
      );
    }
  };

  const trackEstimatePart = async ({ job, line }: EstimatePartBoardRow) => {
    const saveKey = `${job.id}-${line.id}`;
    setSavingEstimateLineId(saveKey);

    try {
      await requestPartForJob(job, {
        name: getEstimatePartName(line),
        quantity: String(line.quantity || 1),
        note: buildEstimatePartNote(line),
        requestedBy: appMode,
        status: 'requested',
      });
    } finally {
      setSavingEstimateLineId(null);
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
            <h2 style={titleStyle(compact)}>Parts & Sublets Board</h2>
            <p style={subtitleStyle(compact)}>
              Cross-job parts, sublet invoices, and payment status tied back to the priority job list.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(5, minmax(86px, 1fr))',
              gap: compact ? 8 : 10,
              minWidth: mobile ? '100%' : 540,
            }}
          >
            <Metric label="Open" value={stats.open} compact={compact} tone="blue" />
            <Metric label="Ordered" value={stats.ordered} compact={compact} tone="amber" />
            <Metric label="Received" value={stats.received} compact={compact} tone="green" />
            <Metric label="Reorder" value={stats.reorderNeeded} compact={compact} tone="red" />
            <Metric label="Estimate" value={stats.estimate} compact={compact} tone="blue" />
          </div>
        </div>
      </div>

      {estimateParts.length ? (
        <EstimatePartsPanel
          rows={estimateParts}
          compact={compact}
          mobile={mobile}
          savingEstimateLineId={savingEstimateLineId}
          onOpenJob={onOpenJob}
          onTrackPart={(row) => void trackEstimatePart(row)}
        />
      ) : null}

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
                : 'minmax(190px, 1fr) minmax(210px, 1.2fr) 90px 140px minmax(150px, 0.8fr) minmax(130px, 0.7fr) minmax(180px, 1fr)',
              gap: compact ? 8 : 10,
              alignItems: 'stretch',
            }}
          >
            {!mobile ? (
              <>
                {[
                  { key: 'job' as const, label: 'Job' },
                  { key: 'item' as const, label: 'Item' },
                  { key: 'quantity' as const, label: 'Quantity' },
                  { key: 'status' as const, label: 'Status' },
                  { key: 'invoice' as const, label: 'Invoice' },
                  { key: 'paid' as const, label: 'Paid' },
                  { key: 'note' as const, label: 'Note' },
                ].map((header) => (
                  <HeaderCell
                    key={header.key}
                    compact={compact}
                    active={sort.key === header.key}
                    direction={sort.direction}
                    onClick={() => toggleSort(header.key)}
                  >
                    {header.label}
                  </HeaderCell>
                ))}
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
                onSaveInvoice={async (targetJob, targetPart, invoiceNumber) => {
                  if ((targetPart.invoiceNumber ?? '') === invoiceNumber) return;
                  setSavingPartId(targetPart.id);
                  try {
                    await saveJobPartInvoice(targetJob, targetPart.id, invoiceNumber);
                  } finally {
                    setSavingPartId(null);
                  }
                }}
                onMarkPaid={async (targetJob, targetPart, invoiceNumber) => {
                  setSavingPartId(targetPart.id);
                  try {
                    await markJobPartPaid(targetJob, targetPart.id, invoiceNumber);
                  } finally {
                    setSavingPartId(null);
                  }
                }}
                invoicePhotoActionState={invoicePhotoActionState}
                photoInputRefs={invoicePhotoInputRefs}
                galleryInputRefs={invoiceGalleryInputRefs}
                onInvoicePhotoSelected={addInvoicePhoto}
                onNativeInvoicePhotoSelected={addNativeInvoicePhoto}
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

function EstimatePartsPanel({
  rows,
  compact,
  mobile,
  savingEstimateLineId,
  onOpenJob,
  onTrackPart,
}: {
  rows: EstimatePartBoardRow[];
  compact: boolean;
  mobile: boolean;
  savingEstimateLineId: string | null;
  onOpenJob?: (jobId: string) => void;
  onTrackPart: (row: EstimatePartBoardRow) => void;
}) {
  return (
    <div style={panelStyle(compact)}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: compact ? 12 : 16,
        }}
      >
        <div>
          <h2 style={titleStyle(compact)}>EMS Estimate Parts</h2>
          <p style={subtitleStyle(compact)}>
            Parts found on synced EMS estimates. Add one to live requests before you order or receive it.
          </p>
        </div>
        <div style={estimateCountBadgeStyle(compact)}>
          {rows.length} estimate part{rows.length === 1 ? '' : 's'}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: mobile
            ? '1fr'
            : 'minmax(190px, 1fr) minmax(240px, 1.3fr) 90px minmax(130px, 0.8fr) minmax(120px, 0.7fr) minmax(130px, 0.7fr)',
          gap: compact ? 8 : 10,
          alignItems: 'stretch',
        }}
      >
        {!mobile ? (
          <>
            <HeaderCell compact={compact}>Job</HeaderCell>
            <HeaderCell compact={compact}>Estimate Part</HeaderCell>
            <HeaderCell compact={compact}>Qty</HeaderCell>
            <HeaderCell compact={compact}>Part #</HeaderCell>
            <HeaderCell compact={compact}>Amount</HeaderCell>
            <HeaderCell compact={compact}>Action</HeaderCell>
          </>
        ) : null}

        {rows.map((row) => {
          const saveKey = `${row.job.id}-${row.line.id}`;
          const saving = savingEstimateLineId === saveKey;

          return (
            <EstimatePartRow
              key={saveKey}
              row={row}
              compact={compact}
              mobile={mobile}
              saving={saving}
              onOpenJob={onOpenJob}
              onTrackPart={onTrackPart}
            />
          );
        })}
      </div>
    </div>
  );
}

function EstimatePartRow({
  row,
  compact,
  mobile,
  saving,
  onOpenJob,
  onTrackPart,
}: {
  row: EstimatePartBoardRow;
  compact: boolean;
  mobile: boolean;
  saving: boolean;
  onOpenJob?: (jobId: string) => void;
  onTrackPart: (row: EstimatePartBoardRow) => void;
}) {
  const { job, line } = row;
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
        <div style={{ color: '#f8fafc', fontWeight: 900 }}>
          {line.description || 'Estimate part'}
        </div>
        <div style={mutedStyle(compact)}>
          EMS line {line.lineNumber || '-'} | estimate only
        </div>
      </div>

      <div style={cellStyle(compact, mobile)}>
        <div style={{ fontWeight: 900 }}>{line.quantity || 1}</div>
      </div>

      <div style={cellStyle(compact, mobile)}>
        <div style={{ fontWeight: 800 }}>{line.partNumber || '-'}</div>
      </div>

      <div style={cellStyle(compact, mobile)}>
        <div style={{ fontWeight: 900, color: '#dbeafe' }}>
          {formatMoney(getEstimatePartAmount(line))}
        </div>
      </div>

      <div style={cellStyle(compact, mobile)}>
        <button
          type="button"
          disabled={saving}
          onClick={() => onTrackPart(row)}
          style={trackButtonStyle(saving, compact)}
        >
          {saving ? 'Adding...' : 'Add to Requests'}
        </button>
      </div>
    </>
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
  onSaveInvoice,
  onMarkPaid,
  invoicePhotoActionState,
  photoInputRefs,
  galleryInputRefs,
  onInvoicePhotoSelected,
  onNativeInvoicePhotoSelected,
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
  onSaveInvoice: (job: Job, part: JobPartRequest, invoiceNumber: string) => Promise<void>;
  onMarkPaid: (job: Job, part: JobPartRequest, invoiceNumber: string) => Promise<void>;
  invoicePhotoActionState: {
    jobId: string;
    partId: string;
    phase: 'processing' | 'uploading';
  } | null;
  photoInputRefs: MutableRefObject<Record<string, HTMLInputElement | null>>;
  galleryInputRefs: MutableRefObject<Record<string, HTMLInputElement | null>>;
  onInvoicePhotoSelected: (
    job: Job,
    part: JobPartRequest,
    file: File | null,
  ) => Promise<void>;
  onNativeInvoicePhotoSelected: (
    job: Job,
    part: JobPartRequest,
    source: 'camera' | 'gallery',
  ) => Promise<void>;
}) {
  const disabled = saving;
  const isSublet = (part.kind ?? 'part') === 'sublet';
  const [invoiceDraft, setInvoiceDraft] = useState(part.invoiceNumber ?? '');
  const jobMeta = [
    job.roNumber ? `RO ${job.roNumber}` : '',
    job.claimNumber ? `Claim ${job.claimNumber}` : '',
    job.insuranceCompany ?? '',
  ].filter(Boolean).join(' | ');
  const savedInvoiceNumber = part.invoiceNumber?.trim() ?? '';
  const invoiceDraftChanged = invoiceDraft.trim() !== savedInvoiceNumber;
  const canUseSavedInvoice = Boolean(savedInvoiceNumber) && !invoiceDraftChanged;
  const invoiceRefKey = `${job.id}-${part.id}`;
  const invoicePhotoPhase =
    invoicePhotoActionState?.jobId === job.id &&
    invoicePhotoActionState.partId === part.id
      ? invoicePhotoActionState.phase
      : null;
  const isSavingInvoicePhoto = Boolean(invoicePhotoPhase);

  useEffect(() => {
    setInvoiceDraft(part.invoiceNumber ?? '');
  }, [part.invoiceNumber]);

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
          {isSublet ? 'Sublet' : 'Part'} |{' '}
          Requested by {part.requestedBy === 'tech' ? 'Tech' : 'Manager'}
          {part.requestedBy !== appMode ? ' | other mode' : ''}
        </div>
      </div>

      <div style={cellStyle(compact, mobile)}>
        <div style={{ fontWeight: 800 }}>{part.quantity}</div>
      </div>

      <div style={cellStyle(compact, mobile)}>
        {isSublet ? (
          <div style={{ fontWeight: 900, color: part.paidAt ? '#86efac' : '#fcd34d' }}>
            {part.paidAt ? 'Paid' : 'Unpaid'}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={statusBadgeStyle(part.status, compact)}>
              {formatPartStatus(part.status)}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {part.status === 'requested' ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => void onUpdateStatus(job, part, 'ordered')}
                  style={smallActionButtonStyle(compact)}
                >
                  Mark Ordered
                </button>
              ) : null}
              {part.status !== 'reorderNeeded' && part.status !== 'received' ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => void onUpdateStatus(job, part, 'reorderNeeded')}
                  style={smallActionButtonStyle(compact)}
                >
                  Part Came Wrong
                </button>
              ) : null}
              {part.status !== 'received' ? (
                <button
                  type="button"
                  disabled={disabled || !canUseSavedInvoice}
                  onClick={() => void onUpdateStatus(job, part, 'received')}
                  style={smallActionButtonStyle(compact, true)}
                >
                  Mark Received
                </button>
              ) : null}
            </div>
            {!canUseSavedInvoice && part.status !== 'received' ? (
              <div style={mutedStyle(compact)}>Save invoice # before receiving.</div>
            ) : null}
          </div>
        )}
      </div>

      <div style={cellStyle(compact, mobile)}>
        <div style={{ display: 'grid', gap: 8 }}>
          <input
            value={invoiceDraft}
            disabled={disabled}
            placeholder="Invoice #"
            onChange={(event) => setInvoiceDraft(event.target.value)}
            style={inputStyle(compact)}
          />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => void onSaveInvoice(job, part, invoiceDraft)}
              style={smallActionButtonStyle(compact)}
            >
              {savedInvoiceNumber && !invoiceDraftChanged ? 'Saved' : 'Save Invoice'}
            </button>
            <button
              type="button"
              disabled={disabled || isSavingInvoicePhoto}
              onClick={() =>
                mobile && canUseNativeMobileCamera()
                  ? void onNativeInvoicePhotoSelected(job, part, 'camera')
                  : photoInputRefs.current[invoiceRefKey]?.click()
              }
              style={smallActionButtonStyle(compact)}
            >
              {invoicePhotoPhase === 'processing'
                ? 'Reading...'
                : invoicePhotoPhase === 'uploading'
                  ? 'Saving...'
                  : part.invoicePhoto
                    ? 'Replace Photo'
                    : 'Invoice Photo'}
            </button>
            {mobile ? (
              <button
                type="button"
                disabled={disabled || isSavingInvoicePhoto}
                onClick={() =>
                  canUseNativeMobileCamera()
                    ? void onNativeInvoicePhotoSelected(job, part, 'gallery')
                    : galleryInputRefs.current[invoiceRefKey]?.click()
                }
                style={smallActionButtonStyle(compact)}
              >
                Gallery
              </button>
            ) : null}
          </div>
          <input
            ref={(element) => {
              photoInputRefs.current[invoiceRefKey] = element;
            }}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={(event) =>
              void onInvoicePhotoSelected(
                job,
                part,
                event.target.files?.[0] ?? null,
              )
            }
          />
          <input
            ref={(element) => {
              galleryInputRefs.current[invoiceRefKey] = element;
            }}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(event) =>
              void onInvoicePhotoSelected(
                job,
                part,
                event.target.files?.[0] ?? null,
              )
            }
          />
          <div style={mutedStyle(compact)}>
            {part.invoicePhoto ? 'Invoice photo saved' : 'No invoice photo'}
          </div>
        </div>
      </div>

      <div style={cellStyle(compact, mobile)}>
        <button
          type="button"
          disabled={disabled || Boolean(part.paidAt) || !canUseSavedInvoice}
          onClick={() => void onMarkPaid(job, part, invoiceDraft)}
          style={paidButtonStyle(Boolean(part.paidAt), compact)}
        >
          {part.paidAt ? 'Paid' : 'Mark Paid'}
        </button>
        {part.paidAt ? (
          <div style={mutedStyle(compact)}>{formatDateTime(part.paidAt)}</div>
        ) : null}
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

function isPartBoardItemOpen(part: JobPartRequest) {
  if ((part.kind ?? 'part') === 'sublet') {
    return !part.paidAt;
  }

  return part.status !== 'received' || !part.paidAt;
}

function sortPartRows(rows: PartBoardRow[], sort: PartsSort) {
  return [...rows].sort((left, right) => {
    const comparison = compareSortValues(
      getPartSortValue(left, sort.key),
      getPartSortValue(right, sort.key),
    );

    return sort.direction === 'asc' ? comparison : comparison * -1;
  });
}

function isOrderableEstimatePart(line: EmsEstimateLine) {
  if (isRefinishEstimateLine(line)) return false;

  const partAmount = getEstimatePartAmount(line);
  if (partAmount <= 0) return false;
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

function getEstimatePartName(line: EmsEstimateLine) {
  const description = String(line.description ?? '').trim();
  const partNumber = String(line.partNumber ?? '').trim();

  if (description && partNumber) return `${description} (${partNumber})`;
  return description || partNumber || 'Estimate part';
}

function getEstimatePartAmount(line: EmsEstimateLine) {
  const amount = Number(line.partPrice ?? 0);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function buildEstimatePartNote(line: EmsEstimateLine) {
  const details = [
    line.lineNumber ? `EMS line ${line.lineNumber}` : 'EMS estimate line',
    line.partNumber ? `part # ${line.partNumber}` : '',
    getEstimatePartAmount(line) ? `estimate ${formatMoney(getEstimatePartAmount(line))}` : '',
  ].filter(Boolean);

  return `Tracked from ${details.join(' | ')}.`;
}

function getPartSortValue(row: PartBoardRow, key: PartsSortKey) {
  switch (key) {
    case 'job':
      return row.job.roNumber || row.job.vehicle || row.job.customerName;
    case 'item':
      return row.part.name;
    case 'quantity':
      return Number(row.part.quantity) || row.part.quantity;
    case 'status':
      return (row.part.kind ?? 'part') === 'sublet'
        ? row.part.paidAt ? 'paid' : 'unpaid'
        : row.part.status;
    case 'invoice':
      return row.part.invoiceNumber ?? '';
    case 'paid':
      return row.part.paidAt ? new Date(row.part.paidAt).getTime() || 0 : 0;
    case 'note':
      return row.part.note ?? '';
    default:
      return '';
  }
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

function HeaderCell({
  children,
  compact,
  active,
  direction,
  onClick,
}: {
  children: ReactNode;
  compact: boolean;
  active?: boolean;
  direction?: SortDirection;
  onClick?: () => void;
}) {
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
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          style={{
            border: 0,
            padding: 0,
            margin: 0,
            background: 'transparent',
            color: active ? '#ffffff' : '#93a4ba',
            font: 'inherit',
            fontWeight: 900,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          <span>{children}</span>
          <span style={{ color: active ? '#93c5fd' : '#64748b' }}>
            {active ? (direction === 'asc' ? '^' : 'v') : '-'}
          </span>
        </button>
      ) : (
        children
      )}
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

function estimateCountBadgeStyle(compact: boolean): CSSProperties {
  return {
    borderRadius: 999,
    border: '1px solid rgba(147,197,253,0.36)',
    background: 'rgba(37,99,235,0.2)',
    color: '#dbeafe',
    padding: compact ? '7px 10px' : '9px 12px',
    fontSize: compact ? 12 : 13,
    fontWeight: 900,
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

function statusBadgeStyle(status: JobPartStatus, compact: boolean): CSSProperties {
  const colors: Record<JobPartStatus, { bg: string; border: string; color: string }> = {
    requested: {
      bg: 'rgba(180,83,9,0.22)',
      border: '1px solid rgba(251,191,36,0.28)',
      color: '#fde68a',
    },
    ordered: {
      bg: 'rgba(37,99,235,0.22)',
      border: '1px solid rgba(96,165,250,0.34)',
      color: '#dbeafe',
    },
    reorderNeeded: {
      bg: 'rgba(127,29,29,0.28)',
      border: '1px solid rgba(248,113,113,0.32)',
      color: '#fecaca',
    },
    received: {
      bg: 'rgba(22,163,74,0.22)',
      border: '1px solid rgba(74,222,128,0.28)',
      color: '#dcfce7',
    },
  };
  const tone = colors[status];

  return {
    justifySelf: 'start',
    borderRadius: 999,
    border: tone.border,
    background: tone.bg,
    color: tone.color,
    padding: compact ? '5px 8px' : '6px 10px',
    fontSize: compact ? 11 : 12,
    fontWeight: 900,
  };
}

function smallActionButtonStyle(compact: boolean, primary = false): CSSProperties {
  return {
    borderRadius: compact ? 9 : 10,
    border: primary
      ? '1px solid rgba(96,165,250,0.42)'
      : '1px solid rgba(148,163,184,0.32)',
    background: primary ? '#1d4ed8' : 'rgba(51,65,85,0.92)',
    color: '#f8fafc',
    padding: compact ? '6px 8px' : '7px 9px',
    fontSize: compact ? 11 : 12,
    fontWeight: 900,
    cursor: 'pointer',
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

function paidButtonStyle(paid: boolean, compact: boolean): CSSProperties {
  return {
    width: '100%',
    borderRadius: compact ? 10 : 12,
    border: paid ? '1px solid rgba(134,239,172,0.36)' : '1px solid rgba(96,165,250,0.42)',
    background: paid ? 'rgba(22,101,52,0.42)' : '#1d4ed8',
    color: '#f8fafc',
    padding: compact ? '7px 8px' : '9px 10px',
    fontSize: compact ? 12 : 13,
    fontWeight: 900,
    cursor: paid ? 'default' : 'pointer',
    opacity: paid ? 0.82 : 1,
  };
}

function trackButtonStyle(saving: boolean, compact: boolean): CSSProperties {
  return {
    width: '100%',
    borderRadius: compact ? 10 : 12,
    border: '1px solid rgba(96,165,250,0.42)',
    background: saving ? 'rgba(71,85,105,0.72)' : '#1d4ed8',
    color: '#f8fafc',
    padding: compact ? '7px 8px' : '9px 10px',
    fontSize: compact ? 12 : 13,
    fontWeight: 900,
    cursor: saving ? 'wait' : 'pointer',
    opacity: saving ? 0.82 : 1,
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

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateTime(value: string) {
  if (!value) return 'Unknown';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString([], {
    month: 'numeric',
    day: 'numeric',
    year: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatPartStatus(status: JobPartStatus) {
  switch (status) {
    case 'requested':
      return 'Requested';
    case 'ordered':
      return 'Ordered';
    case 'reorderNeeded':
      return 'Reorder Needed';
    case 'received':
      return 'Received';
    default:
      return status;
  }
}

export default PartsTab;
