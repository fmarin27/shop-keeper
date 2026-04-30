import { useEffect, useRef, useState } from 'react';
import { processJobImage } from '../../services/media/imageProcessor';
import {
  canUseNativeMobileCamera,
  getNativeMobilePhoto,
} from '../../services/media/mobileCamera';
import type {
  AppMode,
  AmountStatus,
  Job,
  JobNote,
  JobPhoto,
  JobPartRequest,
  JobStatus,
  UpdateJobDetailsInput,
} from '../../types/app';

type ActiveJobsSectionProps = {
  jobs: Job[];
  compact?: boolean;
  mobile?: boolean;
  appMode: AppMode;
  focusedJobId?: string | null;
  onFocusedJobHandled?: () => void;
  onChangeStatus: (jobId: string) => void;
  onMarkDone: (jobId: string) => void;
  onAddTextNote: (jobId: string, text: string) => void;
  onAddAudioNote: (jobId: string, file: Blob) => Promise<void> | void;
  onAddPhoto: (
    jobId: string,
    processed: {
      file: Blob;
      width: number;
      height: number;
      fileSize: number;
      timestampIncluded: boolean;
    },
  ) => Promise<void> | void;
  onMarkNotesRead: (jobId: string) => void;
  onDeleteNote: (jobId: string, noteId: string) => Promise<void> | void;
  onDeletePhoto: (jobId: string, photoId: string) => Promise<void> | void;
  onRequestPart: (
    jobId: string,
    input: {
      name: string;
      quantity: string;
      note?: string;
      status?: Exclude<JobPartRequest['status'], 'received'>;
    },
  ) => void;
  onSetPartOrdered: (jobId: string, partId: string) => void;
  onSetPartReorderNeeded: (jobId: string, partId: string) => void;
  onMarkPartReceived: (jobId: string, partId: string) => void;
  onSavePartNote: (jobId: string, partId: string, note: string) => void;
  onDeletePart: (jobId: string, partId: string) => Promise<void> | void;
  onClearLegacyPartsWaiting: (jobId: string) => void;
  onSetPriorityPosition: (jobId: string, position: number) => Promise<void> | void;
  onUpdateJobDetails: (
    jobId: string,
    input: UpdateJobDetailsInput,
  ) => Promise<void> | void;
};

