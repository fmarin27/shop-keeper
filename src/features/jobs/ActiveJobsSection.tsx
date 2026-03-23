import { useEffect, useRef, useState } from 'react';
import type {
  AppMode,
  AmountStatus,
  Job,
  JobNote,
  JobPartRequest,
  JobStatus,
  UpdateJobDetailsInput,
} from '../../types/app';
import { reorderActiveJobs } from '../../services/firebase/jobs';

type ActiveJobsSectionProps = {
  jobs: Job[];
  compact?: boolean;
  appMode: AppMode;
  focusedJobId?: string | null;
  onFocusedJobHandled?: () => void;
  onChangeStatus: (jobId: string) => void;
  onMarkDone: (jobId: string) => void;
  onAddTextNote: (jobId: string, text: string) => void;
  onAddAudioNote: (jobId: string, file: Blob) => Promise<void> | void;
  onMarkNotesRead: (jobId: string) => void;
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
  onClearLegacyPartsWaiting: (jobId: string) => void;
  onSetPriority: (jobId: string, position: 'top' | 'bottom') => void;
  onUpdateJobDetails: (
    jobId: string,
    input: UpdateJobDetailsInput,
  ) => Promise<void> | void;
};

function ActiveJobsSection({
  jobs,
  compact = false,
  appMode,
  focusedJobId = null,
  onFocusedJobHandled,
  onChangeStatus,
  onMarkDone,
  onAddTextNote,
  onAddAudioNote,
  onMarkNotesRead,
  onRequestPart,
  onSetPartOrdered,
  onSetPartReorderNeeded,
  onMarkPartReceived,
  onSavePartNote,
  onClearLegacyPartsWaiting,
  onSetPriority,
  onUpdateJobDetails,
}: ActiveJobsSectionProps) {
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
  const [reorderingJobId, setReorderingJobId] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const focusedJobRef = useRef<HTMLDivElement | null>(null);
  const focusTimeoutRef = useRef<number | null>(null);

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

    focusTimeoutRef.current = window.setTimeout(() => {
      onFocusedJobHandled?.();
    }, 1200);
  }, [focusedJobId, jobs, onFocusedJobHandled]);

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

  const handleMoveJob = async (jobId: string, direction: 'up' | 'down') => {
    try {
      setReorderingJobId(jobId);
      await reorderActiveJobs(jobs, jobId, direction);
    } catch (error) {
      console.error(`Failed to move job ${direction}:`, error);
    } finally {
      setReorderingJobId(null);
    }
  };

  const handleSaveJobDetails = async (job: Job) => {
    const draft = jobDetailDrafts[job.id] ?? {
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
        paintCode: draft.paintCode,
        amount: parsedAmount,
        amountStatus: draft.amountStatus,
        promiseDate: draft.promiseDate,
      });
    } finally {
      setSavingJobDetailsId(null);
    }
  };

  return (
    <section
      style={{
        borderRadius: compact ? 18 : 24,
        padding: compact ? 18 : 28,
        background: 'rgba(15,23,42,0.78)',
        border: '1px solid rgba(148,163,184,0.18)',
        boxShadow: '0 18px 40px rgba(0,0,0,0.18)',
      }}
    >
      <h2
        style={{
          marginTop: 0,
          marginBottom: compact ? 14 : 20,
          fontSize: compact ? 20 : 28,
          fontWeight: 800,
          color: '#f8fafc',
        }}
      >
        Active Jobs
      </h2>

      <div style={{ display: 'grid', gap: compact ? 12 : 16 }}>
        {jobs.map((job, index) => {
          const isOpen = openJobIds.includes(job.id);
          const unreadNotes = unreadCount(job);
          const isRecordingThisJob = recordingJobId === job.id;
          const isSavingAudioThisJob = savingAudioJobId === job.id;
          const isReorderingThisJob = reorderingJobId === job.id;
          const isFirst = index === 0;
          const isLast = index === jobs.length - 1;
          const isFocused = focusedJobId === job.id;
          const hasPartsWaiting = getHasPartsWaiting(job);
          const detailDraft = jobDetailDrafts[job.id] ?? {
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
              style={{
                borderRadius: compact ? 16 : 20,
                background: 'rgba(2,6,23,0.62)',
                border: isFocused
                  ? '1px solid rgba(96,165,250,0.42)'
                  : '1px solid rgba(148,163,184,0.14)',
                boxShadow: isFocused ? '0 0 28px rgba(96,165,250,0.18)' : 'none',
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
                  padding: compact ? 14 : 18,
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
                          fontSize: compact ? 16 : 20,
                          fontWeight: 800,
                          color: '#f8fafc',
                        }}
                      >
                        {job.vehicle}
                      </div>

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
                          disabled={isFirst || !!reorderingJobId}
                          onClick={() => handleMoveJob(job.id, 'up')}
                        >
                          ↑
                        </HeaderOrderButton>
                        <HeaderOrderButton
                          label="Move down"
                          compact={compact}
                          disabled={isLast || !!reorderingJobId}
                          onClick={() => handleMoveJob(job.id, 'down')}
                        >
                          ↓
                        </HeaderOrderButton>
                      </div>
                    </div>

                    <div
                      style={{
                        fontSize: compact ? 12 : 14,
                        color: '#94a3b8',
                      }}
                    >
                      RO {job.roNumber}
                    </div>
                    {job.paintCode ? (
                      <div style={{ marginTop: 8 }}>
                        <span
                          style={{
                            fontSize: compact ? 12 : 13,
                            fontWeight: 900,
                            color: '#e0f2fe',
                            background: 'rgba(8,145,178,0.22)',
                            border: '1px solid rgba(34,211,238,0.3)',
                            borderRadius: 999,
                            padding: compact ? '6px 9px' : '7px 11px',
                            display: 'inline-flex',
                          }}
                        >
                          Paint Code: {job.paintCode}
                        </span>
                      </div>
                    ) : null}
                    <div
                      style={{
                        marginTop: 6,
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
                    </div>
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

                    {!compact ? (
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

                    <span
                      style={{
                        fontSize: compact ? 16 : 18,
                        color: '#94a3b8',
                        fontWeight: 700,
                      }}
                    >
                      {isOpen ? '−' : '+'}
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: compact ? 8 : 10,
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

                {unreadNotes > 0 ? (
                  <div
                    style={{
                      marginTop: 2,
                      fontSize: compact ? 12 : 13,
                      fontWeight: 800,
                      color: '#93c5fd',
                      textShadow: '0 0 10px rgba(96,165,250,0.55)',
                    }}
                  >
                    {unreadNotes} unread {unreadNotes === 1 ? 'note' : 'notes'}
                  </div>
                ) : null}
              </button>

              {isOpen ? (
                <div
                  style={{
                    borderTop: '1px solid rgba(148,163,184,0.14)',
                    padding: compact ? 14 : 18,
                    background: 'rgba(15,23,42,0.5)',
                    display: 'grid',
                    gap: compact ? 12 : 16,
                  }}
                >
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: compact ? '1fr' : 'repeat(2, minmax(0, 1fr))',
                      gap: compact ? 10 : 14,
                    }}
                  >
                    <DetailBox
                      label="Customer"
                      value={job.customerName}
                      compact={compact}
                    />
                    <DetailBox
                      label="Paint Code"
                      value={job.paintCode || 'Not set'}
                      compact={compact}
                    />
                    <DetailBox
                      label="Amount"
                      value={`${formatAmount(job.amount)} - ${
                        job.amountStatus === 'final' ? 'Final' : 'Not Final'
                      }`}
                      compact={compact}
                    />
                    <DetailBox
                      label="Promise Date"
                      value={formatDate(job.promiseDate)}
                      compact={compact}
                    />
                    <DetailBox
                      label="Parts Status"
                      value={getPartsWorkflowSummary(job)}
                      compact={compact}
                    />
                    <DetailBox
                      label="Parts Received"
                      value={getPartsReceiptSummary(job)}
                      compact={compact}
                    />
                  </div>

                  <JobDetailsEditor
                    compact={compact}
                    paintCode={detailDraft.paintCode}
                    amount={detailDraft.amount}
                    amountStatus={detailDraft.amountStatus}
                    promiseDate={detailDraft.promiseDate}
                    saving={isSavingDetailsThisJob}
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

                  <PartsPanel
                    job={job}
                    appMode={appMode}
                    compact={compact}
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
                    savingPartNoteId={savingPartNoteId}
                    onClearLegacyPartsWaiting={() => onClearLegacyPartsWaiting(job.id)}
                  />

                  <NotesPanel job={job} compact={compact} />

                  <div
                    style={{
                      display: 'grid',
                      gap: 10,
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
                        minHeight: compact ? 72 : 86,
                        resize: 'vertical',
                        boxSizing: 'border-box',
                        borderRadius: compact ? 12 : 14,
                        border: '1px solid rgba(148,163,184,0.16)',
                        background: 'rgba(2,6,23,0.56)',
                        color: '#f8fafc',
                        padding: compact ? 10 : 12,
                        fontSize: compact ? 12 : 13,
                        fontFamily: 'inherit',
                        outline: 'none',
                      }}
                    />

                    {(isRecordingThisJob || isSavingAudioThisJob) && (
                      <div
                        style={{
                          fontSize: compact ? 12 : 13,
                          fontWeight: 700,
                          color: '#93c5fd',
                        }}
                      >
                        {isRecordingThisJob
                          ? 'Recording audio...'
                          : 'Saving audio note...'}
                      </div>
                    )}

                    {isReorderingThisJob ? (
                      <div
                        style={{
                          fontSize: compact ? 12 : 13,
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
                        gap: compact ? 8 : 10,
                      }}
                    >
                      <ActionButton
                        compact={compact}
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
                        <ActionButton compact={compact} onClick={stopRecording}>
                          Stop Recording
                        </ActionButton>
                      ) : (
                        <ActionButton
                          compact={compact}
                          onClick={() => startRecording(job.id)}
                        >
                          Record Audio Note
                        </ActionButton>
                      )}

                      <ActionButton
                        compact={compact}
                        disabled={isFirst || !!reorderingJobId}
                        onClick={() => onSetPriority(job.id, 'top')}
                      >
                        Move To Top
                      </ActionButton>

                      <ActionButton
                        compact={compact}
                        disabled={isLast || !!reorderingJobId}
                        onClick={() => onSetPriority(job.id, 'bottom')}
                      >
                        Move To Bottom
                      </ActionButton>

                      <ActionButton
                        compact={compact}
                        primary
                        onClick={() => onMarkDone(job.id)}
                      >
                        Mark Done
                      </ActionButton>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
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
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      style={{
        width: compact ? 24 : 28,
        height: compact ? 24 : 28,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 999,
        border: '1px solid rgba(148,163,184,0.2)',
        background: 'rgba(15,23,42,0.84)',
        color: '#dbeafe',
        fontSize: compact ? 12 : 13,
        fontWeight: 900,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.35 : 1,
      }}
    >
      {children}
    </button>
  );
}

function JobDetailsEditor({
  compact,
  paintCode,
  amount,
  amountStatus,
  promiseDate,
  saving,
  onPaintCodeChange,
  onAmountChange,
  onAmountStatusChange,
  onPromiseDateChange,
  onSave,
}: {
  compact: boolean;
  paintCode: string;
  amount: string;
  amountStatus: AmountStatus;
  promiseDate: string;
  saving: boolean;
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
        background: 'rgba(2,6,23,0.4)',
        border: '1px solid rgba(148,163,184,0.12)',
        display: 'grid',
        gap: 12,
      }}
    >
      <div
        style={{
          fontSize: compact ? 13 : 14,
          fontWeight: 800,
          color: '#f8fafc',
        }}
      >
        Job Details
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
  savingPartNoteId: string | null;
  onClearLegacyPartsWaiting: () => void;
}) {
  const pendingCount = (job.partsRequests ?? []).filter(
    (part) => part.status !== 'received',
  ).length;

  return (
    <div
      style={{
        borderRadius: compact ? 14 : 16,
        padding: compact ? 12 : 14,
        background: 'rgba(2,6,23,0.4)',
        border: '1px solid rgba(148,163,184,0.12)',
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
            fontSize: compact ? 13 : 14,
            fontWeight: 800,
            color: '#f8fafc',
          }}
        >
          Parts
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
            background: 'rgba(15,23,42,0.62)',
            border: '1px solid rgba(148,163,184,0.12)',
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
              color: '#cbd5e1',
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
                  background: 'rgba(15,23,42,0.62)',
                  border: '1px solid rgba(148,163,184,0.12)',
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
                        color: '#94a3b8',
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
                      color: '#94a3b8',
                    }}
                  >
                    Requested {formatDateTime(part.createdAt)}
                    {part.receivedAt ? ` • Received ${formatDateTime(part.receivedAt)}` : ''}
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <ActionButton compact={compact} onClick={() => onSavePartNote(part.id)}>
                      {savingPartNoteId === part.id ? 'Saving...' : 'Save Part Note'}
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
            color: '#94a3b8',
          }}
        >
          No parts requested yet.
        </div>
      )}
    </div>
  );
}

