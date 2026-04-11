import React, { useEffect, useMemo, useState } from 'react';
import { useRef } from 'react';
import ActiveJobsSection from './ActiveJobsSection';
import CompletedJobsSection from './CompletedJobsSection';
import { appBridge } from '../../services/platform/appBridge';
import type {
  AppMode,
  AmountStatus,
  CreateJobInput,
  Job,
  JobPartStatus,
  JobStatus,
  UpdateJobDetailsInput,
} from '../../types/app';
import {
  addAudioNoteToJob,
  addPhotoToJob,
  clearLegacyPartsWaiting,
  markJobPartReceived,
  addTextNoteToJob,
  createJob,
  markJobDone,
  markJobNotesRead,
  requestPartForJob,
  saveJobPartNote,
  setActiveJobPosition,
  subscribeToJobs,
  syncJobsFromMitchell,
  undoJobDone,
  updateJobPartStatus,
  updateJobDetails,
  updateJobStatus,
} from '../../services/firebase/jobs';

type JobsTabProps = {
  showAddJob?: boolean;
  compact?: boolean;
  mobile?: boolean;
  appMode: AppMode;
  focusedJobId?: string | null;
  focusedJobDone?: boolean;
  onFocusedJobHandled?: () => void;
};

type AddJobFormState = {
  vehicle: string;
  roNumber: string;
  customerName: string;
  paintCode: string;
  amount: string;
  amountStatus: AmountStatus;
  status: JobStatus;
  promiseDate: string;
  partsWaiting: boolean;
  initialPartName: string;
  initialPartQuantity: string;
  initialPartNote: string;
  initialPartStatus: Exclude<JobPartStatus, 'received'>;
  initialNote: string;
};

const initialFormState: AddJobFormState = {
  vehicle: '',
  roNumber: '',
  customerName: '',
  paintCode: '',
  amount: '',
  amountStatus: 'notFinal',
  status: 'notStarted',
  promiseDate: '',
  partsWaiting: false,
  initialPartName: '',
  initialPartQuantity: '',
  initialPartNote: '',
  initialPartStatus: 'requested',
  initialNote: '',
};

const MITCHELL_SYNC_INTERVAL_MS = 1000 * 30;