function ActiveJobsSection({
  jobs,
  compact = false,
  mobile = false,
  appMode,
  focusedJobId = null,
  onFocusedJobHandled,
  onChangeStatus,
  onMarkDone,
  onAddTextNote,
  onAddAudioNote,
  onAddPhoto,
  onMarkNotesRead,
  onDeleteNote,
  onDeletePhoto,
  onRequestPart,
  onSetPartOrdered,
  onSetPartReorderNeeded,
  onMarkPartReceived,
  onSavePartNote,
  onDeletePart,
  onClearLegacyPartsWaiting,
  onSetPriorityPosition,
  onUpdateJobDetails,
}: ActiveJobsSectionProps) {
  const narrowLayout = compact || mobile;
  const [openJobIds, setOpenJobIds] = useState<string[]>([]);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [partDrafts, setPartDrafts] = useState<
    Record<string, { name: string; quantity: string; note: string }>
  >({});
  const [partNoteDrafts, setPartNoteDrafts] = useState<Record<string, string>>({});
  const [jobDetailDrafts, setJobDetailDrafts] = useState<
    Record<
      string,
      {
        phoneNumber: string;
        status: JobStatus;
        paintCode: string;
        amount: string;
        amountStatus: AmountStatus;
        promiseDate: string;
      }
    >
  >({});
  const [savingPartNoteId, setSavingPartNoteId] = useState<string | null>(null);
  const [savingJobDetailsId, setSavingJobDetailsId] = useState<string | null>(null);
  const [recordingJobId, setRecordingJobId] = useState<string | null>(null);
  const [savingAudioJobId, setSavingAudioJobId] = useState<string | null>(null);
  const [photoActionState, setPhotoActionState] = useState<{
    jobId: string;
    phase: 'processing' | 'uploading';
  } | null>(null);
  const [reorderingJobId, setReorderingJobId] = useState<string | null>(null);
  const [photoTimestampEnabled, setPhotoTimestampEnabled] = useState<Record<string, boolean>>({});
  const [selectedPhoto, setSelectedPhoto] = useState<JobPhoto | null>(null);
  const [photoZoom, setPhotoZoom] = useState(1);
  const [draggedJobId, setDraggedJobId] = useState<string | null>(null);
  const [dragTarget, setDragTarget] = useState<{
    jobId: string;
    edge: 'before' | 'after';
  } | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const photoInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const galleryInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const recordedChunksRef = useRef<Blob[]>([]);
  const focusedJobRef = useRef<HTMLDivElement | null>(null);
  const focusTimeoutRef = useRef<number | null>(null);
  const lastAutoFocusedJobIdRef = useRef<string | null>(null);
  const reorderInFlightRef = useRef(false);

  useEffect(() => {
    openJobIds.forEach((jobId) => {
      onMarkNotesRead(jobId);
    });
  }, [openJobIds, onMarkNotesRead]);

  useEffect(() => {
    return () => {
      if (focusTimeoutRef.current !== null) {
        window.clearTimeout(focusTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!focusedJobId) return;
    if (lastAutoFocusedJobIdRef.current === focusedJobId) return;

    setOpenJobIds((current) =>
      current.includes(focusedJobId) ? current : [...current, focusedJobId],
    );

    const target = jobs.find((job) => job.id === focusedJobId);
    if (!target) return;

    window.requestAnimationFrame(() => {
      focusedJobRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });

    if (focusTimeoutRef.current !== null) {
      window.clearTimeout(focusTimeoutRef.current);
    }

    lastAutoFocusedJobIdRef.current = focusedJobId;
    focusTimeoutRef.current = window.setTimeout(() => {
      onFocusedJobHandled?.();
    }, 1200);
  }, [focusedJobId, jobs, onFocusedJobHandled]);

  useEffect(() => {
    if (!focusedJobId) {
      lastAutoFocusedJobIdRef.current = null;
    }
  }, [focusedJobId]);

  const toggleJob = (jobId: string) => {
    setOpenJobIds((current) =>
      current.includes(jobId)
        ? current.filter((id) => id !== jobId)
        : [...current, jobId],
    );
  };

  const unreadCount = (job: Job) =>
    job.textNotes.filter((note) => !note.read).length;

  const startRecording = async (jobId: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordedChunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : '';

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const blob = new Blob(recordedChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });

        stream.getTracks().forEach((track) => track.stop());
        setRecordingJobId(null);

        if (!blob.size) return;

        try {
          setSavingAudioJobId(jobId);
          await onAddAudioNote(jobId, blob);
        } finally {
          setSavingAudioJobId(null);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecordingJobId(jobId);
    } catch (error) {
      console.error('Failed to start recording:', error);
      alert('Microphone access failed.');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
  };

  const handleSetPriorityPosition = async (jobId: string, position: number) => {
    if (reorderInFlightRef.current) {
      return;
    }

    try {
      reorderInFlightRef.current = true;
      setReorderingJobId(jobId);
      await onSetPriorityPosition(jobId, position);
    } catch (error) {
      console.error('Failed to set job priority:', error);
    } finally {
      reorderInFlightRef.current = false;
      setReorderingJobId(null);
    }
  };

  const clearDragState = () => {
    setDraggedJobId(null);
    setDragTarget(null);
  };

  const handleDragStart = (
    event: React.DragEvent<HTMLElement>,
    jobId: string,
  ) => {
    if (compact || !!reorderingJobId) {
      event.preventDefault();
      return;
    }

    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', jobId);
    setDraggedJobId(jobId);
    setDragTarget(null);
  };

  const handleDragOver = (
    event: React.DragEvent<HTMLElement>,
    jobId: string,
  ) => {
    if (!draggedJobId || draggedJobId === jobId) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';

    const bounds = event.currentTarget.getBoundingClientRect();
    const midpoint = bounds.top + bounds.height / 2;
    const edge = event.clientY < midpoint ? 'before' : 'after';

    setDragTarget((current) =>
      current?.jobId === jobId && current.edge === edge ? current : { jobId, edge },
    );
  };

  const handleDrop = async (
    event: React.DragEvent<HTMLElement>,
    targetJobId: string,
  ) => {
    event.preventDefault();

    const sourceJobId = draggedJobId || event.dataTransfer.getData('text/plain');
    const currentTarget = dragTarget;
    if (!sourceJobId || sourceJobId === targetJobId || !currentTarget) {
      clearDragState();
      return;
    }

    const orderedIds = jobs.map((job) => job.id);
    const remainingIds = orderedIds.filter((jobId) => jobId !== sourceJobId);
    const targetIndex = remainingIds.findIndex((jobId) => jobId === targetJobId);

    if (targetIndex === -1) {
      clearDragState();
      return;
    }

    const insertIndex = currentTarget.edge === 'before' ? targetIndex : targetIndex + 1;
    const reorderedIds = [...remainingIds];
    reorderedIds.splice(insertIndex, 0, sourceJobId);
    const nextPosition = reorderedIds.findIndex((jobId) => jobId === sourceJobId) + 1;

    clearDragState();
    await handleSetPriorityPosition(sourceJobId, nextPosition);
  };

  const handleSaveJobDetails = async (job: Job) => {
    const draft = jobDetailDrafts[job.id] ?? {
      phoneNumber: job.phoneNumber,
      status: job.status,
      paintCode: job.paintCode,
      amount: String(job.amount),
      amountStatus: job.amountStatus,
      promiseDate: job.promiseDate,
    };

    const parsedAmount = Number(draft.amount);
    if (Number.isNaN(parsedAmount) || parsedAmount < 0) {
      alert('Amount must be a valid number.');
      return;
    }

    try {
      setSavingJobDetailsId(job.id);
      await onUpdateJobDetails(job.id, {
        phoneNumber: draft.phoneNumber,
        status: draft.status,
        paintCode: draft.paintCode,
        amount: parsedAmount,
        amountStatus: draft.amountStatus,
        promiseDate: draft.promiseDate,
      });
    } finally {
      setSavingJobDetailsId(null);
    }
  };

  const handlePhotoFileSelected = async (jobId: string, file: File | null) => {
    if (!file) return;

      try {
        setPhotoActionState({ jobId, phase: 'processing' });
        const processed = await processJobImage(file, {
          addTimestamp: photoTimestampEnabled[jobId] ?? false,
          maxDimension: mobile ? 800 : 1280,
          quality: mobile ? 0.5 : 0.68,
          targetMaxBytes: mobile ? 180 * 1024 : 300 * 1024,
          minDimension: mobile ? 420 : 640,
        });
        setPhotoActionState({ jobId, phase: 'uploading' });
        await onAddPhoto(jobId, {
          file: processed.blob,
        width: processed.width,
        height: processed.height,
        fileSize: processed.fileSize,
        timestampIncluded: processed.timestampIncluded,
      });
    } catch (error) {
      console.error('Failed to add photo:', error);
      alert(
        error instanceof Error
          ? error.message
          : 'Could not upload photo.',
      );
    } finally {
      setPhotoActionState(null);
      const input = photoInputRefs.current[jobId];
      if (input) {
        input.value = '';
      }
    }
  };

  const handleNativeMobilePhoto = async (
    jobId: string,
    source: 'camera' | 'gallery',
  ) => {
    try {
      const file = await getNativeMobilePhoto(source);
      await handlePhotoFileSelected(jobId, file);
    } catch (error) {
      console.error('Failed to pick mobile photo:', error);
      alert(
        error instanceof Error
          ? error.message
          : 'Could not open the phone camera or gallery.',
      );
    }
  };

  return (
    <>
    <section
      style={{
        borderRadius: narrowLayout ? 18 : 24,
        padding: narrowLayout ? 14 : 28,
        background: 'rgba(84,100,123,0.95)',
        border: '2px solid rgba(196,207,223,0.42)',
        boxShadow: '0 18px 40px rgba(0,0,0,0.14), inset 0 0 0 1px rgba(255,255,255,0.05)',
      }}
    >
      <h2
        style={{
          marginTop: 0,
          marginBottom: narrowLayout ? 12 : 20,
          fontSize: narrowLayout ? 22 : 28,
          fontWeight: 800,
          color: '#f8fafc',
        }}
      >
        Active Jobs
      </h2>

      <div style={{ display: 'grid', gap: narrowLayout ? 10 : 16 }}>
        {jobs.map((job, index) => {
          const isOpen = openJobIds.includes(job.id);
          const unreadNotes = unreadCount(job);
          const isRecordingThisJob = recordingJobId === job.id;
          const isSavingAudioThisJob = savingAudioJobId === job.id;
          const photoPhase =
            photoActionState?.jobId === job.id ? photoActionState.phase : null;
          const isSavingPhotoThisJob = !!photoPhase;
          const isReorderingThisJob = reorderingJobId === job.id;
          const isFocused = focusedJobId === job.id;
          const isEven = index % 2 === 0;
          const hasPartsWaiting = getHasPartsWaiting(job);
          const showCompactMobileSummary = mobile && !isOpen;
          const detailDraft = jobDetailDrafts[job.id] ?? {
            phoneNumber: job.phoneNumber,
            status: job.status,
            paintCode: job.paintCode,
            amount: String(job.amount),
            amountStatus: job.amountStatus,
            promiseDate: job.promiseDate,
          };
          const isSavingDetailsThisJob = savingJobDetailsId === job.id;

          return (
            <div
              key={job.id}
              ref={isFocused ? focusedJobRef : null}
              onDragOver={(event) => handleDragOver(event, job.id)}
              onDrop={(event) => void handleDrop(event, job.id)}
              onDragEnd={clearDragState}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setDragTarget((current) => (current?.jobId === job.id ? null : current));
                }
              }}
              style={{
                borderRadius: narrowLayout ? 16 : 20,
                background: isEven ? 'rgba(41,54,73,0.98)' : 'rgba(49,63,84,0.98)',
                border:
                  dragTarget?.jobId === job.id
                    ? dragTarget.edge === 'before'
                      ? '2px solid rgba(56,189,248,0.88)'
                      : '2px solid rgba(34,197,94,0.88)'
                    : isFocused
                    ? '2px solid rgba(96,165,250,0.72)'
                    : '2px solid rgba(162,177,198,0.34)',
                boxShadow: isFocused
                  ? '0 0 0 1px rgba(191,219,254,0.24), 0 0 28px rgba(96,165,250,0.18)'
                  : '0 10px 24px rgba(0,0,0,0.12)',
                overflow: 'hidden',
                opacity: draggedJobId === job.id ? 0.76 : 1,
                position: 'relative',
              }}
            >
              {dragTarget?.jobId === job.id ? (
                <div
                  style={{
                    position: 'absolute',
                    left: 14,
                    right: 14,
                    [dragTarget.edge === 'before' ? 'top' : 'bottom']: 8,
                    height: 4,
                    borderRadius: 999,
                    background:
                      dragTarget.edge === 'before'
                        ? 'rgba(56,189,248,0.95)'
                        : 'rgba(34,197,94,0.95)',
                    boxShadow:
                      dragTarget.edge === 'before'
                        ? '0 0 0 3px rgba(56,189,248,0.14)'
                        : '0 0 0 3px rgba(34,197,94,0.14)',
                    pointerEvents: 'none',
                    zIndex: 2,
                  }}
                />
              ) : null}

              <div
                style={{
                  width: '100%',
                  textAlign: 'left',
                  background: 'transparent',
                  color: 'inherit',
                  padding: narrowLayout ? 12 : 18,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                    marginBottom: 8,
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        flexWrap: 'wrap',
                        marginBottom: 4,
                      }}
                    >
                      <div
                        style={{
                          fontSize: narrowLayout ? 18 : 20,
                          fontWeight: 800,
                          color: '#f8fafc',
                        }}
                      >
                        {job.vehicle}
                      </div>

                      {!mobile ? (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <HeaderOrderButton
                          label="Move up"
                          compact={compact}
                          disabled
                          onClick={() => {}}
                        >
                          ↑
                        </HeaderOrderButton>
                        <HeaderOrderButton
                          label="Move down"
                          compact={compact}
                          disabled
                          onClick={() => {}}
                        >
                          ↓
                        </HeaderOrderButton>
                      </div>
                      ) : null}
                    </div>

                    <div
                      style={{
                        fontSize: compact ? 12 : 14,
                        color: '#b8c7da',
                      }}
                    >
                      RO {job.roNumber}
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        color: '#dbe7f5',
                        display: 'flex',
                        gap: 6,
                        flexWrap: 'wrap',
                        alignItems: 'center',
                      }}
                    >
                      <span
                        style={{
                          fontSize: compact ? 12 : 13,
                          fontWeight: 700,
                        }}
                      >
                        {job.customerName}
                      </span>
                      {job.phoneNumber?.trim() ? (
                        <>
                          <span style={{ fontSize: compact ? 12 : 13 }}>•</span>
                          <a
                            href={`tel:${sanitizePhoneNumber(job.phoneNumber)}`}
                            style={phoneLinkStyle(compact)}
                            onClick={(event) => event.stopPropagation()}
                          >
                            {job.phoneNumber}
                          </a>
                        </>
                      ) : null}
                    </div>
                    {showCompactMobileSummary ? (
                      <div
                        style={{
                          marginTop: 4,
                          color: '#dbe7f5',
                          display: 'flex',
                          gap: 6,
                          flexWrap: 'wrap',
                          alignItems: 'center',
                        }}
                      >
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                          }}
                        >
                          {job.customerName}
                        </span>
                        {job.phoneNumber?.trim() ? (
                          <>
                            <span style={{ fontSize: 13 }}>•</span>
                            <a
                              href={`tel:${sanitizePhoneNumber(job.phoneNumber)}`}
                              style={phoneLinkStyle(compact)}
                              onClick={(event) => event.stopPropagation()}
                            >
                              {job.phoneNumber}
                            </a>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                    {!showCompactMobileSummary ? (
                      <div style={{ marginTop: 8 }}>
                        <span
                          style={paintCodeBadgeStyle(job.paintCode, compact)}
                        >
                          {job.paintCode ? `Paint Code: ${job.paintCode}` : 'NEED PAINTCODE'}
                        </span>
                      </div>
                    ) : null}
                    {!showCompactMobileSummary ? (
                    <div
                      style={{
                        marginTop: 6,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span
                        style={{
                          fontSize: compact ? 11 : 12,
                          fontWeight: 800,
                          color: '#dbeafe',
                          background:
                            index === 0
                              ? 'rgba(37,99,235,0.24)'
                              : 'rgba(30,41,59,0.72)',
                          border:
                            index === 0
                              ? '1px solid rgba(96,165,250,0.34)'
                              : '1px solid rgba(148,163,184,0.16)',
                          borderRadius: 999,
                          padding: compact ? '5px 8px' : '6px 10px',
                          display: 'inline-flex',
                        }}
                      >
                        {index === 0 ? 'Top Priority' : `Priority #${index + 1}`}
                      </span>
                      <span
                        draggable={!narrowLayout && !reorderingJobId}
                        onDragStart={(event) => handleDragStart(event, job.id)}
                        onDragEnd={clearDragState}
                        onClick={(event) => event.stopPropagation()}
                        onMouseDown={(event) => event.stopPropagation()}
                        style={{
                          fontSize: compact ? 11 : 12,
                          fontWeight: 800,
                          color: '#cbd5e1',
                          background: 'rgba(15,23,42,0.52)',
                          border: '1px dashed rgba(148,163,184,0.34)',
                          borderRadius: 999,
                          padding: compact ? '5px 8px' : '6px 10px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 8,
                          cursor: !narrowLayout && !reorderingJobId ? 'grab' : 'default',
                          userSelect: 'none',
                        }}
                      >
                        <span style={{ fontSize: compact ? 12 : 13 }}>⋮⋮</span>
                        Drag
                      </span>
                      <PrioritySelect
                        compact={compact}
                        currentPosition={index + 1}
                        totalJobs={jobs.length}
                        disabled={!!reorderingJobId}
                        onChange={(position) => {
                          void handleSetPriorityPosition(job.id, position);
                        }}
                      />
                    </div>
                    ) : null}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span style={statusBadgeStyle(job.status, compact)}>
                      {statusLabel(job.status)}
                    </span>

                    {!narrowLayout ? (
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          onChangeStatus(job.id);
                        }}
                        style={inlineControlButtonStyle(compact)}
                      >
                        Change Status
                      </button>
                    ) : null}

                    {!showCompactMobileSummary && job.status !== 'done' ? (
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          onMarkDone(job.id);
                        }}
                        style={markDoneButtonStyle(compact)}
                      >
                        Mark Done
                      </button>
                    ) : null}

                    <button
                      type="button"
                      aria-label={isOpen ? 'Collapse job' : 'Expand job'}
                      onClick={() => toggleJob(job.id)}
                      style={{
                        width: narrowLayout ? 30 : 32,
                        height: narrowLayout ? 30 : 32,
                        borderRadius: 999,
                        border: '1px solid rgba(148,163,184,0.28)',
                        background: 'rgba(15,23,42,0.68)',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        lineHeight: 1,
                        flexShrink: 0,
                        fontSize: narrowLayout ? 18 : 18,
                        color: '#e2e8f0',
                        fontWeight: 900,
                      }}
                    >
                      {isOpen ? '−' : '+'}
                    </button>
                  </div>
                </div>

                {showCompactMobileSummary ? (
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: narrowLayout ? 8 : 10,
                      marginBottom: unreadNotes > 0 ? 10 : 0,
                    }}
                  >
                  {job.promiseDate ? (
                    <InfoPill compact={compact}>
                      Promise: {formatDate(job.promiseDate)}
                    </InfoPill>
                  ) : null}
                  {!job.paintCode ? (
                    <InfoPill compact={compact} highlight>
                      NEED PAINTCODE
                    </InfoPill>
                  ) : null}
                  {hasPartsWaiting ? (
                    <InfoPill compact={compact} highlight>
                      {getPartsWorkflowSummary(job)}
                    </InfoPill>
                    ) : null}
                  </div>
                ) : null}

                {!showCompactMobileSummary ? (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: narrowLayout ? 8 : 10,
                    marginBottom: unreadNotes > 0 ? 10 : 0,
                  }}
                >
                  <InfoPill compact={compact}>
                    {formatAmount(job.amount)} -{' '}
                    {job.amountStatus === 'final' ? 'Final' : 'Not Final'}
                  </InfoPill>

                  <InfoPill compact={compact}>
                    Promise: {formatDate(job.promiseDate)}
                  </InfoPill>

                  {job.paintCode ? (
                    <InfoPill compact={compact} highlight>
                      Paint: {job.paintCode}
                    </InfoPill>
                  ) : (
                    <InfoPill compact={compact} highlight>
                      NEED PAINTCODE
                    </InfoPill>
                  )}

                  {job.claimNumber ? (
                    <InfoPill compact={compact}>
                      Claim: {job.claimNumber}
                    </InfoPill>
                  ) : null}

                  {job.insuranceCompany ? (
                    <InfoPill compact={compact}>
                      Insurer: {job.insuranceCompany}
                    </InfoPill>
                  ) : null}

                  {job.sourceSystem ? (
                    <InfoPill compact={compact}>
                      {job.sourceSystem} estimate
                    </InfoPill>
                  ) : null}

                  {hasPartsWaiting ? (
                    <InfoPill compact={compact} highlight>
                      {getPartsWorkflowSummary(job)}
                    </InfoPill>
                  ) : null}

                  <InfoPill compact={compact}>
                    {getPartsReceiptSummary(job)}
                  </InfoPill>
                </div>
                ) : null}

                {unreadNotes > 0 ? (
                  <div
                    style={{
                      marginTop: 2,
                      fontSize: narrowLayout ? 12 : 13,
                      fontWeight: 800,
                      color: '#93c5fd',
                      textShadow: '0 0 10px rgba(96,165,250,0.55)',
                    }}
                  >
                    {unreadNotes} unread {unreadNotes === 1 ? 'note' : 'notes'}
                  </div>
                ) : null}
              </div>

              {isOpen ? (
                <div
                  style={{
                    borderTop: '2px solid rgba(192,204,220,0.32)',
                    padding: narrowLayout ? 12 : 18,
                    background: 'rgba(93,109,132,0.96)',
                    display: 'grid',
                    gap: narrowLayout ? 12 : 16,
                  }}
                >
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: narrowLayout ? '1fr' : 'repeat(2, minmax(0, 1fr))',
                      gap: narrowLayout ? 10 : 14,
                      paddingBottom: narrowLayout ? 2 : 4,
                      borderBottom: '2px solid rgba(148,163,184,0.18)',
                    }}
                  >
                    <DetailBox
                      label="Customer"
                      value={job.customerName}
                      compact={narrowLayout}
                    />
                    {job.customerPhone ? (
                      <DetailBox
                        label="Phone"
                        value={job.customerPhone}
                        compact={narrowLayout}
                      />
                    ) : null}
                    {job.customerEmail ? (
                      <DetailBox
                        label="Email"
                        value={job.customerEmail}
                        compact={narrowLayout}
                      />
                    ) : null}
                    <DetailBox
                      label="Phone"
                      value={job.phoneNumber || 'Not set'}
                      compact={narrowLayout}
                    />
                    <DetailBox
                      label="Paint Code"
                      value={job.paintCode || 'Not set'}
                      compact={narrowLayout}
                    />
                    {job.vehicleVin ? (
                      <DetailBox
                        label="VIN"
                        value={job.vehicleVin}
                        compact={narrowLayout}
                      />
                    ) : null}
                    {job.vehicleColor ? (
                      <DetailBox
                        label="Vehicle Color"
                        value={job.vehicleColor}
                        compact={narrowLayout}
                      />
                    ) : null}
                    {job.insuranceCompany ? (
                      <DetailBox
                        label="Insurance"
                        value={job.insuranceCompany}
                        compact={narrowLayout}
                      />
                    ) : null}
                    {job.claimNumber ? (
                      <DetailBox
                        label="Claim Number"
                        value={job.claimNumber}
                        compact={narrowLayout}
                      />
                    ) : null}
                    {job.policyNumber ? (
                      <DetailBox
                        label="Policy Number"
                        value={job.policyNumber}
                        compact={narrowLayout}
                      />
                    ) : null}
                    <DetailBox
                      label="Amount"
                      value={`${formatAmount(job.amount)} - ${
                        job.amountStatus === 'final' ? 'Final' : 'Not Final'
                      }`}
                      compact={narrowLayout}
                    />
                    <DetailBox
                      label="Promise Date"
                      value={formatDate(job.promiseDate)}
                      compact={narrowLayout}
                    />
                    <DetailBox
                      label="Parts Status"
                      value={getPartsWorkflowSummary(job)}
                      compact={narrowLayout}
                    />
                    <DetailBox
                      label="Parts Received"
                      value={getPartsReceiptSummary(job)}
                      compact={narrowLayout}
                    />
                  </div>

                  {appMode === 'manager' ? (
                    <>
                      <JobDetailsEditor
                        compact={narrowLayout}
                        phoneNumber={detailDraft.phoneNumber}
                        status={detailDraft.status}
                        paintCode={detailDraft.paintCode}
                        amount={detailDraft.amount}
                        amountStatus={detailDraft.amountStatus}
                        promiseDate={detailDraft.promiseDate}
                        saving={isSavingDetailsThisJob}
                        onPhoneNumberChange={(value) =>
                          setJobDetailDrafts((current) => ({
                            ...current,
                            [job.id]: {
                              ...detailDraft,
                              phoneNumber: value,
                            },
                          }))
                        }
                        onStatusChange={(value) =>
                          setJobDetailDrafts((current) => ({
                            ...current,
                            [job.id]: {
                              ...detailDraft,
                              status: value,
                            },
                          }))
                        }
                        onPaintCodeChange={(value) =>
                          setJobDetailDrafts((current) => ({
                            ...current,
                            [job.id]: {
                              ...detailDraft,
                              paintCode: value,
                            },
                          }))
                        }
                        onAmountChange={(value) =>
                          setJobDetailDrafts((current) => ({
                            ...current,
                            [job.id]: {
                              ...detailDraft,
                              amount: value,
                            },
                          }))
                        }
                        onAmountStatusChange={(value) =>
                          setJobDetailDrafts((current) => ({
                            ...current,
                            [job.id]: {
                              ...detailDraft,
                              amountStatus: value,
                            },
                          }))
                        }
                        onPromiseDateChange={(value) =>
                          setJobDetailDrafts((current) => ({
                            ...current,
                            [job.id]: {
                              ...detailDraft,
                              promiseDate: value,
                            },
                          }))
                        }
                        onSave={() => handleSaveJobDetails(job)}
                      />

                      <SectionDivider />
                    </>
                  ) : null}

                  {hasEmsEstimate(job) ? (
                    <>
                      <EstimatePanel job={job} compact={narrowLayout} />
                      <SectionDivider />
                    </>
                  ) : null}

                  <PartsPanel
                    job={job}
                    appMode={appMode}
                    compact={narrowLayout}
                    draft={partDrafts[job.id] ?? { name: '', quantity: '', note: '' }}
                    noteDrafts={partNoteDrafts}
                    onDraftChange={(nextDraft) =>
                      setPartDrafts((current) => ({
                        ...current,
                        [job.id]: nextDraft,
                      }))
                    }
                    onPartNoteDraftChange={(partId, value) =>
                      setPartNoteDrafts((current) => ({
                        ...current,
                        [partId]: value,
                      }))
                    }
                    onRequestPart={() => {
                      const draft = partDrafts[job.id] ?? {
                        name: '',
                        quantity: '',
                        note: '',
                      };

                      onRequestPart(job.id, {
                        ...draft,
                        status: appMode === 'manager' ? 'ordered' : 'requested',
                      });
                      setPartDrafts((current) => ({
                        ...current,
                        [job.id]: { name: '', quantity: '', note: '' },
                      }));
                    }}
                    onSetPartOrdered={(partId) => onSetPartOrdered(job.id, partId)}
                    onSetPartReorderNeeded={(partId) =>
                      onSetPartReorderNeeded(job.id, partId)
                    }
                    onMarkPartReceived={(partId) => onMarkPartReceived(job.id, partId)}
                    onSavePartNote={async (partId) => {
                      const nextNote =
                        partNoteDrafts[partId] ??
                        job.partsRequests.find((part) => part.id === partId)?.note ??
                        '';
                      try {
                        setSavingPartNoteId(partId);
                        await onSavePartNote(job.id, partId, nextNote);
                      } finally {
                        setSavingPartNoteId(null);
                      }
                    }}
                    onDeletePart={(partId) => void onDeletePart(job.id, partId)}
                    savingPartNoteId={savingPartNoteId}
                    onClearLegacyPartsWaiting={() => onClearLegacyPartsWaiting(job.id)}
                  />

                  <SectionDivider />

                  <PhotosPanel
                    job={job}
                    compact={narrowLayout}
                    addTimestamp={photoTimestampEnabled[job.id] ?? false}
                    onToggleTimestamp={(checked) =>
                      setPhotoTimestampEnabled((current) => ({
                        ...current,
                        [job.id]: checked,
                      }))
                    }
                    onOpenPhoto={(photo) => {
                      setSelectedPhoto(photo);
                      setPhotoZoom(1);
                    }}
                    onDeletePhoto={(photoId) => void onDeletePhoto(job.id, photoId)}
                  />

                  <SectionDivider />

                  <NotesPanel
                    job={job}
                    compact={narrowLayout}
                    onDeleteNote={(noteId) => void onDeleteNote(job.id, noteId)}
                  />

                  <SectionDivider />

                  <div
                    style={{
                      display: 'grid',
                      gap: 10,
                      borderRadius: narrowLayout ? 14 : 16,
                      padding: narrowLayout ? 12 : 14,
                      background: 'rgba(17,27,46,0.94)',
                      border: '2px solid rgba(148,163,184,0.24)',
                    }}
                  >
                    <textarea
                      value={noteDrafts[job.id] ?? ''}
                      onChange={(e) =>
                        setNoteDrafts((current) => ({
                          ...current,
                          [job.id]: e.target.value,
                        }))
                      }
                      placeholder="Type a new note..."
                      style={{
                        width: '100%',
                        minHeight: narrowLayout ? 72 : 86,
                        resize: 'vertical',
                        boxSizing: 'border-box',
                        borderRadius: narrowLayout ? 12 : 14,
                        border: '2px solid rgba(148,163,184,0.24)',
                        background: 'rgba(9,15,28,0.96)',
                        color: '#f8fafc',
                        padding: narrowLayout ? 10 : 12,
                        fontSize: narrowLayout ? 12 : 13,
                        fontFamily: 'inherit',
                        outline: 'none',
                      }}
                    />

                    {(isRecordingThisJob || isSavingAudioThisJob) && (
                      <div
                        style={{
                          fontSize: narrowLayout ? 12 : 13,
                          fontWeight: 700,
                          color: '#93c5fd',
                        }}
                      >
                        {isRecordingThisJob
                          ? 'Recording audio...'
                          : 'Saving audio note...'}
                      </div>
                    )}

                    {photoPhase ? (
                      <div
                        style={{
                          fontSize: narrowLayout ? 12 : 13,
                          fontWeight: 700,
                          color: '#93c5fd',
                        }}
                      >
                        {photoPhase === 'processing'
                          ? 'Processing photo...'
                          : 'Uploading photo...'}
                      </div>
                    ) : null}

                    {isReorderingThisJob ? (
                      <div
                        style={{
                          fontSize: narrowLayout ? 12 : 13,
                          fontWeight: 700,
                          color: '#93c5fd',
                        }}
                      >
                        Updating job order...
                      </div>
                    ) : null}

                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: narrowLayout ? 8 : 10,
                      }}
                    >
                      <ActionButton
                        compact={narrowLayout}
                        onClick={() => {
                          onAddTextNote(job.id, noteDrafts[job.id] ?? '');
                          setNoteDrafts((current) => ({
                            ...current,
                            [job.id]: '',
                          }));
                        }}
                      >
                        Add Text Note
                      </ActionButton>

                      {isRecordingThisJob ? (
                        <ActionButton compact={narrowLayout} onClick={stopRecording}>
                          Stop Recording
                        </ActionButton>
                      ) : (
                        <ActionButton
                          compact={narrowLayout}
                          onClick={() => startRecording(job.id)}
                        >
                          Record Audio Note
                        </ActionButton>
                      )}

                      <input
                        ref={(element) => {
                          photoInputRefs.current[job.id] = element;
                        }}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        style={{ display: 'none' }}
                        onChange={(event) =>
                          void handlePhotoFileSelected(
                            job.id,
                            event.target.files?.[0] ?? null,
                          )
                        }
                      />
                      <input
                        ref={(element) => {
                          galleryInputRefs.current[job.id] = element;
                        }}
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={(event) =>
                          void handlePhotoFileSelected(
                            job.id,
                            event.target.files?.[0] ?? null,
                          )
                        }
                      />

                        {mobile ? (
                          <>
                            <ActionButton
                              compact={narrowLayout}
                              onClick={() =>
                                canUseNativeMobileCamera()
                                  ? void handleNativeMobilePhoto(job.id, 'camera')
                                  : photoInputRefs.current[job.id]?.click()
                              }
                              disabled={isSavingPhotoThisJob}
                            >
                              Take Photo
                            </ActionButton>
                            <ActionButton
                              compact={narrowLayout}
                              onClick={() =>
                                canUseNativeMobileCamera()
                                  ? void handleNativeMobilePhoto(job.id, 'gallery')
                                  : galleryInputRefs.current[job.id]?.click()
                              }
                              disabled={isSavingPhotoThisJob}
                            >
                              From Gallery
                          </ActionButton>
                        </>
                      ) : (
                        <ActionButton
                          compact={narrowLayout}
                          onClick={() => photoInputRefs.current[job.id]?.click()}
                          disabled={isSavingPhotoThisJob}
                        >
                          Add / Take Photo
                        </ActionButton>
                      )}

                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
    {selectedPhoto ? (
      <PhotoViewerModal
        photo={selectedPhoto}
        zoom={photoZoom}
        onClose={() => {
          setSelectedPhoto(null);
          setPhotoZoom(1);
        }}
        onZoomChange={setPhotoZoom}
      />
    ) : null}
    </>
  );
}

