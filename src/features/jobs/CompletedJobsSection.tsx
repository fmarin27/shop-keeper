import React, { useEffect, useRef, useState } from 'react';
import type { AmountStatus, Job, JobPartRequest, UpdateJobDetailsInput } from '../../types/app';

type CompletedJobsSectionProps = {
  jobs: Job[];
  compact?: boolean;
  focusedJobId?: string | null;
  onFocusedJobHandled?: () => void;
  onAddTextNote: (jobId: string, text: string) => Promise<void> | void;
  onMarkNotesRead: (jobId: string) => Promise<void> | void;
  onSetPartOrdered: (jobId: string, partId: string) => Promise<void> | void;
  onSetPartReorderNeeded: (jobId: string, partId: string) => Promise<void> | void;
  onMarkPartReceived: (jobId: string, partId: string) => Promise<void> | void;
  onSavePartNote: (jobId: string, partId: string, note: string) => Promise<void> | void;
  onSavePartInvoice: (jobId: string, partId: string, invoiceNumber: string) => Promise<void> | void;
  onMarkPartPaid: (jobId: string, partId: string, invoiceNumber: string) => Promise<void> | void;
  onDeleteNote: (jobId: string, noteId: string) => Promise<void> | void;
  onDeletePart: (jobId: string, partId: string) => Promise<void> | void;
  onClearLegacyPartsWaiting: (jobId: string) => Promise<void> | void;
  onUpdateJobDetails: (
    jobId: string,
    input: UpdateJobDetailsInput,
  ) => Promise<void> | void;
  onUndoDone: (jobId: string) => void;
  onDeleteJob: (jobId: string) => Promise<void> | void;
};

