import { useEffect, useRef, useState } from 'react';
import type { Job, JobNote, JobStatus } from '../../types/app';
import { reorderActiveJobs } from '../../services/firebase/jobs';

type ActiveJobsSectionProps = {
  jobs: Job[];
  compact?: boolean;
  onChangeStatus: (jobId: string) => void;
  onMarkDone: (jobId: string) => void;
  onAddTextNote: (jobId: string, text: string) => void;
  onAddAudioNote: (jobId: string, file: Blob) => Promise<void> | void;
  onMarkNotesRead: (jobId: string) => void;
};

function ActiveJobsSection({
  jobs,
  compact = false,
  onChangeStatus,
  onMarkDone,
  onAddTextNote,
  onAddAudioNote,
  onMarkNotesRead,
}: ActiveJobsSectionProps) {
  const [openJobIds, setOpenJobIds] = useState<string[]>([]);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [recordingJobId, setRecordingJobId] = useState<string | null>(null);
  const [savingAudioJobId, setSavingAudioJobId] = useState<string | null>(null);
  const [reorderingJobId, setReorderingJobId] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    openJobIds.forEach((jobId) => {
      onMarkNotesRead(jobId);
    });
  }, [openJobIds, onMarkNotesRead]);

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

          return (
            <div
              key={job.id}
              style={{
                borderRadius: compact ? 16 : 20,
                background: 'rgba(2,6,23,0.62)',
                border: '1px solid rgba(148,163,184,0.14)',
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
                        fontSize: compact ? 16 : 20,
                        fontWeight: 800,
                        color: '#f8fafc',
                        marginBottom: 4,
                      }}
                    >
                      {job.vehicle}
                    </div>

                    <div
                      style={{
                        fontSize: compact ? 12 : 14,
                        color: '#94a3b8',
                      }}
                    >
                      RO {job.roNumber}
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

                  {job.partsWaiting ? (
                    <InfoPill compact={compact} highlight>
                      Parts Waiting
                    </InfoPill>
                  ) : null}
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
                      label="Parts Waiting"
                      value={job.partsWaiting ? 'Yes' : 'No'}
                      compact={compact}
                    />
                  </div>

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
                        onClick={() => handleMoveJob(job.id, 'up')}
                      >
                        Move Up
                      </ActionButton>

                      <ActionButton
                        compact={compact}
                        disabled={isLast || !!reorderingJobId}
                        onClick={() => handleMoveJob(job.id, 'down')}
                      >
                        Move Down
                      </ActionButton>

                      <ActionButton
                        compact={compact}
                        onClick={() => onChangeStatus(job.id)}
                      >
                        Change Status
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