function inlineControlButtonStyle(compact: boolean): React.CSSProperties {
  return {
    border: '1px solid rgba(96,165,250,0.28)',
    background: 'rgba(37,99,235,0.18)',
    color: '#dbeafe',
    borderRadius: compact ? 10 : 12,
    padding: compact ? '6px 9px' : '7px 11px',
    fontSize: compact ? 11 : 12,
    fontWeight: 800,
    cursor: 'pointer',
  };
}

function markDoneButtonStyle(compact: boolean): React.CSSProperties {
  return {
    border: '1px solid rgba(110,231,183,0.7)',
    background:
      'linear-gradient(180deg, rgba(22,163,74,0.96) 0%, rgba(21,128,61,0.96) 100%)',
    color: '#f0fdf4',
    borderRadius: compact ? 12 : 14,
    padding: compact ? '8px 11px' : '10px 14px',
    fontSize: compact ? 12 : 13,
    fontWeight: 900,
    cursor: 'pointer',
    boxShadow: '0 8px 18px rgba(21,128,61,0.24)',
    whiteSpace: 'nowrap',
  };
}

function HeaderOrderButton({
  children,
  label,
  compact,
  disabled = false,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  compact: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  void children;
  void label;
  void compact;
  void disabled;
  void onClick;
  return null;
}

function PrioritySelect({
  compact,
  currentPosition,
  totalJobs,
  disabled,
  onChange,
}: {
  compact: boolean;
  currentPosition: number;
  totalJobs: number;
  disabled: boolean;
  onChange: (position: number) => void;
}) {
  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        color: '#dbeafe',
        fontSize: compact ? 11 : 12,
        fontWeight: 800,
      }}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <span>Set</span>
      <select
        value={currentPosition}
        disabled={disabled}
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{
          borderRadius: 999,
          border: '1px solid rgba(148,163,184,0.28)',
          background: 'rgba(15,23,42,0.9)',
          color: '#f8fafc',
          padding: compact ? '4px 8px' : '5px 10px',
          fontSize: compact ? 11 : 12,
          fontWeight: 800,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        {Array.from({ length: totalJobs }, (_, index) => index + 1).map((position) => (
          <option key={position} value={position}>
            #{position}
          </option>
        ))}
      </select>
    </label>
  );
}