function CompletedJobsSection({
  jobs,
  compact = false,
  focusedJobId = null,
  onFocusedJobHandled,
  onAddTextNote,
  onMarkNotesRead,
  onSetPartOrdered,
  onSetPartReorderNeeded,
  onMarkPartReceived,
  onSavePartNote,
  onSavePartInvoice,
  onMarkPartPaid,
  onDeleteNote,
  onDeletePart,
  onClearLegacyPartsWaiting,
  onUpdateJobDetails,
  onUndoDone,
  onDeleteJob,
}: CompletedJobsSectionProps) {
  const [sectionOpen, setSectionOpen] = useState(false);
  const [openJobIds, setOpenJobIds] = useState<string[]>([]);
  const [jobDetailDrafts, setJobDetailDrafts] = useState<
    Record<
      string,
      {
        phoneNumber: string;
        status: Job['status'];
        paintCode: string;
        amount: string;
        amountStatus: AmountStatus;
        promiseDate: string;
      }
    >
  >({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [partNoteDrafts, setPartNoteDrafts] = useState<Record<string, string>>({});
  const [savingJobDetailsId, setSavingJobDetailsId] = useState<string | null>(null);
  const [savingPartNoteId, setSavingPartNoteId] = useState<string | null>(null);
  const focusedJobRef = useRef<HTMLDivElement | null>(null);
  const focusTimeoutRef = useRef<number | null>(null);
  const lastAutoFocusedJobIdRef = useRef<string | null>(null);

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

    setSectionOpen(true);
    setOpenJobIds((current) =>
      current.includes(focusedJobId) ? current : [...current, focusedJobId],
    );
    void onMarkNotesRead(focusedJobId);

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
  }, [focusedJobId, onFocusedJobHandled]);

  useEffect(() => {
    if (!focusedJobId) {
      lastAutoFocusedJobIdRef.current = null;
    }
  }, [focusedJobId]);

  const toggleJob = (jobId: string) => {
    const opening = !openJobIds.includes(jobId);
    setOpenJobIds((current) =>
      current.includes(jobId)
        ? current.filter((id) => id !== jobId)
        : [...current, jobId],
    );
    if (opening) {
      void onMarkNotesRead(jobId);
    }
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

  const handleSavePartNote = async (jobId: string, partId: string) => {
    try {
      setSavingPartNoteId(partId);
      await onSavePartNote(jobId, partId, partNoteDrafts[partId] ?? '');
    } finally {
      setSavingPartNoteId(null);
    }
  };

  const handleAddNote = async (jobId: string) => {
    const nextNote = (noteDrafts[jobId] ?? '').trim();
    if (!nextNote) {
      return;
    }

    await onAddTextNote(jobId, nextNote);
    setNoteDrafts((current) => ({
      ...current,
      [jobId]: '',
    }));
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
              const detailDraft = jobDetailDrafts[job.id] ?? {
                phoneNumber: job.phoneNumber,
                status: job.status,
                paintCode: job.paintCode,
                amount: String(job.amount),
                amountStatus: job.amountStatus,
                promiseDate: job.promiseDate,
              };
              const jobNoteDraft = noteDrafts[job.id] ?? '';

              return (
                <div
                  key={job.id}
                  ref={focusedJobId === job.id ? focusedJobRef : null}
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
                        {job.phoneNumber?.trim() ? (
                          <div style={{ marginTop: 6 }}>
                            <a
                              href={`tel:${sanitizePhoneNumber(job.phoneNumber)}`}
                              style={phoneLinkStyle()}
                              onClick={(event) => event.stopPropagation()}
                            >
                              {job.phoneNumber}
                            </a>
                          </div>
                        ) : null}
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
                          label="Phone"
                          value={job.phoneNumber || 'Not set'}
                        />
                        <DetailBox
                          label="Paint Code"
                          value={job.paintCode || 'NEED PAINTCODE'}
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
                          display: 'grid',
                          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                          gap: 12,
                        }}
                      >
                        <EditableField
                          label="Phone Number"
                          value={detailDraft.phoneNumber}
                          onChange={(value) =>
                            setJobDetailDrafts((current) => ({
                              ...current,
                              [job.id]: {
                                ...detailDraft,
                                phoneNumber: value,
                              },
                            }))
                          }
                          inputMode="tel"
                        />
                        <EditableField
                          label="Paint Code"
                          value={detailDraft.paintCode}
                          onChange={(value) =>
                            setJobDetailDrafts((current) => ({
                              ...current,
                              [job.id]: {
                                ...detailDraft,
                                paintCode: value,
                              },
                            }))
                          }
                        />
                        <EditableField
                          label="Amount"
                          value={detailDraft.amount}
                          onChange={(value) =>
                            setJobDetailDrafts((current) => ({
                              ...current,
                              [job.id]: {
                                ...detailDraft,
                                amount: value,
                              },
                            }))
                          }
                          inputMode="decimal"
                        />
                        <EditableSelectField
                          label="Amount Status"
                          value={detailDraft.amountStatus}
                          onChange={(value) =>
                            setJobDetailDrafts((current) => ({
                              ...current,
                              [job.id]: {
                                ...detailDraft,
                                amountStatus: value as AmountStatus,
                              },
                            }))
                          }
                          options={[
                            { value: 'notFinal', label: 'Not Final' },
                            { value: 'final', label: 'Final' },
                          ]}
                        />
                        <EditableField
                          label="Promise Date"
                          value={detailDraft.promiseDate}
                          onChange={(value) =>
                            setJobDetailDrafts((current) => ({
                              ...current,
                              [job.id]: {
                                ...detailDraft,
                                promiseDate: value,
                              },
                            }))
                          }
                          type="date"
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
                        <div style={{ display: 'grid', gap: 10 }}>
                          {job.textNotes.length ? (
                            job.textNotes.map((note) => (
                              <div
                                key={note.id}
                                style={{
                                  borderRadius: 12,
                                  padding: 10,
                                  background: 'rgba(15,23,42,0.55)',
                                  border: '1px solid rgba(148,163,184,0.12)',
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: 13,
                                    color: '#e2e8f0',
                                    marginBottom: 6,
                                  }}
                                >
                                  {note.type === 'audio' ? 'Audio note' : note.text}
                                </div>
                                <div
                                  style={{
                                    fontSize: 12,
                                    color: '#94a3b8',
                                  }}
                                >
                                  {note.type === 'audio' ? 'Audio note • ' : ''}
                                  {formatDateTime(note.createdAt)}
                                </div>
                                <div style={{ marginTop: 8 }}>
                                  <ActionButton
                                    danger
                                    onClick={() => void onDeleteNote(job.id, note.id)}
                                  >
                                    Delete
                                  </ActionButton>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div
                              style={{
                                fontSize: 13,
                                color: '#94a3b8',
                              }}
                            >
                              No notes yet.
                            </div>
                          )}

                          <textarea
                            value={jobNoteDraft}
                            onChange={(event) =>
                              setNoteDrafts((current) => ({
                                ...current,
                                [job.id]: event.target.value,
                              }))
                            }
                            placeholder="Add a note to this closed job..."
                            rows={3}
                            style={textAreaStyle()}
                          />
                        </div>
                      </div>

                      <PartsPanel
                        job={job}
                        partNoteDrafts={partNoteDrafts}
                        savingPartNoteId={savingPartNoteId}
                        onPartNoteDraftChange={(partId, value) =>
                          setPartNoteDrafts((current) => ({
                            ...current,
                            [partId]: value,
                          }))
                        }
                        onSavePartNote={(partId) => void handleSavePartNote(job.id, partId)}
                        onSavePartInvoice={(partId, invoiceNumber) =>
                          void onSavePartInvoice(job.id, partId, invoiceNumber)
                        }
                        onMarkPartPaid={(partId, invoiceNumber) =>
                          void onMarkPartPaid(job.id, partId, invoiceNumber)
                        }
                        onSetPartOrdered={(partId) => void onSetPartOrdered(job.id, partId)}
                        onSetPartReorderNeeded={(partId) =>
                          void onSetPartReorderNeeded(job.id, partId)
                        }
                        onMarkPartReceived={(partId) => void onMarkPartReceived(job.id, partId)}
                        onDeletePart={(partId) => void onDeletePart(job.id, partId)}
                        onClearLegacyPartsWaiting={() => void onClearLegacyPartsWaiting(job.id)}
                      />

                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 10,
                        }}
                      >
                        <ActionButton
                          onClick={() => void handleSaveJobDetails(job)}
                        >
                          {savingJobDetailsId === job.id ? 'Saving...' : 'Save Changes'}
                        </ActionButton>
                        <ActionButton
                          onClick={() => void handleAddNote(job.id)}
                        >
                          Add Note
                        </ActionButton>
                        <ActionButton onClick={() => onUndoDone(job.id)}>
                          Reopen Job
                        </ActionButton>
                        <ActionButton danger onClick={() => void onDeleteJob(job.id)}>
                          Hide Job
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

function EditableField({
  label,
  value,
  onChange,
  type = 'text',
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
}) {
  return (
    <label style={{ display: 'grid', gap: 8 }}>
      <span
        style={{
          fontSize: 12,
          fontWeight: 800,
          color: '#94a3b8',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode={inputMode}
        style={inputStyle()}
      />
    </label>
  );
}

function EditableSelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label style={{ display: 'grid', gap: 8 }}>
      <span
        style={{
          fontSize: 12,
          fontWeight: 800,
          color: '#94a3b8',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={inputStyle()}
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

function PartsPanel({
  job,
  partNoteDrafts,
  savingPartNoteId,
  onPartNoteDraftChange,
  onSavePartNote,
  onSavePartInvoice,
  onMarkPartPaid,
  onSetPartOrdered,
  onSetPartReorderNeeded,
  onMarkPartReceived,
  onDeletePart,
  onClearLegacyPartsWaiting,
}: {
  job: Job;
  partNoteDrafts: Record<string, string>;
  savingPartNoteId: string | null;
  onPartNoteDraftChange: (partId: string, value: string) => void;
  onSavePartNote: (partId: string) => void;
  onSavePartInvoice: (partId: string, invoiceNumber: string) => void;
  onMarkPartPaid: (partId: string, invoiceNumber: string) => void;
  onSetPartOrdered: (partId: string) => void;
  onSetPartReorderNeeded: (partId: string) => void;
  onMarkPartReceived: (partId: string) => void;
  onDeletePart: (partId: string) => void;
  onClearLegacyPartsWaiting: () => void;
}) {
  const parts = job.partsRequests ?? [];
  const hasSublets = parts.some(isSubletPart);

  return (
    <div
      style={{
        borderRadius: 14,
        padding: 12,
        background: 'rgba(2,6,23,0.35)',
        border: '1px solid rgba(148,163,184,0.1)',
        display: 'grid',
        gap: 10,
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 800,
          color: '#f8fafc',
        }}
      >
        {hasSublets ? 'Parts & Sublets' : 'Parts'}
      </div>

      {parts.length ? (
        parts.map((part) => {
          const noteDraft = partNoteDrafts[part.id] ?? part.note ?? '';

          return (
            <PartCard
              key={part.id}
              part={part}
              noteDraft={noteDraft}
              savingPartNote={savingPartNoteId === part.id}
              onNoteDraftChange={(value) => onPartNoteDraftChange(part.id, value)}
              onSaveNote={() => onSavePartNote(part.id)}
              onSaveInvoice={(invoiceNumber) => onSavePartInvoice(part.id, invoiceNumber)}
              onMarkPaid={(invoiceNumber) => onMarkPartPaid(part.id, invoiceNumber)}
              onSetOrdered={() => onSetPartOrdered(part.id)}
              onSetReorderNeeded={() => onSetPartReorderNeeded(part.id)}
              onMarkReceived={() => onMarkPartReceived(part.id)}
              onDelete={() => onDeletePart(part.id)}
            />
          );
        })
      ) : job.partsWaiting ? (
        <div style={{ display: 'grid', gap: 8 }}>
          <div
            style={{
              fontSize: 13,
              color: '#e2e8f0',
            }}
          >
            Legacy parts waiting flag is still on for this closed job.
          </div>
          <div>
            <ActionButton onClick={onClearLegacyPartsWaiting}>
              Clear Legacy Parts Flag
            </ActionButton>
          </div>
        </div>
      ) : (
        <div
          style={{
            fontSize: 13,
            color: '#94a3b8',
          }}
        >
          No parts or sublets on this job.
        </div>
      )}
    </div>
  );
}

function PartCard({
  part,
  noteDraft,
  savingPartNote,
  onNoteDraftChange,
  onSaveNote,
  onSaveInvoice,
  onMarkPaid,
  onSetOrdered,
  onSetReorderNeeded,
  onMarkReceived,
  onDelete,
}: {
  part: JobPartRequest;
  noteDraft: string;
  savingPartNote: boolean;
  onNoteDraftChange: (value: string) => void;
  onSaveNote: () => void;
  onSaveInvoice: (invoiceNumber: string) => void;
  onMarkPaid: (invoiceNumber: string) => void;
  onSetOrdered: () => void;
  onSetReorderNeeded: () => void;
  onMarkReceived: () => void;
  onDelete: () => void;
}) {
  const isSublet = isSubletPart(part);
  const [invoiceDraft, setInvoiceDraft] = useState(part.invoiceNumber ?? '');

  useEffect(() => {
    setInvoiceDraft(part.invoiceNumber ?? '');
  }, [part.invoiceNumber]);

  return (
    <div
      style={{
        borderRadius: 12,
        padding: 10,
        background: 'rgba(15,23,42,0.55)',
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
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#f8fafc' }}>
            {part.name}
          </div>
          {isSublet ? (
            <div style={{ fontSize: 12, color: '#94a3b8' }}>
              Sublet | {part.paidAt ? 'Paid' : 'Unpaid'} | {formatDateTime(part.createdAt)}
              {part.invoiceNumber ? ` | Invoice ${part.invoiceNumber}` : ''}
            </div>
          ) : null}
          <div style={{ fontSize: 12, color: '#94a3b8', display: isSublet ? 'none' : undefined }}>
            Qty {part.quantity} • {formatPartStatus(part.status)} • {formatDateTime(part.createdAt)}
          </div>
        </div>
      </div>

      <textarea
        value={noteDraft}
        onChange={(event) => onNoteDraftChange(event.target.value)}
        placeholder={isSublet ? 'Sublet note...' : 'Part note...'}
        rows={2}
        style={textAreaStyle()}
      />

      {isSublet ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto auto',
            gap: 8,
            alignItems: 'center',
          }}
        >
          <input
            value={invoiceDraft}
            onChange={(event) => setInvoiceDraft(event.target.value)}
            placeholder="Invoice #"
            style={inputStyle()}
          />
          <ActionButton onClick={() => onSaveInvoice(invoiceDraft)}>
            Save Invoice
          </ActionButton>
          <ActionButton
            onClick={() => onMarkPaid(invoiceDraft)}
            disabled={Boolean(part.paidAt)}
          >
            {part.paidAt ? 'Paid' : 'Mark Paid'}
          </ActionButton>
        </div>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <ActionButton onClick={onSaveNote}>
          {savingPartNote ? 'Saving...' : isSublet ? 'Save Sublet Note' : 'Save Part Note'}
        </ActionButton>
        <ActionButton danger onClick={onDelete}>
          {isSublet ? 'Delete Sublet' : 'Delete Part'}
        </ActionButton>
        {!isSublet && part.status === 'requested' ? (
          <ActionButton onClick={onSetOrdered}>Mark Ordered</ActionButton>
        ) : null}
        {!isSublet && part.status !== 'reorderNeeded' && part.status !== 'received' ? (
          <ActionButton onClick={onSetReorderNeeded}>Part Came Wrong</ActionButton>
        ) : null}
        {!isSublet && part.status !== 'received' ? (
          <ActionButton onClick={onMarkReceived}>Mark Received</ActionButton>
        ) : null}
      </div>
    </div>
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
  danger = false,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        border: danger
          ? '1px solid rgba(248,113,113,0.34)'
          : '1px solid rgba(148,163,184,0.18)',
        background: danger ? 'rgba(127,29,29,0.36)' : 'rgba(30,41,59,0.72)',
        color: danger ? '#fee2e2' : '#f8fafc',
        borderRadius: 14,
        padding: '11px 14px',
        fontSize: 13,
        fontWeight: 800,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.58 : 1,
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

function phoneLinkStyle(): React.CSSProperties {
  return {
    color: '#93c5fd',
    fontSize: 13,
    fontWeight: 800,
    textDecoration: 'none',
  };
}

function sanitizePhoneNumber(value: string) {
  const cleaned = value.replace(/[^\d+]/g, '');
  return cleaned || value;
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

function isSubletPart(part: JobPartRequest) {
  return (part.kind ?? 'part') === 'sublet';
}

function inputStyle(): React.CSSProperties {
  return {
    width: '100%',
    boxSizing: 'border-box',
    borderRadius: 12,
    border: '1px solid rgba(148,163,184,0.18)',
    background: 'rgba(15,23,42,0.84)',
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: 600,
    padding: '11px 13px',
    outline: 'none',
  };
}

function textAreaStyle(): React.CSSProperties {
  return {
    ...inputStyle(),
    minHeight: 78,
    resize: 'vertical',
    fontFamily: 'inherit',
  };
}

function hasPartsWaiting(job: Job) {
  return (
    job.partsWaiting ||
    (job.partsRequests ?? []).some(
      (part) => (part.kind ?? 'part') === 'part' && part.status !== 'received',
    )
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

export default CompletedJobsSection;