function JobsTab({
  showAddJob = false,
  compact = false,
  mobile = false,
  appMode,
  focusedJobId = null,
  focusedJobDone = false,
  onFocusedJobHandled,
}: JobsTabProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const desktopFolderSyncRef = useRef<Record<string, string>>({});
  const desktopJobRecordSyncRef = useRef<Record<string, string>>({});

  const [showAddJobModal, setShowAddJobModal] = useState(false);
  const [addJobForm, setAddJobForm] = useState<AddJobFormState>(initialFormState);
  const [savingJob, setSavingJob] = useState(false);
  const [addJobError, setAddJobError] = useState<string | null>(null);
  const [mitchellSyncMessage, setMitchellSyncMessage] = useState<string | null>(null);
  const [mitchellSyncError, setMitchellSyncError] = useState<string | null>(null);
  const [lastMitchellSyncAt, setLastMitchellSyncAt] = useState<string | null>(null);
  const [isMitchellSyncing, setIsMitchellSyncing] = useState(false);
  const runMitchellSyncRef = useRef<(force?: boolean) => Promise<void>>(async () => {});

  const applyOptimisticActiveOrder = (
    sourceJobs: Job[],
    orderedActiveIds: string[],
  ) => {
    const nextOrderMap = new Map(
      orderedActiveIds.map((jobId, index) => [jobId, index + 1]),
    );

    setJobs(
      sourceJobs.map((job) =>
        !job.done && nextOrderMap.has(job.id)
          ? {
              ...job,
              sortOrder: nextOrderMap.get(job.id),
            }
          : job,
      ),
    );
  };

  useEffect(() => {
    const unsubscribe = subscribeToJobs((nextJobs) => {
      setJobs(nextJobs);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!appBridge.isDesktop()) {
      return;
    }

    let cancelled = false;

    const syncDesktopRoFolders = async () => {
      for (const job of jobs) {
        if (!job.roNumber.trim()) {
          continue;
        }

        const nextSignature = [
          job.customerName.trim(),
          job.done ? 'closed' : 'active',
        ].join('|');

        if (desktopFolderSyncRef.current[job.id] === nextSignature) {
          continue;
        }

        try {
          if (job.done) {
            await appBridge.moveRoFolderForJob({
              roNumber: job.roNumber,
              customerName: job.customerName,
              done: true,
            });
          } else {
            await appBridge.ensureRoFolderForJob({
              roNumber: job.roNumber,
              customerName: job.customerName,
              done: false,
            });
          }

          if (cancelled) {
            return;
          }

          desktopFolderSyncRef.current[job.id] = nextSignature;
        } catch (error) {
          console.error('Failed to sync RO folder from job state:', error);
        }

        const jobRecordSignature = JSON.stringify(job);
        if (desktopJobRecordSyncRef.current[job.id] === jobRecordSignature) {
          continue;
        }

        try {
          await appBridge.saveJobRecordToRoFolder({ job });

          if (cancelled) {
            return;
          }

          desktopJobRecordSyncRef.current[job.id] = jobRecordSignature;
        } catch (error) {
          console.error('Failed to save job record into RO folder:', error);
        }
      }
    };

    void syncDesktopRoFolders();

    return () => {
      cancelled = true;
    };
  }, [jobs]);

  useEffect(() => {
    if (!appBridge.isDesktop()) {
      return;
    }

    let mounted = true;
    let syncing = false;
    let lastSourceModifiedAt: string | null = null;

    const runMitchellSync = async (force = false) => {
      if (syncing) {
        return;
      }

      try {
        syncing = true;
        if (mounted) {
          setIsMitchellSyncing(true);
        }
        if (force && mounted) {
          setMitchellSyncMessage('Syncing Mitchell active jobs...');
        }

        const snapshot = await appBridge.getMitchellJobsSnapshot();
        if (!force && snapshot.lastModifiedAt === lastSourceModifiedAt) {
          if (mounted) {
            setMitchellSyncMessage(
              `Mitchell sync active. Last checked ${formatDateTime(new Date().toISOString())}.`,
            );
            setMitchellSyncError(null);
          }
          return;
        }

        await syncJobsFromMitchell(snapshot);
        lastSourceModifiedAt = snapshot.lastModifiedAt;

        if (mounted) {
          const now = new Date().toISOString();
          setLastMitchellSyncAt(now);
          setMitchellSyncError(null);
          setMitchellSyncMessage(
            `Mitchell sync active. ${snapshot.jobs.length} jobs checked from ${snapshot.sourcePath}.`,
          );
        }
      } catch (error) {
        if (mounted) {
          setMitchellSyncError(
            error instanceof Error
              ? error.message
              : 'Mitchell sync failed.',
          );
        }
      } finally {
        syncing = false;
        if (mounted) {
          setIsMitchellSyncing(false);
        }
      }
    };

    runMitchellSyncRef.current = runMitchellSync;

    void runMitchellSync(true);
    const timer = window.setInterval(() => {
      void runMitchellSync(false);
    }, MITCHELL_SYNC_INTERVAL_MS);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  const activeJobs = useMemo(
    () =>
      [...jobs]
        .filter((job) => !job.done)
        .sort((a, b) => {
          const aOrder =
            typeof a.sortOrder === 'number' ? a.sortOrder : Number.MAX_SAFE_INTEGER;
          const bOrder =
            typeof b.sortOrder === 'number' ? b.sortOrder : Number.MAX_SAFE_INTEGER;

          if (aOrder !== bOrder) {
            return aOrder - bOrder;
          }

          return a.vehicle.localeCompare(b.vehicle);
        }),
    [jobs],
  );

  const completedJobs = useMemo(
    () =>
      [...jobs]
        .filter((job) => job.done)
        .sort((a, b) => a.vehicle.localeCompare(b.vehicle)),
    [jobs],
  );

  const visibleActiveJobs = useMemo(
    () => (compact ? activeJobs.slice(0, 1) : activeJobs),
    [activeJobs, compact],
  );

  const topPriorityJob = visibleActiveJobs[0] ?? null;

  const handleChangeStatus = async (jobId: string) => {
    const job = jobs.find((j) => j.id === jobId);
    if (!job || job.done) return;

    await updateJobStatus(jobId, getNextStatus(job.status));
  };

  const handleMarkDone = async (jobId: string) => {
    await markJobDone(jobId);
  };

  const handleUndoDone = async (jobId: string) => {
    await undoJobDone(jobId);
  };

  const handleAddTextNote = async (jobId: string, text: string) => {
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;

    await addTextNoteToJob(job, text);
  };

  const handleAddAudioNote = async (jobId: string, file: Blob) => {
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;

    await addAudioNoteToJob(job, file);
  };

  const handleAddPhoto = async (
    jobId: string,
    processed: {
      file: Blob;
      width: number;
      height: number;
      fileSize: number;
      timestampIncluded: boolean;
    },
  ) => {
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;

    await addPhotoToJob(job, processed);
  };

  const handleMarkNotesRead = async (jobId: string) => {
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;

    await markJobNotesRead(job);
  };

  const handleRequestPart = async (
    jobId: string,
    input: { name: string; quantity: string; note?: string },
  ) => {
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;

    await requestPartForJob(job, {
      ...input,
      requestedBy: appMode,
    });
  };

  const handleSetPartOrdered = async (jobId: string, partId: string) => {
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;

    await updateJobPartStatus(job, partId, 'ordered');
  };

  const handleMarkPartReceived = async (jobId: string, partId: string) => {
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;

    await markJobPartReceived(job, partId);
  };

  const handleSavePartNote = async (
    jobId: string,
    partId: string,
    note: string,
  ) => {
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;

    await saveJobPartNote(job, partId, note);
  };

  const handleSetPartReorderNeeded = async (jobId: string, partId: string) => {
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;

    await updateJobPartStatus(job, partId, 'reorderNeeded');
  };

  const handleClearLegacyPartsWaiting = async (jobId: string) => {
    await clearLegacyPartsWaiting(jobId);
  };

  const handleSetPriorityPosition = async (jobId: string, position: number) => {
    const orderedActiveIds = activeJobs.map((job) => job.id);
    const currentIndex = orderedActiveIds.findIndex((id) => id === jobId);
    if (currentIndex === -1) return;

    const nextIndex = Math.max(0, Math.min(position - 1, orderedActiveIds.length - 1));
    if (currentIndex === nextIndex) return;

    const reorderedIds = [...orderedActiveIds];
    const [movedId] = reorderedIds.splice(currentIndex, 1);
    reorderedIds.splice(nextIndex, 0, movedId);

    applyOptimisticActiveOrder(jobs, reorderedIds);
    await setActiveJobPosition(activeJobs, jobId, position);
  };

  const handleUpdateJobDetails = async (
    jobId: string,
    input: UpdateJobDetailsInput,
  ) => {
    await updateJobDetails(jobId, input);
  };

  const handleManualMitchellSync = async () => {
    await runMitchellSyncRef.current(true);
  };

  const openAddJobModal = () => {
    setAddJobForm(initialFormState);
    setAddJobError(null);
    setShowAddJobModal(true);
  };

  const closeAddJobModal = () => {
    if (savingJob) return;
    setShowAddJobModal(false);
    setAddJobError(null);
  };

  const updateForm = <K extends keyof AddJobFormState>(
    key: K,
    value: AddJobFormState[K]
  ) => {
    setAddJobForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleCreateJob = async () => {
    const vehicle = addJobForm.vehicle.trim();
    const roNumber = addJobForm.roNumber.trim();
    const customerName = addJobForm.customerName.trim();
    const amountValue = addJobForm.amount.trim();

    if (!vehicle) {
      setAddJobError('Vehicle is required.');
      return;
    }

    if (!roNumber) {
      setAddJobError('RO number is required.');
      return;
    }

    if (!customerName) {
      setAddJobError('Customer name is required.');
      return;
    }

    const parsedAmount = amountValue === '' ? 0 : Number(amountValue);

    if (Number.isNaN(parsedAmount) || parsedAmount < 0) {
      setAddJobError('Amount must be a valid number.');
      return;
    }

    const payload: CreateJobInput = {
      vehicle,
      roNumber,
      customerName,
      paintCode: addJobForm.paintCode.trim(),
      amount: parsedAmount,
      amountStatus: addJobForm.amountStatus,
      status: addJobForm.status,
      promiseDate: addJobForm.promiseDate,
      partsWaiting: addJobForm.partsWaiting,
      initialPartName: addJobForm.initialPartName,
      initialPartQuantity: addJobForm.initialPartQuantity,
      initialPartNote: addJobForm.initialPartNote,
      initialPartStatus: addJobForm.initialPartStatus,
      initialNote: addJobForm.initialNote,
    };

    try {
      setSavingJob(true);
      setAddJobError(null);
      await createJob(payload);
      setShowAddJobModal(false);
      setAddJobForm(initialFormState);
    } catch (error) {
      console.error('Failed to create job:', error);
      setAddJobError('Could not create job. Please try again.');
    } finally {
      setSavingJob(false);
    }
  };

  if (loading) {
    return (
      <div
        style={{
          borderRadius: compact ? 16 : 24,
          padding: compact ? 14 : 28,
          background: 'rgba(15,23,42,0.78)',
          border: '1px solid rgba(148,163,184,0.18)',
          color: '#cbd5e1',
          fontSize: compact ? 13 : 16,
          fontWeight: 700,
        }}
      >
        Loading jobs...
      </div>
    );
  }

  return (
    <>
      <div style={{ display: 'grid', gap: compact ? 10 : 24 }}>
        {appBridge.isDesktop() ? (
          <div
            style={{
              display: 'grid',
              gap: 10,
            }}
          >
            <div
              style={{
                borderRadius: compact ? 14 : 18,
                padding: compact ? '10px 12px' : '12px 16px',
                background: mitchellSyncError
                  ? 'rgba(127,29,29,0.32)'
                  : 'rgba(22,163,74,0.14)',
                border: mitchellSyncError
                  ? '1px solid rgba(248,113,113,0.34)'
                  : '1px solid rgba(74,222,128,0.24)',
                color: mitchellSyncError ? '#fecaca' : '#dcfce7',
                fontSize: compact ? 12 : 13,
                fontWeight: 800,
                lineHeight: 1.5,
              }}
            >
              {mitchellSyncError
                ? `Mitchell sync error: ${mitchellSyncError}`
                : mitchellSyncMessage ?? 'Mitchell sync is starting...'}
              {lastMitchellSyncAt && !mitchellSyncError
                ? ` Last synced ${formatDateTime(lastMitchellSyncAt)}.`
                : ''}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => {
                  void handleManualMitchellSync();
                }}
                disabled={isMitchellSyncing}
                style={{
                  border: '1px solid rgba(96,165,250,0.45)',
                  background: isMitchellSyncing
                    ? 'rgba(51,65,85,0.92)'
                    : 'linear-gradient(180deg, rgba(37,99,235,0.92), rgba(29,78,216,0.92))',
                  color: '#eff6ff',
                  fontWeight: 800,
                  fontSize: mobile ? 13 : 14,
                  padding: mobile ? '10px 14px' : '10px 16px',
                  borderRadius: 12,
                  cursor: isMitchellSyncing ? 'not-allowed' : 'pointer',
                  opacity: isMitchellSyncing ? 0.75 : 1,
                  width: mobile ? '100%' : 'auto',
                }}
              >
                {isMitchellSyncing ? 'Syncing Repair Center...' : 'Sync Repair Center Now'}
              </button>
            </div>
          </div>
        ) : null}

        {showAddJob ? (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={openAddJobModal}
              style={{
                border: '1px solid rgba(96,165,250,0.45)',
                background: 'linear-gradient(180deg, rgba(37,99,235,0.92), rgba(29,78,216,0.92))',
                color: '#eff6ff',
                fontWeight: 800,
                fontSize: mobile ? 13 : 14,
                padding: mobile ? '12px 14px' : '12px 18px',
                borderRadius: 14,
                cursor: 'pointer',
                boxShadow: '0 10px 30px rgba(37,99,235,0.24)',
                width: mobile ? '100%' : 'auto',
              }}
            >
              + Add Job
            </button>
          </div>
        ) : null}

        {compact ? (
          <div
            style={{
              borderRadius: 16,
              padding: '12px 14px',
              background: 'rgba(37,99,235,0.14)',
              border: '1px solid rgba(96,165,250,0.24)',
              color: '#dbeafe',
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            {topPriorityJob
              ? 'Compact view shows only the top priority job.'
              : 'No active jobs right now.'}
          </div>
        ) : null}

        <ActiveJobsSection
          jobs={visibleActiveJobs}
          compact={compact}
          mobile={mobile}
          appMode={appMode}
          focusedJobId={focusedJobDone ? null : focusedJobId}
          onFocusedJobHandled={focusedJobDone ? undefined : onFocusedJobHandled}
          onChangeStatus={handleChangeStatus}
          onMarkDone={handleMarkDone}
          onAddTextNote={handleAddTextNote}
          onAddAudioNote={handleAddAudioNote}
          onAddPhoto={handleAddPhoto}
          onMarkNotesRead={handleMarkNotesRead}
          onRequestPart={handleRequestPart}
          onSetPartOrdered={handleSetPartOrdered}
          onSetPartReorderNeeded={handleSetPartReorderNeeded}
          onMarkPartReceived={handleMarkPartReceived}
          onSavePartNote={handleSavePartNote}
          onClearLegacyPartsWaiting={handleClearLegacyPartsWaiting}
          onSetPriorityPosition={handleSetPriorityPosition}
          onUpdateJobDetails={handleUpdateJobDetails}
        />

        {!compact || mobile ? (
          <CompletedJobsSection
            jobs={completedJobs}
            compact={compact}
            focusedJobId={focusedJobDone ? focusedJobId : null}
            onFocusedJobHandled={focusedJobDone ? onFocusedJobHandled : undefined}
            onAddTextNote={handleAddTextNote}
            onMarkNotesRead={handleMarkNotesRead}
            onSetPartOrdered={handleSetPartOrdered}
            onSetPartReorderNeeded={handleSetPartReorderNeeded}
            onMarkPartReceived={handleMarkPartReceived}
            onSavePartNote={handleSavePartNote}
            onClearLegacyPartsWaiting={handleClearLegacyPartsWaiting}
            onUpdateJobDetails={handleUpdateJobDetails}
            onUndoDone={handleUndoDone}
          />
        ) : null}
      </div>

      {showAddJobModal ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999,
            background: 'rgba(2,6,23,0.62)',
            backdropFilter: 'blur(4px)',
            display: 'grid',
            placeItems: 'center',
            padding: 20,
          }}
          onClick={closeAddJobModal}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: mobile ? '100%' : 'min(860px, 100%)',
              maxHeight: mobile ? '100vh' : 'calc(100vh - 40px)',
              borderRadius: 24,
              background:
                'linear-gradient(180deg, rgba(15,23,42,0.98), rgba(2,6,23,0.98))',
              border: '1px solid rgba(148,163,184,0.18)',
              boxShadow: '0 30px 80px rgba(0,0,0,0.45)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                padding: mobile ? '16px' : '20px 24px',
                borderBottom: '1px solid rgba(148,163,184,0.14)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
              }}
            >
              <div>
                <div
                  style={{
                    color: '#f8fafc',
                    fontWeight: 900,
                    fontSize: mobile ? 20 : 22,
                    lineHeight: 1.1,
                  }}
                >
                  Add Job
                </div>
                <div
                  style={{
                    color: '#94a3b8',
                    fontSize: 13,
                    marginTop: 6,
                  }}
                >
                  Create a new active job and save it straight to Firestore, because doing
                  things manually forever is apparently still popular.
                </div>
              </div>

              <button
                type="button"
                onClick={closeAddJobModal}
                disabled={savingJob}
                style={{
                  border: '1px solid rgba(148,163,184,0.18)',
                  background: 'rgba(15,23,42,0.7)',
                  color: '#cbd5e1',
                  fontWeight: 800,
                  fontSize: 13,
                  padding: '9px 12px',
                  borderRadius: 12,
                  cursor: savingJob ? 'not-allowed' : 'pointer',
                  opacity: savingJob ? 0.6 : 1,
                }}
              >
                Close
              </button>
            </div>

            <div
              style={{
                padding: mobile ? 16 : 24,
                display: 'grid',
                gap: 18,
                overflowY: 'auto',
                minHeight: 0,
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: mobile ? '1fr' : '1fr 1fr',
                  gap: 18,
                }}
              >
                <Field
                  label="Vehicle"
                  required
                  value={addJobForm.vehicle}
                  onChange={(value) => updateForm('vehicle', value)}
                  placeholder="2021 Honda Accord"
                />

                <Field
                  label="RO Number"
                  required
                  value={addJobForm.roNumber}
                  onChange={(value) => updateForm('roNumber', value)}
                  placeholder="RO-10427"
                />

                <Field
                  label="Customer Name"
                  required
                  value={addJobForm.customerName}
                  onChange={(value) => updateForm('customerName', value)}
                  placeholder="John Smith"
                />

                <Field
                  label="Paint Code"
                  value={addJobForm.paintCode}
                  onChange={(value) => updateForm('paintCode', value)}
                  placeholder="NH-731P"
                />

                <Field
                  label="Amount"
                  value={addJobForm.amount}
                  onChange={(value) => updateForm('amount', value)}
                  placeholder="0.00"
                  inputMode="decimal"
                />

                <SelectField
                  label="Amount Status"
                  value={addJobForm.amountStatus}
                  onChange={(value) =>
                    updateForm('amountStatus', value as AmountStatus)
                  }
                  options={[
                    { value: 'notFinal', label: 'Not Final' },
                    { value: 'final', label: 'Final' },
                  ]}
                />

                <SelectField
                  label="Status"
                  value={addJobForm.status}
                  onChange={(value) => updateForm('status', value as JobStatus)}
                  options={[
                    { value: 'notStarted', label: 'Not Started' },
                    { value: 'inProgress', label: 'In Progress' },
                    { value: 'waiting', label: 'Waiting' },
                  ]}
                />

                <Field
                  label="Promise Date"
                  value={addJobForm.promiseDate}
                  onChange={(value) => updateForm('promiseDate', value)}
                  type="date"
                />

                <CheckboxField
                  label="Parts Waiting"
                  checked={addJobForm.partsWaiting}
                  onChange={(checked) => updateForm('partsWaiting', checked)}
                />

                {showAddJob ? (
                  <>
                    <Field
                      label="Initial Part"
                      value={addJobForm.initialPartName}
                      onChange={(value) => updateForm('initialPartName', value)}
                      placeholder="Front bumper bracket"
                    />

                    <Field
                      label="Initial Part Qty"
                      value={addJobForm.initialPartQuantity}
                      onChange={(value) => updateForm('initialPartQuantity', value)}
                      placeholder="1"
                    />

                    <SelectField
                      label="Initial Part Status"
                      value={addJobForm.initialPartStatus}
                      onChange={(value) =>
                        updateForm(
                          'initialPartStatus',
                          value as Exclude<JobPartStatus, 'received'>,
                        )
                      }
                      options={[
                        { value: 'requested', label: 'Requested' },
                        { value: 'ordered', label: 'Ordered' },
                      ]}
                    />

                    <TextAreaField
                      label="Initial Part Note"
                      value={addJobForm.initialPartNote}
                      onChange={(value) => updateForm('initialPartNote', value)}
                      placeholder="Optional note about the part..."
                    />
                  </>
                ) : null}
              </div>

              <TextAreaField
                label="Initial Note"
                value={addJobForm.initialNote}
                onChange={(value) => updateForm('initialNote', value)}
                placeholder="Optional first note for the job..."
              />

              {addJobError ? (
                <div
                  style={{
                    borderRadius: 14,
                    padding: '12px 14px',
                    background: 'rgba(127,29,29,0.32)',
                    border: '1px solid rgba(248,113,113,0.32)',
                    color: '#fecaca',
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  {addJobError}
                </div>
              ) : null}

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 12,
                  paddingTop: 4,
                }}
              >
                <button
                  type="button"
                  onClick={closeAddJobModal}
                  disabled={savingJob}
                  style={{
                    border: '1px solid rgba(148,163,184,0.18)',
                    background: 'rgba(15,23,42,0.7)',
                    color: '#cbd5e1',
                    fontWeight: 800,
                    fontSize: 14,
                    padding: '11px 16px',
                    borderRadius: 12,
                    cursor: savingJob ? 'not-allowed' : 'pointer',
                    opacity: savingJob ? 0.6 : 1,
                  }}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleCreateJob}
                  disabled={savingJob}
                  style={{
                    border: '1px solid rgba(96,165,250,0.45)',
                    background:
                      'linear-gradient(180deg, rgba(37,99,235,0.92), rgba(29,78,216,0.92))',
                    color: '#eff6ff',
                    fontWeight: 900,
                    fontSize: 14,
                    padding: '11px 18px',
                    borderRadius: 12,
                    cursor: savingJob ? 'not-allowed' : 'pointer',
                    opacity: savingJob ? 0.7 : 1,
                    boxShadow: '0 10px 30px rgba(37,99,235,0.24)',
                  }}
                >
                  {savingJob ? 'Saving...' : 'Save Job'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  compact?: boolean;
  required?: boolean;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
};

function Field({
  label,
  value,
  onChange,
  placeholder,
  compact = false,
  required = false,
  type = 'text',
  inputMode,
}: FieldProps) {
  return (
    <label style={{ display: 'grid', gap: 8 }}>
      <span
        style={{
          color: '#cbd5e1',
          fontSize: compact ? 12 : 13,
          fontWeight: 800,
          letterSpacing: 0.2,
        }}
      >
        {label}
        {required ? ' *' : ''}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        style={inputStyle(compact)}
      />
    </label>
  );
}

type SelectFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  compact?: boolean;
};

function SelectField({
  label,
  value,
  onChange,
  options,
  compact = false,
}: SelectFieldProps) {
  return (
    <label style={{ display: 'grid', gap: 8 }}>
      <span
        style={{
          color: '#cbd5e1',
          fontSize: compact ? 12 : 13,
          fontWeight: 800,
          letterSpacing: 0.2,
        }}
      >
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={inputStyle(compact)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

type TextAreaFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  compact?: boolean;
};

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  compact = false,
}: TextAreaFieldProps) {
  return (
    <label style={{ display: 'grid', gap: 8 }}>
      <span
        style={{
          color: '#cbd5e1',
          fontSize: compact ? 12 : 13,
          fontWeight: 800,
          letterSpacing: 0.2,
        }}
      >
        {label}
      </span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={4}
        style={{
          ...inputStyle(compact),
          resize: 'vertical',
          minHeight: compact ? 92 : 110,
          fontFamily: 'inherit',
        }}
      />
    </label>
  );
}

type CheckboxFieldProps = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  compact?: boolean;
};

function CheckboxField({
  label,
  checked,
  onChange,
  compact = false,
}: CheckboxFieldProps) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        minHeight: compact ? 42 : 46,
        marginTop: compact ? 22 : 24,
        color: '#cbd5e1',
        fontSize: compact ? 12 : 13,
        fontWeight: 800,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        style={{ width: 16, height: 16 }}
      />
      {label}
    </label>
  );
}

function inputStyle(compact: boolean): React.CSSProperties {
  return {
    width: '100%',
    borderRadius: 12,
    border: '1px solid rgba(148,163,184,0.18)',
    background: 'rgba(15,23,42,0.84)',
    color: '#f8fafc',
    fontSize: compact ? 13 : 14,
    fontWeight: 600,
    padding: compact ? '10px 12px' : '11px 13px',
    outline: 'none',
    boxSizing: 'border-box',
  };
}

function formatDateTime(value: string) {
  const date = new Date(value);

  return new Intl.DateTimeFormat('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function getNextStatus(status: JobStatus): JobStatus {
  switch (status) {
    case 'notStarted':
      return 'inProgress';
    case 'inProgress':
      return 'waiting';
    case 'waiting':
      return 'notStarted';
    case 'done':
      return 'done';
    default:
      return 'notStarted';
  }
}

export default JobsTab;