function SectionDivider() {
  return (
    <div
      style={{
        height: 2,
        borderRadius: 999,
        background:
          'linear-gradient(90deg, rgba(148,163,184,0.04) 0%, rgba(148,163,184,0.3) 18%, rgba(148,163,184,0.3) 82%, rgba(148,163,184,0.04) 100%)',
      }}
    />
  );
}

function SectionLabel({
  title,
  tone,
  compact = false,
}: {
  title: string;
  tone: 'blue' | 'amber' | 'violet';
  compact?: boolean;
}) {
  const tones = {
    blue: {
      background: 'linear-gradient(180deg, rgba(45,212,191,0.28), rgba(14,116,144,0.32))',
      border: '1px solid rgba(103,232,249,0.42)',
      color: '#ecfeff',
    },
    amber: {
      background: 'linear-gradient(180deg, rgba(251,191,36,0.26), rgba(180,83,9,0.34))',
      border: '1px solid rgba(253,224,71,0.42)',
      color: '#fff7ed',
    },
    violet: {
      background: 'linear-gradient(180deg, rgba(192,132,252,0.26), rgba(109,40,217,0.34))',
      border: '1px solid rgba(216,180,254,0.44)',
      color: '#faf5ff',
    },
  } satisfies Record<'blue' | 'amber' | 'violet', React.CSSProperties>;

  return (
    <div
      style={{
        alignSelf: 'start',
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: 999,
        padding: compact ? '6px 10px' : '7px 12px',
        fontSize: compact ? 11 : 12,
        fontWeight: 900,
        letterSpacing: 0.9,
        textTransform: 'uppercase',
        ...tones[tone],
      }}
    >
      {title}
    </div>
  );
}

