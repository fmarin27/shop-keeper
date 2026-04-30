import React, { useEffect, useMemo, useState } from 'react';
import ActiveJobsSection from './ActiveJobsSection';
import CompletedJobsSection from './CompletedJobsSection';
import { appBridge } from '../../services/platform/appBridge';
import type {
  AppMode,
  AmountStatus,
  CreateJobInput,
  EmsImportCandidate,
  EmsImportCandidatesSnapshot,
  Job,
  JobPartStatus,
  JobStatus,
  UpdateJobDetailsInput,
} from '../../types/app';
import {
  addAudioNoteToJob,
  addPhotoToJob,
  clearLegacyPartsWaiting,
  deleteJobNote,
  deleteJobPart,
  deletePhotoFromJob,
  markJobPartReceived,
  addTextNoteToJob,
  convertEmsRepairOrderToJob,
  createJob,
  markJobDone,
  markJobNotesRead,
  requestPartForJob,
  saveJobPartNote,
  setActiveJobPosition,
  subscribeToJobs,
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
  phoneNumber: string;
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
  phoneNumber: '',
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

const ACTIVE_JOB_STATUSES: Exclude<JobStatus, 'done'>[] = [
  'notStarted',
  'inProgress',
  'waiting',
  'waitingOnAppraiser',
  'supplementNeeded',
];

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

  const [showAddJobModal, setShowAddJobModal] = useState(false);
  const [addJobForm, setAddJobForm] = useState<AddJobFormState>(initialFormState);
  const [savingJob, setSavingJob] = useState(false);
  const [addJobError, setAddJobError] = useState<string | null>(null);
  const [emsImportMessage, setEmsImportMessage] = useState<string | null>(
    'EMS import is manual. The app watches this PC and the office PC, then you choose which EMS bundle becomes an RO.',
  );
  const [emsImportError, setEmsImportError] = useState<string | null>(null);
  const [emsCandidatesSnapshot, setEmsCandidatesSnapshot] =
    useState<EmsImportCandidatesSnapshot | null>(null);
  const [showEmsImportModal, setShowEmsImportModal] = useState(false);
  const [loadingEmsCandidates, setLoadingEmsCandidates] = useState(false);
  const [convertingEmsCandidateId, setConvertingEmsCandidateId] = useState<
    string | null
  >(null);

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

  const visibleActiveJobs = useMemo(() => activeJobs, [activeJobs]);

  const topPriorityJob = visibleActiveJobs[0] ?? null;
  const emsCandidateCount = emsCandidatesSnapshot?.candidates.length ?? 0;
  const isEmsImportBusy = loadingEmsCandidates || Boolean(convertingEmsCandidateId);

  const refreshEmsCandidates = async (options: { silent?: boolean } = {}) => {
    if (!appBridge.isDesktop()) {
      return null;
    }

    if (!options.silent) {
      setLoadingEmsCandidates(true);
      setEmsImportError(null);
    }

    try {
      const snapshot = await appBridge.listEmsImportCandidates();
      setEmsCandidatesSnapshot(snapshot);

      if (!options.silent) {
        setEmsImportMessage(
          `EMS watch found ${snapshot.candidates.length} bundle${
            snapshot.candidates.length === 1 ? '' : 's'
          } across this PC and the office PC. Choose one when you are ready to create an RO.`,
        );
      }

      return snapshot;
    } catch (error) {
      if (!options.silent) {
        setEmsImportError(
          error instanceof Error ? error.message : 'Could not scan EMS watched folders.',
        );
      }

      return null;
    } finally {
      if (!options.silent) {
        setLoadingEmsCandidates(false);
      }
    }
  };

  useEffect(() => {
    if (!appBridge.isDesktop()) {
      return undefined;
    }

    void refreshEmsCandidates();
    const intervalId = window.setInterval(() => {
      void refreshEmsCandidates({ silent: true });
    }, 30000);

    return () => window.clearInterval(intervalId);
  }, []);

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

  const handleDeleteNote = async (jobId: string, noteId: string) => {
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;

    await deleteJobNote(job, noteId);
  };

  const handleDeletePhoto = async (jobId: string, photoId: string) => {
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;

    await deletePhotoFromJob(job, photoId);
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

  const handleDeletePart = async (jobId: string, partId: string) => {
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;

    await deleteJobPart(job, partId);
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

  const handleOpenEmsImportModal = async () => {
    setShowEmsImportModal(true);
    await refreshEmsCandidates();
  };

  const closeEmsImportModal = () => {
    if (convertingEmsCandidateId) return;
    setShowEmsImportModal(false);
  };

  const handleConvertEmsCandidate = async (candidate: EmsImportCandidate) => {
    setConvertingEmsCandidateId(candidate.id);
    setEmsImportError(null);
    setEmsImportMessage(`Converting ${candidate.label} into an RO...`);

    try {
      const conversion = await appBridge.convertEmsImportCandidate(candidate);
      const result = await convertEmsRepairOrderToJob(
        conversion.repairOrder,
        conversion.selectedPath,
      );

      setEmsImportMessage(
        `Converted ${candidate.label} into RO ${result.roNumber} for ${
          result.customerName || result.vehicle || 'selected EMS bundle'
        }. ${result.lineCount} estimate lines and ${result.partCount} parts candidates imported.`,
      );
      await refreshEmsCandidates({ silent: true });
      setShowEmsImportModal(false);
    } catch (error) {
      setEmsImportError(
        error instanceof Error ? error.message : 'Could not convert the selected EMS bundle.',
      );
    } finally {
      setConvertingEmsCandidateId(null);
    }
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
      phoneNumber: addJobForm.phoneNumber.trim(),
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
                background: emsImportError
                  ? 'rgba(127,29,29,0.32)'
                  : 'rgba(37,99,235,0.14)',
                border: emsImportError
                  ? '1px solid rgba(248,113,113,0.34)'
                  : '1px solid rgba(96,165,250,0.28)',
                color: emsImportError ? '#fecaca' : '#dbeafe',
                fontSize: compact ? 12 : 13,
                fontWeight: 800,
                lineHeight: 1.5,
              }}
            >
              {emsImportError
                ? `EMS import error: ${emsImportError}`
                : emsImportMessage}
            </div>

            {emsCandidatesSnapshot ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: mobile
                    ? '1fr'
                    : 'repeat(4, minmax(0, 1fr))',
                  gap: 8,
                }}
              >
                {emsCandidatesSnapshot.sources.map((source) => (
                  <div
                    key={source.id}
                    title={source.path}
                    style={{
                      borderRadius: 12,
                      padding: compact ? '8px 10px' : '9px 11px',
                      background: source.available
                        ? 'rgba(15,23,42,0.72)'
                        : 'rgba(127,29,29,0.22)',
                      border: source.available
                        ? '1px solid rgba(148,163,184,0.18)'
                        : '1px solid rgba(248,113,113,0.26)',
                      color: source.available ? '#cbd5e1' : '#fecaca',
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        fontSize: compact ? 11 : 12,
                        fontWeight: 900,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {source.label}
                    </div>
                    <div
                      style={{
                        marginTop: 3,
                        fontSize: compact ? 10 : 11,
                        fontWeight: 700,
                        opacity: 0.84,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {source.candidateCount} found - {source.message}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 10,
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  void refreshEmsCandidates();
                }}
                disabled={loadingEmsCandidates}
                style={{
                  border: '1px solid rgba(148,163,184,0.24)',
                  background: 'rgba(15,23,42,0.76)',
                  color: '#cbd5e1',
                  fontWeight: 800,
                  fontSize: mobile ? 13 : 14,
                  padding: mobile ? '10px 14px' : '10px 16px',
                  borderRadius: 12,
                  cursor: loadingEmsCandidates ? 'not-allowed' : 'pointer',
                  opacity: loadingEmsCandidates ? 0.75 : 1,
                  width: mobile ? '100%' : 'auto',
                }}
              >
                {loadingEmsCandidates ? 'Scanning...' : 'Refresh Watch'}
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleOpenEmsImportModal();
                }}
                disabled={isEmsImportBusy}
                style={{
                  border: '1px solid rgba(96,165,250,0.45)',
                  background: isEmsImportBusy
                    ? 'rgba(51,65,85,0.92)'
                    : 'linear-gradient(180deg, rgba(37,99,235,0.92), rgba(29,78,216,0.92))',
                  color: '#eff6ff',
                  fontWeight: 800,
                  fontSize: mobile ? 13 : 14,
                  padding: mobile ? '10px 14px' : '10px 16px',
                  borderRadius: 12,
                  cursor: isEmsImportBusy ? 'not-allowed' : 'pointer',
                  opacity: isEmsImportBusy ? 0.75 : 1,
                  width: mobile ? '100%' : 'auto',
                }}
              >
                {convertingEmsCandidateId
                  ? 'Converting EMS...'
                  : `Choose EMS to Convert (${emsCandidateCount})`}
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

        {compact && topPriorityJob ? (
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
            Compact view is active. Jobs stay fully visible, with {topPriorityJob.vehicle} still at the top.
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
          onDeleteNote={handleDeleteNote}
          onDeletePhoto={handleDeletePhoto}
          onRequestPart={handleRequestPart}
          onSetPartOrdered={handleSetPartOrdered}
          onSetPartReorderNeeded={handleSetPartReorderNeeded}
          onMarkPartReceived={handleMarkPartReceived}
          onSavePartNote={handleSavePartNote}
          onDeletePart={handleDeletePart}
          onClearLegacyPartsWaiting={handleClearLegacyPartsWaiting}
          onSetPriorityPosition={handleSetPriorityPosition}
          onUpdateJobDetails={handleUpdateJobDetails}
        />

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
          onDeleteNote={handleDeleteNote}
          onDeletePart={handleDeletePart}
          onClearLegacyPartsWaiting={handleClearLegacyPartsWaiting}
          onUpdateJobDetails={handleUpdateJobDetails}
          onUndoDone={handleUndoDone}
        />
      </div>

      {showEmsImportModal ? (
        <EmsImportModal
          snapshot={emsCandidatesSnapshot}
          loading={loadingEmsCandidates}
          convertingCandidateId={convertingEmsCandidateId}
          mobile={mobile}
          onClose={closeEmsImportModal}
          onRefresh={() => {
            void refreshEmsCandidates();
          }}
          onConvert={(candidate) => {
            void handleConvertEmsCandidate(candidate);
          }}
        />
      ) : null}

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
                  label="Phone Number"
                  value={addJobForm.phoneNumber}
                  onChange={(value) => updateForm('phoneNumber', value)}
                  placeholder="(555) 555-5555"
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
                    { value: 'waitingOnAppraiser', label: 'Waiting on Appraiser' },
                    { value: 'supplementNeeded', label: 'Supplement Needed' },
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

type EmsImportModalProps = {
  snapshot: EmsImportCandidatesSnapshot | null;
  loading: boolean;
  convertingCandidateId: string | null;
  mobile: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onConvert: (candidate: EmsImportCandidate) => void;
};

function EmsImportModal({
  snapshot,
  loading,
  convertingCandidateId,
  mobile,
  onClose,
  onRefresh,
  onConvert,
}: EmsImportModalProps) {
  const candidates = snapshot?.candidates ?? [];
  const sources = snapshot?.sources ?? [];
  const isConverting = Boolean(convertingCandidateId);

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(2,6,23,0.64)',
        backdropFilter: 'blur(4px)',
        display: 'grid',
        placeItems: 'center',
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: mobile ? '100%' : 'min(980px, 100%)',
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
              Convert EMS to RO
            </div>
            <div
              style={{
                color: '#94a3b8',
                fontSize: 13,
                marginTop: 6,
              }}
            >
              Choose one watched CCC or Mitchell bundle.
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isConverting}
            style={{
              border: '1px solid rgba(148,163,184,0.18)',
              background: 'rgba(15,23,42,0.7)',
              color: '#cbd5e1',
              fontWeight: 800,
              fontSize: 13,
              padding: '9px 12px',
              borderRadius: 12,
              cursor: isConverting ? 'not-allowed' : 'pointer',
              opacity: isConverting ? 0.6 : 1,
            }}
          >
            Close
          </button>
        </div>

        <div
          style={{
            padding: mobile ? 16 : 24,
            display: 'grid',
            gap: 16,
            overflowY: 'auto',
            minHeight: 0,
          }}
        >
          {sources.length ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: mobile
                  ? '1fr'
                  : 'repeat(4, minmax(0, 1fr))',
                gap: 10,
              }}
            >
              {sources.map((source) => (
                <div
                  key={source.id}
                  style={{
                    borderRadius: 14,
                    border: source.available
                      ? '1px solid rgba(148,163,184,0.18)'
                      : '1px solid rgba(248,113,113,0.26)',
                    background: source.available
                      ? 'rgba(15,23,42,0.74)'
                      : 'rgba(127,29,29,0.2)',
                    padding: '11px 12px',
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      color: source.available ? '#f8fafc' : '#fecaca',
                      fontSize: 12,
                      fontWeight: 900,
                    }}
                  >
                    {source.label}
                  </div>
                  <div
                    style={{
                      color: source.available ? '#94a3b8' : '#fecaca',
                      fontSize: 11,
                      fontWeight: 700,
                      marginTop: 5,
                    }}
                  >
                    {source.candidateCount} bundle
                    {source.candidateCount === 1 ? '' : 's'}
                  </div>
                  <div
                    title={source.path}
                    style={{
                      color: '#64748b',
                      fontSize: 10,
                      fontWeight: 700,
                      marginTop: 6,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {source.path}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div
              style={{
                color: '#cbd5e1',
                fontSize: 13,
                fontWeight: 800,
              }}
            >
              {candidates.length} EMS bundle{candidates.length === 1 ? '' : 's'}
            </div>
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading || isConverting}
              style={{
                border: '1px solid rgba(148,163,184,0.22)',
                background: 'rgba(15,23,42,0.74)',
                color: '#cbd5e1',
                fontWeight: 800,
                fontSize: 13,
                padding: '9px 12px',
                borderRadius: 12,
                cursor: loading || isConverting ? 'not-allowed' : 'pointer',
                opacity: loading || isConverting ? 0.68 : 1,
              }}
            >
              {loading ? 'Scanning...' : 'Refresh'}
            </button>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            {candidates.length ? (
              candidates.map((candidate) => {
                const isCandidateConverting =
                  convertingCandidateId === candidate.id;

                return (
                  <div
                    key={candidate.id}
                    style={{
                      borderRadius: 16,
                      border: '1px solid rgba(148,163,184,0.18)',
                      background: 'rgba(15,23,42,0.72)',
                      padding: mobile ? 12 : 14,
                      display: 'grid',
                      gridTemplateColumns: mobile ? '1fr' : '1fr auto',
                      gap: 12,
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          color: '#f8fafc',
                          fontSize: 14,
                          fontWeight: 900,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {candidate.label}
                      </div>
                      <div
                        style={{
                          color: '#94a3b8',
                          fontSize: 12,
                          fontWeight: 700,
                          marginTop: 5,
                        }}
                      >
                        {candidate.location === 'local' ? 'This PC' : 'Office PC'} -{' '}
                        {candidate.source.toUpperCase()} - {candidate.fileCount} file
                        {candidate.fileCount === 1 ? '' : 's'} - updated{' '}
                        {formatDateTime(candidate.lastModifiedAt)}
                      </div>
                      <div
                        title={candidate.primaryFile}
                        style={{
                          color: '#64748b',
                          fontSize: 11,
                          fontWeight: 700,
                          marginTop: 6,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {candidate.primaryFile}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onConvert(candidate)}
                      disabled={isConverting}
                      style={{
                        border: '1px solid rgba(96,165,250,0.45)',
                        background: isCandidateConverting
                          ? 'rgba(51,65,85,0.92)'
                          : 'linear-gradient(180deg, rgba(37,99,235,0.92), rgba(29,78,216,0.92))',
                        color: '#eff6ff',
                        fontWeight: 900,
                        fontSize: 13,
                        padding: '10px 14px',
                        borderRadius: 12,
                        cursor: isConverting ? 'not-allowed' : 'pointer',
                        opacity: isConverting && !isCandidateConverting ? 0.5 : 1,
                        width: mobile ? '100%' : 'auto',
                      }}
                    >
                      {isCandidateConverting ? 'Converting...' : 'Convert'}
                    </button>
                  </div>
                );
              })
            ) : (
              <div
                style={{
                  borderRadius: 16,
                  border: '1px solid rgba(148,163,184,0.18)',
                  background: 'rgba(15,23,42,0.72)',
                  color: '#cbd5e1',
                  fontSize: 13,
                  fontWeight: 800,
                  padding: 16,
                }}
              >
                {loading
                  ? 'Scanning watched EMS folders...'
                  : 'No EMS bundles were found in the watched folders.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
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
  if (!value || Number.isNaN(date.getTime())) {
    return value || 'Unknown';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function getNextStatus(status: JobStatus): JobStatus {
  if (status === 'done') {
    return 'done';
  }

  const currentIndex = ACTIVE_JOB_STATUSES.indexOf(status);
  if (currentIndex === -1) {
    return 'notStarted';
  }

  return ACTIVE_JOB_STATUSES[(currentIndex + 1) % ACTIVE_JOB_STATUSES.length];
}

export default JobsTab;