function NotesPanel({
  job,
  compact = false,
}: {
  job: Job;
  compact?: boolean;
}) {
  return (
    <div
      style={{
        borderRadius: compact ? 14 : 16,
        padding: compact ? 12 : 14,
        background: 'rgba(2,6,23,0.4)',
        border: '1px solid rgba(148,163,184,0.12)',
      }}
    >
      <div
        style={{
          fontSize: compact ? 13 : 14,
          fontWeight: 800,
          color: '#f8fafc',
          marginBottom: 10,
        }}
      >
        Notes
      </div>

      {job.textNotes.length ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {job.textNotes.map((note) => (
            <NoteRow key={note.id} note={note} compact={compact} />
          ))}
        </div>
      ) : (
        <div
          style={{
            fontSize: compact ? 12 : 13,
            color: '#94a3b8',
          }}
        >
          No notes yet.
        </div>
      )}
    </div>
  );
}

function NoteRow({
  note,
  compact = false,
}: {
  note: JobNote;
  compact?: boolean;
}) {
  return (
    <div
      style={{
        borderRadius: compact ? 12 : 14,
        padding: compact ? 10 : 12,
        background: 'rgba(15,23,42,0.62)',
        border: '1px solid rgba(148,163,184,0.12)',
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
          color: '#94a3b8',
        }}
      >
        {note.type === 'audio' ? 'Audio note • ' : ''}
        {formatDateTime(note.createdAt)}
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
        background: 'rgba(2,6,23,0.4)',
        border: '1px solid rgba(148,163,184,0.12)',
      }}
    >
      <div
        style={{
          fontSize: compact ? 11 : 12,
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
  disabled = false,
  onClick,
}: {
  children: React.ReactNode;
  compact?: boolean;
  primary?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        border: primary
          ? '1px solid rgba(96,165,250,0.4)'
          : '1px solid rgba(148,163,184,0.18)',
        background: primary
          ? 'rgba(37,99,235,0.26)'
          : 'rgba(30,41,59,0.72)',
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
        background: highlight ? 'rgba(37,99,235,0.22)' : 'rgba(30,41,59,0.72)',
        border: highlight
          ? '1px solid rgba(96,165,250,0.38)'
          : '1px solid rgba(148,163,184,0.16)',
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
    border: '1px solid rgba(148,163,184,0.16)',
    background: 'rgba(2,6,23,0.56)',
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
    color: '#94a3b8',
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
    border: '1px solid rgba(148,163,184,0.16)',
    background: 'rgba(2,6,23,0.56)',
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
    (job.partsRequests ?? []).some((part) => part.status !== 'received')
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

export default ActiveJobsSection;