function JobDetailsEditor({
  compact,
  phoneNumber,
  status,
  paintCode,
  amount,
  amountStatus,
  promiseDate,
  saving,
  onPhoneNumberChange,
  onStatusChange,
  onPaintCodeChange,
  onAmountChange,
  onAmountStatusChange,
  onPromiseDateChange,
  onSave,
}: {
  compact: boolean;
  phoneNumber: string;
  status: JobStatus;
  paintCode: string;
  amount: string;
  amountStatus: AmountStatus;
  promiseDate: string;
  saving: boolean;
  onPhoneNumberChange: (value: string) => void;
  onStatusChange: (value: JobStatus) => void;
  onPaintCodeChange: (value: string) => void;
  onAmountChange: (value: string) => void;
  onAmountStatusChange: (value: AmountStatus) => void;
  onPromiseDateChange: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <div
      style={{
        borderRadius: compact ? 14 : 16,
        padding: compact ? 12 : 14,
        background: 'rgba(22,34,57,0.98)',
        border: '2px solid rgba(148,163,184,0.28)',
        display: 'grid',
        gap: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <SectionLabel title="Job Details" tone="blue" compact={compact} />
      </div>

      <div
        style={{
          display: 'grid',
          gap: 10,
          gridTemplateColumns: compact ? '1fr' : '1fr 1fr 1fr 1fr auto',
          alignItems: 'end',
        }}
      >
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={fieldLabelStyle(compact)}>Phone Number</span>
          <input
            value={phoneNumber}
            onChange={(event) => onPhoneNumberChange(event.target.value)}
            inputMode="tel"
            placeholder="(555) 555-5555"
            style={inputStyle(compact)}
          />
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <span style={fieldLabelStyle(compact)}>Status</span>
          <select
            value={status}
            onChange={(event) => onStatusChange(event.target.value as JobStatus)}
            style={inputStyle(compact)}
          >
            <option value="notStarted">Not Started</option>
            <option value="inProgress">In Progress</option>
            <option value="waiting">Waiting</option>
            <option value="waitingOnAppraiser">Waiting on Appraiser</option>
            <option value="supplementNeeded">Supplement Needed</option>
          </select>
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <span style={fieldLabelStyle(compact)}>Paint Code</span>
          <input
            value={paintCode}
            onChange={(event) => onPaintCodeChange(event.target.value)}
            style={inputStyle(compact)}
          />
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <span style={fieldLabelStyle(compact)}>Amount</span>
          <input
            value={amount}
            onChange={(event) => onAmountChange(event.target.value)}
            inputMode="decimal"
            style={inputStyle(compact)}
          />
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <span style={fieldLabelStyle(compact)}>Final</span>
          <select
            value={amountStatus}
            onChange={(event) =>
              onAmountStatusChange(event.target.value as AmountStatus)
            }
            style={inputStyle(compact)}
          >
            <option value="notFinal">Not Final</option>
            <option value="final">Final</option>
          </select>
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <span style={fieldLabelStyle(compact)}>Promise Date</span>
          <input
            type="date"
            value={promiseDate}
            onChange={(event) => onPromiseDateChange(event.target.value)}
            style={inputStyle(compact)}
          />
        </label>

        <ActionButton compact={compact} onClick={onSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Details'}
        </ActionButton>
      </div>
    </div>
  );
}

function EstimatePanel({
  job,
  compact,
}: {
  job: Job;
  compact: boolean;
}) {
  const totals = job.estimateTotals;
  const lines = job.estimateLines ?? [];
  const visibleLines = lines.filter(
    (line) => line.description || line.partNumber || line.totalAmount !== 0,
  );
  const displayPartsTotal = lines.length
    ? getOrderablePartsTotal(lines)
    : totals?.partsTotal ?? 0;

  return (
    <div
      style={{
        borderRadius: compact ? 14 : 16,
        padding: compact ? 12 : 14,
        background: 'rgba(22,34,57,0.98)',
        border: '2px solid rgba(148,163,184,0.28)',
        display: 'grid',
        gap: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <SectionLabel title="EMS Estimate" tone="violet" compact={compact} />
        <span
          style={{
            color: '#cbd5e1',
            fontSize: compact ? 11 : 12,
            fontWeight: 800,
          }}
        >
          {job.sourceSystem || 'EMS'} {job.externalEstimateId || job.roNumber}
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: compact ? '1fr 1fr' : 'repeat(6, minmax(0, 1fr))',
          gap: compact ? 8 : 10,
        }}
      >
        <EstimateMetric
          label="Total"
          value={formatAmount(totals?.grandTotal ?? job.amount)}
          compact={compact}
        />
        <EstimateMetric
          label="Parts"
          value={formatAmount(displayPartsTotal)}
          compact={compact}
        />
        <EstimateMetric
          label="Paint Materials"
          value={formatAmount(totals?.paintMaterials ?? 0)}
          compact={compact}
        />
        <EstimateMetric
          label="Body Labor"
          value={formatHours(totals?.bodyLaborHours)}
          compact={compact}
        />
        <EstimateMetric
          label="Refinish"
          value={formatHours(totals?.refinishLaborHours)}
          compact={compact}
        />
        <EstimateMetric
          label="Mechanical"
          value={formatHours(totals?.mechanicalLaborHours)}
          compact={compact}
        />
      </div>

      {visibleLines.length ? (
        <div
          style={{
            overflowX: 'auto',
            borderRadius: compact ? 12 : 14,
            border: '1px solid rgba(148,163,184,0.2)',
          }}
        >
          <table
            style={{
              width: '100%',
              minWidth: compact ? 720 : 0,
              borderCollapse: 'collapse',
              color: '#e5e7eb',
              fontSize: compact ? 11 : 12,
            }}
          >
            <thead>
              <tr>
                <EstimateHeaderCell compact={compact}>Line</EstimateHeaderCell>
                <EstimateHeaderCell compact={compact}>Operation</EstimateHeaderCell>
                <EstimateHeaderCell compact={compact}>Description</EstimateHeaderCell>
                <EstimateHeaderCell compact={compact}>Part #</EstimateHeaderCell>
                <EstimateHeaderCell compact={compact}>Labor</EstimateHeaderCell>
                <EstimateHeaderCell compact={compact}>Parts</EstimateHeaderCell>
                <EstimateHeaderCell compact={compact}>Total</EstimateHeaderCell>
              </tr>
            </thead>
            <tbody>
              {visibleLines.map((line) => (
                <tr key={line.id}>
                  <EstimateCell compact={compact}>{line.lineNumber || '-'}</EstimateCell>
                  <EstimateCell compact={compact}>
                    {formatEstimateOperation(line)}
                  </EstimateCell>
                  <EstimateCell compact={compact} strong>
                    {line.description || '-'}
                  </EstimateCell>
                  <EstimateCell compact={compact}>{line.partNumber || '-'}</EstimateCell>
                  <EstimateCell compact={compact}>
                    {formatHours(line.laborHours)} / {formatAmount(line.laborAmount)}
                  </EstimateCell>
                  <EstimateCell compact={compact}>
                    {formatEstimatePartAmount(line)}
                  </EstimateCell>
                  <EstimateCell compact={compact}>
                    {formatAmount(line.totalAmount)}
                  </EstimateCell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          style={{
            color: '#b8c7da',
            fontSize: compact ? 12 : 13,
            fontWeight: 700,
          }}
        >
          EMS summary is synced, but no estimate lines are available yet.
        </div>
      )}
    </div>
  );
}

function EstimateMetric({
  label,
  value,
  compact,
}: {
  label: string;
  value: string;
  compact: boolean;
}) {
  return (
    <div
      style={{
        borderRadius: compact ? 12 : 14,
        border: '1px solid rgba(148,163,184,0.18)',
        background: 'rgba(15,23,42,0.55)',
        padding: compact ? 9 : 11,
        minWidth: 0,
      }}
    >
      <div
        style={{
          color: '#94a3b8',
          fontSize: compact ? 10 : 11,
          fontWeight: 900,
          textTransform: 'uppercase',
          letterSpacing: 0,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          color: '#f8fafc',
          fontSize: compact ? 13 : 15,
          fontWeight: 900,
          overflowWrap: 'anywhere',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function EstimateHeaderCell({
  children,
  compact,
}: {
  children: React.ReactNode;
  compact: boolean;
}) {
  return (
    <th
      style={{
        textAlign: 'left',
        color: '#93a4ba',
        fontSize: compact ? 10 : 11,
        fontWeight: 900,
        textTransform: 'uppercase',
        letterSpacing: 0,
        padding: compact ? '8px 9px' : '10px 11px',
        background: 'rgba(15,23,42,0.82)',
        borderBottom: '1px solid rgba(148,163,184,0.18)',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </th>
  );
}

function EstimateCell({
  children,
  compact,
  strong = false,
}: {
  children: React.ReactNode;
  compact: boolean;
  strong?: boolean;
}) {
  return (
    <td
      style={{
        padding: compact ? '8px 9px' : '10px 11px',
        borderBottom: '1px solid rgba(148,163,184,0.12)',
        color: strong ? '#f8fafc' : '#d6dfeb',
        fontWeight: strong ? 800 : 650,
        verticalAlign: 'top',
        overflowWrap: 'anywhere',
      }}
    >
      {children}
    </td>
  );
}

function PartsPanel({
  job,
  appMode,
  compact,
  draft,
  noteDrafts,
  onDraftChange,
  onPartNoteDraftChange,
  onRequestPart,
  onSetPartOrdered,
  onSetPartReorderNeeded,
  onMarkPartReceived,
  onSavePartNote,
  onDeletePart,
  savingPartNoteId,
  onClearLegacyPartsWaiting,
}: {
  job: Job;
  appMode: AppMode;
  compact: boolean;
  draft: { name: string; quantity: string; note: string };
  noteDrafts: Record<string, string>;
  onDraftChange: (draft: { name: string; quantity: string; note: string }) => void;
  onPartNoteDraftChange: (partId: string, value: string) => void;
  onRequestPart: () => void;
  onSetPartOrdered: (partId: string) => void;
  onSetPartReorderNeeded: (partId: string) => void;
  onMarkPartReceived: (partId: string) => void;
  onSavePartNote: (partId: string) => Promise<void> | void;
  onDeletePart: (partId: string) => Promise<void> | void;
  savingPartNoteId: string | null;
  onClearLegacyPartsWaiting: () => void;
}) {
  const pendingCount = (job.partsRequests ?? []).filter(
    (part) => (part.kind ?? 'part') === 'part' && part.status !== 'received',
  ).length;

  return (
    <div
      style={{
        borderRadius: compact ? 14 : 16,
        padding: compact ? 12 : 14,
        background: 'rgba(22,34,57,0.98)',
        border: '2px solid rgba(148,163,184,0.28)',
        display: 'grid',
        gap: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <SectionLabel title="Parts" tone="amber" compact={compact} />
        </div>

        <span style={partsSummaryBadgeStyle(compact, pendingCount > 0)}>
          {pendingCount > 0 ? `${pendingCount} waiting` : 'All received'}
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gap: 10,
          gridTemplateColumns: compact ? '1fr' : '1.2fr 0.7fr 1.1fr auto',
          alignItems: 'start',
        }}
      >
        <input
          value={draft.name}
          onChange={(event) =>
            onDraftChange({
              ...draft,
              name: event.target.value,
            })
          }
          placeholder="Part name"
          style={inputStyle(compact)}
        />
        <input
          value={draft.quantity}
          onChange={(event) =>
            onDraftChange({
              ...draft,
              quantity: event.target.value,
            })
          }
          placeholder="Qty"
          style={inputStyle(compact)}
        />
        <input
          value={draft.note}
          onChange={(event) =>
            onDraftChange({
              ...draft,
              note: event.target.value,
            })
          }
          placeholder="Part note"
          style={inputStyle(compact)}
        />
        <ActionButton compact={compact} onClick={onRequestPart}>
          {appMode === 'tech' ? 'Request Part' : 'Add Ordered Part'}
        </ActionButton>
      </div>

      {job.partsWaiting && job.partsRequests.length === 0 ? (
        <div
          style={{
            borderRadius: compact ? 12 : 14,
            padding: compact ? 10 : 12,
            background: 'rgba(15,24,42,0.98)',
            border: '2px solid rgba(148,163,184,0.28)',
            display: 'flex',
            justifyContent: 'space-between',
            gap: 10,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <div
            style={{
              fontSize: compact ? 12 : 13,
              color: '#d6dfeb',
              fontWeight: 700,
            }}
          >
            Legacy parts-waiting flag only. Add a real part entry or clear it.
          </div>
          <ActionButton compact={compact} onClick={onClearLegacyPartsWaiting}>
            Clear Legacy Waiting
          </ActionButton>
        </div>
      ) : null}

      {job.partsRequests.length ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {job.partsRequests.map((part) => {
            const noteDraft = noteDrafts[part.id] ?? part.note ?? '';
            return (
              <div
                key={part.id}
                style={{
                  borderRadius: compact ? 12 : 14,
                  padding: compact ? 10 : 12,
                  background: 'rgba(15,24,42,0.98)',
                  border: '2px solid rgba(148,163,184,0.28)',
                  display: 'grid',
                  gap: 10,
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
                        fontSize: compact ? 13 : 15,
                        fontWeight: 800,
                        color: '#f8fafc',
                        marginBottom: 4,
                      }}
                    >
                      {part.name}
                    </div>
                    <div
                      style={{
                        fontSize: compact ? 11 : 12,
                        color: '#b8c7da',
                      }}
                    >
                      Qty: {part.quantity} • Requested by {part.requestedBy === 'tech' ? 'Tech' : 'Manager'}
                    </div>
                  </div>

                  <span style={partStatusBadgeStyle(part.status, compact)}>
                    {formatPartStatus(part.status)}
                  </span>
                </div>

                <textarea
                  value={noteDraft}
                  onChange={(event) =>
                    onPartNoteDraftChange(part.id, event.target.value)
                  }
                  placeholder="Add a note about this part..."
                  style={textAreaStyle(compact)}
                />

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 10,
                    alignItems: 'center',
                    flexWrap: 'wrap',
                  }}
                >
                  <div
                    style={{
                      fontSize: compact ? 10 : 12,
                      color: '#b8c7da',
                    }}
                  >
                    Requested {formatDateTime(part.createdAt)}
                    {part.receivedAt ? ` • Received ${formatDateTime(part.receivedAt)}` : ''}
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <ActionButton compact={compact} onClick={() => onSavePartNote(part.id)}>
                      {savingPartNoteId === part.id ? 'Saving...' : 'Save Part Note'}
                    </ActionButton>
                    <ActionButton compact={compact} danger onClick={() => onDeletePart(part.id)}>
                      Delete Part
                    </ActionButton>
                    {part.status === 'requested' ? (
                      <ActionButton compact={compact} onClick={() => onSetPartOrdered(part.id)}>
                        Mark Ordered
                      </ActionButton>
                    ) : null}
                    {part.status !== 'reorderNeeded' && part.status !== 'received' ? (
                      <ActionButton
                        compact={compact}
                        onClick={() => onSetPartReorderNeeded(part.id)}
                      >
                        Part Came Wrong
                      </ActionButton>
                    ) : null}
                    {part.status !== 'received' ? (
                      <ActionButton
                        compact={compact}
                        primary
                        onClick={() => onMarkPartReceived(part.id)}
                      >
                        Mark Received
                      </ActionButton>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div
          style={{
            fontSize: compact ? 12 : 13,
            color: '#b8c7da',
          }}
        >
          No parts requested yet.
        </div>
      )}
    </div>
  );
}

function PhotosPanel({
  job,
  compact,
  addTimestamp,
  onToggleTimestamp,
  onOpenPhoto,
  onDeletePhoto,
}: {
  job: Job;
  compact: boolean;
  addTimestamp: boolean;
  onToggleTimestamp: (checked: boolean) => void;
  onOpenPhoto: (photo: JobPhoto) => void;
  onDeletePhoto: (photoId: string) => void;
}) {
  return (
    <div
      style={{
        borderRadius: compact ? 14 : 16,
        padding: compact ? 12 : 14,
        background: 'rgba(22,34,57,0.98)',
        border: '2px solid rgba(148,163,184,0.28)',
        display: 'grid',
        gap: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <SectionLabel title="Photos" tone="blue" compact={compact} />

        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            color: '#dbeafe',
            fontSize: compact ? 11 : 12,
            fontWeight: 700,
          }}
        >
          <input
            type="checkbox"
            checked={addTimestamp}
            onChange={(event) => onToggleTimestamp(event.target.checked)}
          />
          Add timestamp
        </label>
      </div>

      {job.photos.length ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: compact ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 10,
          }}
        >
          {job.photos.map((photo) => (
            <div
              key={photo.id}
              style={{
                borderRadius: 14,
                border: '2px solid rgba(148,163,184,0.28)',
                background: 'rgba(15,24,42,0.98)',
                overflow: 'hidden',
                display: 'grid',
              }}
            >
              <button
                onClick={() => onOpenPhoto(photo)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  overflow: 'hidden',
                  padding: 0,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <img
                  src={photo.url}
                  alt="Job upload"
                  style={{
                    width: '100%',
                    aspectRatio: '1 / 1',
                    objectFit: 'cover',
                    display: 'block',
                  }}
                />
              </button>
              <div style={{ padding: '8px 10px', display: 'grid', gap: 8 }}>
                <div
                  style={{
                    fontSize: compact ? 10 : 11,
                    fontWeight: 800,
                    color: '#f8fafc',
                  }}
                >
                  {formatDateTime(photo.createdAt)}
                </div>
                <div
                  style={{
                    fontSize: compact ? 10 : 11,
                    color: '#b8c7da',
                  }}
                >
                  {photo.width}x{photo.height} • {formatFileSize(photo.fileSize)}
                </div>
                {photo.timestampIncluded ? (
                  <div
                    style={{
                      fontSize: compact ? 10 : 11,
                      color: '#93c5fd',
                      fontWeight: 700,
                    }}
                  >
                    Timestamp included
                  </div>
                ) : null}
                <ActionButton compact={compact} danger onClick={() => onDeletePhoto(photo.id)}>
                  Delete Photo
                </ActionButton>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div
          style={{
            fontSize: compact ? 12 : 13,
            color: '#b8c7da',
          }}
        >
          No photos yet. Uploaded photos are resized and compressed for quick mobile uploads, but still open in a larger viewer.
        </div>
      )}
    </div>
  );
}

function NotesPanel({
  job,
  compact = false,
  onDeleteNote,
}: {
  job: Job;
  compact?: boolean;
  onDeleteNote: (noteId: string) => void;
}) {
  return (
    <div
      style={{
        borderRadius: compact ? 14 : 16,
        padding: compact ? 12 : 14,
        background: 'rgba(22,34,57,0.98)',
        border: '2px solid rgba(148,163,184,0.28)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          marginBottom: 10,
        }}
      >
        <SectionLabel title="Notes" tone="violet" compact={compact} />
      </div>

      {job.textNotes.length ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {job.textNotes.map((note) => (
            <NoteRow
              key={note.id}
              note={note}
              compact={compact}
              onDelete={() => onDeleteNote(note.id)}
            />
          ))}
        </div>
      ) : (
        <div
          style={{
            fontSize: compact ? 12 : 13,
            color: '#b8c7da',
          }}
        >
          No notes yet.
        </div>
      )}
    </div>
  );
}

function PhotoViewerModal({
  photo,
  zoom,
  onClose,
  onZoomChange,
}: {
  photo: JobPhoto;
  zoom: number;
  onClose: () => void;
  onZoomChange: (value: number) => void;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(2, 6, 23, 0.86)',
        zIndex: 1100,
        display: 'grid',
        placeItems: 'center',
        padding: 18,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(1100px, 100%)',
          maxHeight: '100%',
          display: 'grid',
          gap: 12,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 800,
              color: '#e2e8f0',
            }}
          >
            {formatDateTime(photo.createdAt)} • {photo.width}x{photo.height} • {formatFileSize(photo.fileSize)}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <ActionButton onClick={() => onZoomChange(Math.max(1, zoom - 0.25))}>
              Zoom Out
            </ActionButton>
            <ActionButton onClick={() => onZoomChange(Math.min(4, zoom + 0.25))}>
              Zoom In
            </ActionButton>
            <ActionButton onClick={onClose}>Close</ActionButton>
          </div>
        </div>

        <div
          style={{
            overflow: 'auto',
            borderRadius: 18,
            border: '2px solid rgba(148,163,184,0.28)',
            background: 'rgba(15,23,42,0.96)',
            padding: 16,
            maxHeight: 'calc(100vh - 120px)',
          }}
        >
          <img
            src={photo.url}
            alt="Job photo"
            style={{
              display: 'block',
              margin: '0 auto',
              maxWidth: '100%',
              transform: `scale(${zoom})`,
              transformOrigin: 'top center',
            }}
          />
        </div>
      </div>
    </div>
  );
}

function NoteRow({
  note,
  compact = false,
  onDelete,
}: {
  note: JobNote;
  compact?: boolean;
  onDelete: () => void;
}) {
  return (
    <div
      style={{
        borderRadius: compact ? 12 : 14,
        padding: compact ? 10 : 12,
        background: 'rgba(15,24,42,0.98)',
        border: '2px solid rgba(148,163,184,0.28)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          marginBottom: 6,
        }}
      >
        <div
          style={{
            fontSize: compact ? 12 : 13,
            fontWeight: 700,
            color: '#f8fafc',
            lineHeight: 1.5,
            flex: 1,
            minWidth: 180,
          }}
        >
          {note.type === 'text' ? (
            note.text
          ) : (
            <audio controls src={note.audioUrl} style={{ width: '100%', maxWidth: 320 }} />
          )}
        </div>

        {!note.read ? (
          <span
            style={{
              fontSize: compact ? 11 : 12,
              fontWeight: 800,
              color: '#93c5fd',
              whiteSpace: 'nowrap',
            }}
          >
            Unread
          </span>
        ) : null}
      </div>

      <div
        style={{
          fontSize: compact ? 11 : 12,
          color: '#b8c7da',
        }}
      >
        {note.type === 'audio' ? 'Audio note • ' : ''}
        {formatDateTime(note.createdAt)}
      </div>
      <div style={{ marginTop: 8 }}>
        <ActionButton compact={compact} danger onClick={onDelete}>
          Delete
        </ActionButton>
      </div>
    </div>
  );
}

function DetailBox({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div
      style={{
        borderRadius: compact ? 14 : 16,
        padding: compact ? 12 : 14,
        background: 'rgba(22,34,57,0.98)',
        border: '2px solid rgba(148,163,184,0.28)',
      }}
    >
      <div
        style={{
          fontSize: compact ? 11 : 12,
          fontWeight: 800,
          color: '#b8c7da',
          marginBottom: 4,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: compact ? 13 : 15,
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
  compact = false,
  primary = false,
  danger = false,
  disabled = false,
  onClick,
}: {
  children: React.ReactNode;
  compact?: boolean;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        border: danger
          ? '1px solid rgba(248,113,113,0.42)'
          : primary
          ? '1px solid rgba(96,165,250,0.4)'
          : '1px solid rgba(148,163,184,0.34)',
        background: danger
          ? 'rgba(127,29,29,0.42)'
          : primary
          ? 'rgba(37,99,235,0.38)'
          : 'rgba(51,65,85,0.92)',
        color: '#f8fafc',
        borderRadius: compact ? 12 : 14,
        padding: compact ? '9px 12px' : '11px 14px',
        fontSize: compact ? 12 : 13,
        fontWeight: 800,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {children}
    </button>
  );
}

function InfoPill({
  children,
  compact = false,
  highlight = false,
}: {
  children: React.ReactNode;
  compact?: boolean;
  highlight?: boolean;
}) {
  return (
    <span
      style={{
        fontSize: compact ? 12 : 13,
        fontWeight: 700,
        color: highlight ? '#dbeafe' : '#cbd5e1',
        background: highlight ? 'rgba(37,99,235,0.3)' : 'rgba(51,65,85,0.92)',
        border: highlight
          ? '1px solid rgba(96,165,250,0.52)'
          : '1px solid rgba(148,163,184,0.28)',
        borderRadius: 999,
        padding: compact ? '6px 9px' : '7px 11px',
      }}
    >
      {children}
    </span>
  );
}

function statusLabel(status: JobStatus) {
  switch (status) {
    case 'notStarted':
      return 'Not Started';
    case 'inProgress':
      return 'In Progress';
    case 'waiting':
      return 'Waiting';
    case 'waitingOnAppraiser':
      return 'Waiting on Appraiser';
    case 'supplementNeeded':
      return 'Supplement Needed';
    case 'done':
      return 'Done';
    default:
      return status;
  }
}

function statusBadgeStyle(status: JobStatus, compact: boolean): React.CSSProperties {
  const styles: Record<JobStatus, React.CSSProperties> = {
    notStarted: {
      background: 'rgba(71,85,105,0.28)',
      border: '1px solid rgba(148,163,184,0.26)',
      color: '#e2e8f0',
    },
    inProgress: {
      background: 'rgba(37,99,235,0.22)',
      border: '1px solid rgba(96,165,250,0.34)',
      color: '#dbeafe',
    },
    waiting: {
      background: 'rgba(180,83,9,0.22)',
      border: '1px solid rgba(251,191,36,0.28)',
      color: '#fde68a',
    },
    waitingOnAppraiser: {
      background: 'rgba(124,58,237,0.22)',
      border: '1px solid rgba(196,181,253,0.32)',
      color: '#ede9fe',
    },
    supplementNeeded: {
      background: 'rgba(190,24,93,0.22)',
      border: '1px solid rgba(251,113,133,0.32)',
      color: '#ffe4e6',
    },
    done: {
      background: 'rgba(22,163,74,0.22)',
      border: '1px solid rgba(74,222,128,0.28)',
      color: '#dcfce7',
    },
  };

  return {
    ...styles[status],
    fontSize: compact ? 12 : 13,
    fontWeight: 800,
    borderRadius: 999,
    padding: compact ? '6px 10px' : '7px 12px',
    whiteSpace: 'nowrap',
  };
}

function paintCodeBadgeStyle(
  paintCode: string,
  compact: boolean,
): React.CSSProperties {
  const missing = !paintCode.trim();

  return {
    fontSize: compact ? 12 : 13,
    fontWeight: 900,
    color: missing ? '#fff7ed' : '#e0f2fe',
    background: missing ? 'rgba(194,65,12,0.28)' : 'rgba(8,145,178,0.22)',
    border: missing
      ? '1px solid rgba(251,146,60,0.44)'
      : '1px solid rgba(34,211,238,0.3)',
    borderRadius: 999,
    padding: compact ? '6px 9px' : '7px 11px',
    display: 'inline-flex',
    boxShadow: missing ? '0 0 18px rgba(251,146,60,0.18)' : 'none',
  };
}

function partStatusBadgeStyle(
  status: JobPartRequest['status'],
  compact: boolean,
): React.CSSProperties {
  return {
    background:
      status === 'received'
        ? 'rgba(22,163,74,0.22)'
        : status === 'reorderNeeded'
        ? 'rgba(127,29,29,0.28)'
        : status === 'ordered'
        ? 'rgba(37,99,235,0.22)'
        : 'rgba(180,83,9,0.22)',
    border:
      status === 'received'
        ? '1px solid rgba(74,222,128,0.28)'
        : status === 'reorderNeeded'
        ? '1px solid rgba(248,113,113,0.32)'
        : status === 'ordered'
        ? '1px solid rgba(96,165,250,0.34)'
        : '1px solid rgba(251,191,36,0.28)',
    color:
      status === 'received'
        ? '#dcfce7'
        : status === 'reorderNeeded'
        ? '#fecaca'
        : status === 'ordered'
        ? '#dbeafe'
        : '#fde68a',
    fontSize: compact ? 11 : 12,
    fontWeight: 800,
    borderRadius: 999,
    padding: compact ? '5px 9px' : '6px 10px',
    whiteSpace: 'nowrap',
  };
}

function formatPartStatus(status: JobPartRequest['status']) {
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

function partsSummaryBadgeStyle(
  compact: boolean,
  active: boolean,
): React.CSSProperties {
  return {
    fontSize: compact ? 11 : 12,
    fontWeight: 800,
    color: active ? '#dbeafe' : '#cbd5e1',
    background: active ? 'rgba(37,99,235,0.22)' : 'rgba(30,41,59,0.72)',
    border: active
      ? '1px solid rgba(96,165,250,0.34)'
      : '1px solid rgba(148,163,184,0.16)',
    borderRadius: 999,
    padding: compact ? '5px 8px' : '6px 10px',
    whiteSpace: 'nowrap',
  };
}

function inputStyle(compact: boolean): React.CSSProperties {
  return {
    width: '100%',
    boxSizing: 'border-box',
    borderRadius: compact ? 12 : 14,
    border: '2px solid rgba(148,163,184,0.32)',
    background: 'rgba(12,19,34,0.98)',
    color: '#f8fafc',
    padding: compact ? '10px 12px' : '12px 14px',
    fontSize: compact ? 12 : 13,
    outline: 'none',
  };
}

function fieldLabelStyle(compact: boolean): React.CSSProperties {
  return {
    fontSize: compact ? 11 : 12,
    fontWeight: 800,
    color: '#b8c7da',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  };
}

function textAreaStyle(compact: boolean): React.CSSProperties {
  return {
    width: '100%',
    minHeight: compact ? 72 : 86,
    resize: 'vertical',
    boxSizing: 'border-box',
    borderRadius: compact ? 12 : 14,
    border: '2px solid rgba(148,163,184,0.32)',
    background: 'rgba(12,19,34,0.98)',
    color: '#f8fafc',
    padding: compact ? 10 : 12,
    fontSize: compact ? 12 : 13,
    fontFamily: 'inherit',
    outline: 'none',
  };
}

function getHasPartsWaiting(job: Job) {
  return (
    job.partsWaiting ||
    (job.partsRequests ?? []).some(
      (part) => (part.kind ?? 'part') === 'part' && part.status !== 'received',
    )
  );
}

function hasEmsEstimate(job: Job) {
  return Boolean(
    job.sourceSystem ||
      job.estimateTotals ||
      job.emsLineItemCount ||
      (job.estimateLines ?? []).length,
  );
}

function getPartsWorkflowSummary(job: Job) {
  if (!job.partsRequests.length) {
    return job.partsWaiting ? 'Waiting on parts' : 'No parts needed';
  }

  return getHasPartsWaiting(job) ? 'Waiting on parts' : 'All parts received';
}

function getPartsReceiptSummary(job: Job) {
  if (!job.partsRequests.length) {
    return job.partsWaiting ? 'No parts listed yet' : 'No parts needed';
  }

  const parts = job.partsRequests.filter((part) => (part.kind ?? 'part') === 'part');
  if (!parts.length) {
    return job.partsWaiting ? 'No parts listed yet' : 'No parts needed';
  }

  const receivedCount = parts.filter(
    (part) => part.status === 'received',
  ).length;

  if (receivedCount === 0) {
    return 'No parts are in';
  }

  if (receivedCount === parts.length) {
    return 'All parts are in';
  }

  return 'Some parts are in';
}

type EstimateLineForDisplay = NonNullable<Job['estimateLines']>[number];

function formatEstimateOperation(line: EstimateLineForDisplay) {
  const kind = formatEstimateLineKind(line.lineKind);
  const label = formatOperationLabel(line.operationLabel, line.operationCode, kind);
  const parts = [label, kind].filter(Boolean);
  const uniqueParts = parts.filter(
    (part, index) =>
      parts.findIndex((candidate) => candidate.toLowerCase() === part.toLowerCase()) === index,
  );

  return uniqueParts.join(' / ') || '-';
}

function formatOperationLabel(
  operationLabel: string | undefined,
  operationCode: string | undefined,
  formattedKind: string,
) {
  const label = String(operationLabel ?? '').trim();
  const code = String(operationCode ?? '').trim();

  if (formattedKind === 'Reference') return 'Reference';
  if (formattedKind === 'Sublet') return 'Sublet';

  if (label && !isRawEmsCode(label)) {
    return label;
  }

  if (code && !isRawEmsCode(code)) {
    return code;
  }

  return '';
}

function formatEstimateLineKind(kind: string | undefined) {
  switch (String(kind ?? '').trim().toLowerCase()) {
    case 'labor':
      return 'Labor';
    case 'paint':
      return 'Paint';
    case 'part':
      return 'Part';
    case 'reference':
      return 'Reference';
    case 'sublet':
      return 'Sublet';
    default:
      return '';
  }
}

function isRawEmsCode(value: string) {
  return /^(?:OP\d+|LAB|PAE|PAN|false|true)$/i.test(value.trim());
}

function isOrderableEstimatePart(line: EstimateLineForDisplay) {
  if (line.isOrderablePart) return true;

  const kind = String(line.lineKind ?? '').trim().toLowerCase();
  if (kind) return kind === 'part';

  return Boolean(line.partNumber) && Number(line.partPrice) > 0;
}

function getEstimatePartAmount(line: EstimateLineForDisplay) {
  if (!isOrderableEstimatePart(line)) return 0;

  const partPrice = Number(line.partPrice ?? 0);
  if (Number.isFinite(partPrice) && partPrice > 0) return partPrice;

  const totalAmount = Number(line.totalAmount ?? 0);
  return Number.isFinite(totalAmount) && totalAmount > 0 ? totalAmount : 0;
}

function getOrderablePartsTotal(lines: EstimateLineForDisplay[]) {
  return lines.reduce((total, line) => total + getEstimatePartAmount(line), 0);
}

function formatEstimatePartAmount(line: EstimateLineForDisplay) {
  const amount = getEstimatePartAmount(line);
  if (!amount) return '-';

  return `${line.quantity ? `${line.quantity} x ` : ''}${formatAmount(amount)}`;
}

function formatAmount(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatHours(value: number | undefined) {
  const hours = Number(value ?? 0);
  return `${Number.isFinite(hours) ? hours.toFixed(1) : '0.0'}h`;
}

function formatDate(value: string) {
  if (!value) {
    return 'Not set';
  }

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return 'Not set';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: '2-digit',
  }).format(date);
}

function formatDateTime(value: string) {
  if (!value) {
    return 'Not set';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Not set';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function phoneLinkStyle(compact: boolean): React.CSSProperties {
  return {
    color: '#93c5fd',
    fontSize: compact ? 12 : 13,
    fontWeight: 800,
    textDecoration: 'none',
  };
}

function sanitizePhoneNumber(value: string) {
  const cleaned = value.replace(/[^\d+]/g, '');
  return cleaned || value;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default ActiveJobsSection;

