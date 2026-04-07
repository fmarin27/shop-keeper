import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { CreateLeadInput, Lead, LeadPhoto, LeadStatus } from '../../types/app';
import {
  addLeadUpdate,
  addPhotoToLead,
  createLead,
  subscribeToLeads,
  updateLeadDetails,
  updateLeadStatus,
} from '../../services/firebase/leads';
import {
  processJobImage,
  type ProcessedJobImage,
} from '../../services/media/imageProcessor';

type DraftLeadPhoto = ProcessedJobImage & {
  id: string;
  previewUrl: string;
};

const initialForm: CreateLeadInput = {
  customerName: '',
  phoneNumber: '',
  vehicle: '',
  insuranceCompany: '',
  source: '',
  estimatedValue: 0,
  followUpDate: '',
  status: 'new',
  notes: '',
};

function LeadsTab({ compact = false }: { compact?: boolean }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<CreateLeadInput>(initialForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [openLeadIds, setOpenLeadIds] = useState<string[]>([]);
  const [updateDrafts, setUpdateDrafts] = useState<Record<string, string>>({});
  const [leadDrafts, setLeadDrafts] = useState<Record<string, CreateLeadInput>>({});
  const [savingLeadId, setSavingLeadId] = useState<string | null>(null);
  const [formPhotos, setFormPhotos] = useState<DraftLeadPhoto[]>([]);
  const [formPhotoTimestampEnabled, setFormPhotoTimestampEnabled] = useState(true);
  const [leadPhotoTimestampEnabled, setLeadPhotoTimestampEnabled] = useState<Record<string, boolean>>({});
  const [selectedPhoto, setSelectedPhoto] = useState<LeadPhoto | null>(null);
  const [photoZoom, setPhotoZoom] = useState(1);
  const [photoActionState, setPhotoActionState] = useState<{
    leadId: string | null;
    phase: 'processing' | 'uploading';
  } | null>(null);
  const createPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const leadPhotoInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    const unsubscribe = subscribeToLeads((items) => {
      setLeads(items);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const activeLeads = useMemo(
    () => leads.filter((lead) => lead.status !== 'won' && lead.status !== 'lost'),
    [leads],
  );

  const closedLeads = useMemo(
    () => leads.filter((lead) => lead.status === 'won' || lead.status === 'lost'),
    [leads],
  );

  const handleCreateLead = async () => {
    if (!form.customerName.trim() || !form.vehicle.trim()) {
      setFormError('Customer name and vehicle are required.');
      return;
    }

    try {
      setSaving(true);
      setFormError(null);
      const leadId = await createLead(form);
      if (formPhotos.length) {
        for (const photo of formPhotos) {
          await addPhotoToLead(
            { id: leadId, photos: [] },
            {
              blob: photo.blob,
              width: photo.width,
              height: photo.height,
              fileSize: photo.fileSize,
              timestampIncluded: photo.timestampIncluded,
            },
          );
        }

        formPhotos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
        setFormPhotos([]);
      }
      setForm(initialForm);
      setFormPhotoTimestampEnabled(true);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveLeadDetails = async (lead: Lead) => {
    const draft = leadDrafts[lead.id] ?? {
      customerName: lead.customerName,
      phoneNumber: lead.phoneNumber,
      vehicle: lead.vehicle,
      insuranceCompany: lead.insuranceCompany,
      source: lead.source,
      estimatedValue: lead.estimatedValue,
      followUpDate: lead.followUpDate,
      status: lead.status,
      notes: lead.notes,
    };

    if (!draft.customerName.trim() || !draft.vehicle.trim()) {
      return;
    }

    try {
      setSavingLeadId(lead.id);
      await updateLeadDetails(lead.id, draft);
    } finally {
      setSavingLeadId(null);
    }
  };

  const handleDraftPhotoSelection = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      setPhotoActionState({ leadId: null, phase: 'processing' });
      const processed = await processJobImage(file, {
        addTimestamp: formPhotoTimestampEnabled,
      });
      const previewUrl = URL.createObjectURL(processed.blob);
      setFormPhotos((current) => [
        {
          ...processed,
          id: `draft-photo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          previewUrl,
        },
        ...current,
      ]);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not prepare the selected photo.');
    } finally {
      setPhotoActionState(null);
    }
  };

  const handleExistingLeadPhotoSelection = async (
    lead: Lead,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      setPhotoActionState({ leadId: lead.id, phase: 'processing' });
      const processed = await processJobImage(file, {
        addTimestamp: leadPhotoTimestampEnabled[lead.id] ?? true,
      });
      setPhotoActionState({ leadId: lead.id, phase: 'uploading' });
      await addPhotoToLead(lead, processed);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not add the selected photo.');
    } finally {
      setPhotoActionState(null);
    }
  };

  const photoActionLabel = (leadId: string | null) => {
    if (!photoActionState || photoActionState.leadId !== leadId) {
      return null;
    }

    return photoActionState.phase === 'processing'
      ? 'Processing photo...'
      : 'Uploading photo...';
  };

  if (loading) {
    return (
      <div style={loadingCardStyle(compact)}>
        Loading leads...
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: compact ? 10 : 24 }}>
      <section style={panelStyle(compact)}>
        <div style={{ display: 'grid', gap: 16 }}>
          <div>
            <div style={{ fontSize: compact ? 20 : 28, fontWeight: 900, color: '#f8fafc' }}>
              Leads
            </div>
            <div style={{ color: '#c9d5e4', fontSize: compact ? 12 : 14, marginTop: 6 }}>
              Manager-only lead tracking for follow-up, estimates, and sales progress.
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: compact ? '1fr' : 'repeat(3, minmax(0, 1fr))',
              gap: 12,
            }}
          >
            <Field
              label="Customer Name"
              value={form.customerName}
              onChange={(value) => setForm((current) => ({ ...current, customerName: value }))}
            />
            <Field
              label="Phone Number"
              value={form.phoneNumber}
              onChange={(value) => setForm((current) => ({ ...current, phoneNumber: value }))}
            />
            <Field
              label="Vehicle"
              value={form.vehicle}
              onChange={(value) => setForm((current) => ({ ...current, vehicle: value }))}
            />
            <Field
              label="Insurance"
              value={form.insuranceCompany}
              onChange={(value) =>
                setForm((current) => ({ ...current, insuranceCompany: value }))
              }
            />
            <Field
              label="Source"
              value={form.source}
              onChange={(value) => setForm((current) => ({ ...current, source: value }))}
            />
            <Field
              label="Est. Value"
              value={String(form.estimatedValue || '')}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  estimatedValue: Number(value || 0),
                }))
              }
            />
            <Field
              label="Follow Up"
              type="date"
              value={form.followUpDate}
              onChange={(value) =>
                setForm((current) => ({ ...current, followUpDate: value }))
              }
            />
            <SelectField
              label="Status"
              value={form.status}
              onChange={(value) =>
                setForm((current) => ({ ...current, status: value as LeadStatus }))
              }
            />
          </div>

          {formError ? (
            <div
              style={{
                borderRadius: compact ? 12 : 14,
                padding: compact ? '10px 12px' : '12px 14px',
                background: 'rgba(127,29,29,0.28)',
                border: '1px solid rgba(248,113,113,0.34)',
                color: '#fecaca',
                fontSize: compact ? 12 : 13,
                fontWeight: 800,
              }}
            >
              {formError}
            </div>
          ) : null}

          <label style={{ display: 'grid', gap: 8 }}>
            <span style={fieldLabelStyle(compact)}>Notes</span>
            <textarea
              value={form.notes}
              onChange={(event) =>
                setForm((current) => ({ ...current, notes: event.target.value }))
              }
              rows={4}
              style={textAreaStyle(compact)}
            />
          </label>

          <div style={innerPanelStyle(compact)}>
            <div style={innerTitleStyle(compact)}>Photos</div>
            <div style={photoControlRowStyle(compact)}>
              <label style={checkboxRowStyle(compact)}>
                <input
                  type="checkbox"
                  checked={formPhotoTimestampEnabled}
                  onChange={(event) => setFormPhotoTimestampEnabled(event.target.checked)}
                />
                <span>Add timestamp</span>
              </label>
              <button
                onClick={() => createPhotoInputRef.current?.click()}
                style={secondaryButtonStyle(compact)}
                type="button"
              >
                Add / Take Photo
              </button>
              <input
                ref={createPhotoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleDraftPhotoSelection}
                style={{ display: 'none' }}
              />
            </div>
            {photoActionLabel(null) ? (
              <div style={photoStatusStyle(compact)}>{photoActionLabel(null)}</div>
            ) : null}
            {formPhotos.length ? (
              <div style={photoGridStyle}>
                {formPhotos.map((photo) => (
                  <div key={photo.id} style={photoCardStyle(compact)}>
                    <button
                      onClick={() => {
                        setSelectedPhoto({
                          id: photo.id,
                          url: photo.previewUrl,
                          createdAt: new Date().toISOString(),
                          fileSize: photo.fileSize,
                          width: photo.width,
                          height: photo.height,
                          timestampIncluded: photo.timestampIncluded,
                        });
                        setPhotoZoom(1);
                      }}
                      style={photoPreviewButtonStyle}
                      type="button"
                    >
                      <img src={photo.previewUrl} alt="Draft lead photo" style={photoImageStyle} />
                    </button>
                    <div style={photoMetaStyle(compact)}>
                      {photo.width}x{photo.height} • {formatFileSize(photo.fileSize)}
                    </div>
                    <button
                      onClick={() => {
                        URL.revokeObjectURL(photo.previewUrl);
                        setFormPhotos((current) => current.filter((item) => item.id !== photo.id));
                      }}
                      style={dangerButtonStyle(compact)}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div style={photoEmptyStateStyle(compact)}>No photos staged yet.</div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={() => void handleCreateLead()} style={primaryButtonStyle(compact)}>
              {saving ? 'Saving...' : 'Add Lead'}
            </button>
          </div>
        </div>
      </section>

      <section style={panelStyle(compact)}>
        <SectionHeading
          title="Active Leads"
          subtitle={`${activeLeads.length} open`}
          compact={compact}
        />
        <div style={{ display: 'grid', gap: 12 }}>
          {activeLeads.length ? (
            activeLeads.map((lead) => {
              const isOpen = openLeadIds.includes(lead.id);
              const leadDraft = leadDrafts[lead.id] ?? {
                customerName: lead.customerName,
                phoneNumber: lead.phoneNumber,
                vehicle: lead.vehicle,
                insuranceCompany: lead.insuranceCompany,
                source: lead.source,
                estimatedValue: lead.estimatedValue,
                followUpDate: lead.followUpDate,
                status: lead.status,
                notes: lead.notes,
              };
              return (
                <div key={lead.id} style={leadCardStyle(compact)}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: 12,
                      flexWrap: 'wrap',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: compact ? 16 : 20, fontWeight: 900 }}>
                        {lead.customerName}
                      </div>
                      <div style={{ color: '#c9d5e4', fontSize: compact ? 12 : 14 }}>
                        {lead.vehicle} • {lead.phoneNumber}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <select
                        value={lead.status}
                        onChange={(event) =>
                          void updateLeadStatus(lead.id, event.target.value as LeadStatus)
                        }
                        style={inputStyle(compact)}
                      >
                        <option value="new">New</option>
                        <option value="contacted">Contacted</option>
                        <option value="estimateScheduled">Estimate Scheduled</option>
                        <option value="won">Won</option>
                        <option value="lost">Lost</option>
                      </select>
                      <button
                        onClick={() =>
                          setOpenLeadIds((current) =>
                            current.includes(lead.id)
                              ? current.filter((id) => id !== lead.id)
                              : [...current, lead.id],
                          )
                        }
                        style={secondaryButtonStyle(compact)}
                      >
                        {isOpen ? 'Hide' : 'Open'}
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
                    <Pill compact={compact}>Source: {lead.source || '—'}</Pill>
                    <Pill compact={compact}>Insurance: {lead.insuranceCompany || '—'}</Pill>
                    <Pill compact={compact}>Value: {formatCurrency(lead.estimatedValue)}</Pill>
                    <Pill compact={compact}>Follow Up: {lead.followUpDate || '—'}</Pill>
                  </div>

                  <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
                      <div style={innerPanelStyle(compact)}>
                        <div style={innerTitleStyle(compact)}>Lead Details</div>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: compact ? '1fr' : 'repeat(3, minmax(0, 1fr))',
                            gap: 12,
                          }}
                        >
                          <Field
                            label="Customer Name"
                            value={leadDraft.customerName}
                            onChange={(value) =>
                              setLeadDrafts((current) => ({
                                ...current,
                                [lead.id]: { ...leadDraft, customerName: value },
                              }))
                            }
                          />
                          <Field
                            label="Phone Number"
                            value={leadDraft.phoneNumber}
                            onChange={(value) =>
                              setLeadDrafts((current) => ({
                                ...current,
                                [lead.id]: { ...leadDraft, phoneNumber: value },
                              }))
                            }
                          />
                          <Field
                            label="Vehicle"
                            value={leadDraft.vehicle}
                            onChange={(value) =>
                              setLeadDrafts((current) => ({
                                ...current,
                                [lead.id]: { ...leadDraft, vehicle: value },
                              }))
                            }
                          />
                          <Field
                            label="Insurance"
                            value={leadDraft.insuranceCompany}
                            onChange={(value) =>
                              setLeadDrafts((current) => ({
                                ...current,
                                [lead.id]: { ...leadDraft, insuranceCompany: value },
                              }))
                            }
                          />
                          <Field
                            label="Source"
                            value={leadDraft.source}
                            onChange={(value) =>
                              setLeadDrafts((current) => ({
                                ...current,
                                [lead.id]: { ...leadDraft, source: value },
                              }))
                            }
                          />
                          <Field
                            label="Est. Value"
                            value={String(leadDraft.estimatedValue || '')}
                            onChange={(value) =>
                              setLeadDrafts((current) => ({
                                ...current,
                                [lead.id]: {
                                  ...leadDraft,
                                  estimatedValue: Number(value || 0),
                                },
                              }))
                            }
                          />
                          <Field
                            label="Follow Up"
                            type="date"
                            value={leadDraft.followUpDate}
                            onChange={(value) =>
                              setLeadDrafts((current) => ({
                                ...current,
                                [lead.id]: { ...leadDraft, followUpDate: value },
                              }))
                            }
                          />
                        </div>

                        <label style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                          <span style={fieldLabelStyle(compact)}>Notes</span>
                          <textarea
                            value={leadDraft.notes}
                            onChange={(event) =>
                              setLeadDrafts((current) => ({
                                ...current,
                                [lead.id]: { ...leadDraft, notes: event.target.value },
                              }))
                            }
                            rows={4}
                            style={textAreaStyle(compact)}
                          />
                        </label>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                          <button
                            onClick={() => void handleSaveLeadDetails(lead)}
                            style={primaryButtonStyle(compact)}
                          >
                            {savingLeadId === lead.id ? 'Saving...' : 'Save Lead Details'}
                          </button>
                        </div>
                      </div>

                      <div style={innerPanelStyle(compact)}>
                        <div style={innerTitleStyle(compact)}>Notes</div>
                        <div style={{ color: '#eef4fb', lineHeight: 1.5 }}>
                          {lead.notes || 'No notes yet.'}
                        </div>
                      </div>

                      <div style={innerPanelStyle(compact)}>
                        <div style={innerTitleStyle(compact)}>Photos</div>
                        <div style={photoControlRowStyle(compact)}>
                          <label style={checkboxRowStyle(compact)}>
                            <input
                              type="checkbox"
                              checked={leadPhotoTimestampEnabled[lead.id] ?? true}
                              onChange={(event) =>
                                setLeadPhotoTimestampEnabled((current) => ({
                                  ...current,
                                  [lead.id]: event.target.checked,
                                }))
                              }
                            />
                            <span>Add timestamp</span>
                          </label>
                          <button
                            onClick={() => leadPhotoInputRefs.current[lead.id]?.click()}
                            style={secondaryButtonStyle(compact)}
                            type="button"
                          >
                            Add / Take Photo
                          </button>
                          <input
                            ref={(node) => {
                              leadPhotoInputRefs.current[lead.id] = node;
                            }}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={(event) => void handleExistingLeadPhotoSelection(lead, event)}
                            style={{ display: 'none' }}
                          />
                        </div>
                        {photoActionLabel(lead.id) ? (
                          <div style={photoStatusStyle(compact)}>{photoActionLabel(lead.id)}</div>
                        ) : null}
                        {lead.photos.length ? (
                          <div style={photoGridStyle}>
                            {lead.photos.map((photo) => (
                              <button
                                key={photo.id}
                                onClick={() => {
                                  setSelectedPhoto(photo);
                                  setPhotoZoom(1);
                                }}
                                style={photoThumbButtonStyle(compact)}
                                type="button"
                              >
                                <img src={photo.url} alt="Lead photo" style={photoImageStyle} />
                                <span style={photoMetaStyle(compact)}>
                                  {formatDateTime(photo.createdAt)}
                                </span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div style={photoEmptyStateStyle(compact)}>No photos yet.</div>
                        )}
                      </div>

                      {isOpen ? (
                        <div style={innerPanelStyle(compact)}>
                          <div style={innerTitleStyle(compact)}>Updates</div>
                          <div style={{ display: 'grid', gap: 10 }}>
                            <textarea
                              value={updateDrafts[lead.id] ?? ''}
                              onChange={(event) =>
                                setUpdateDrafts((current) => ({
                                  ...current,
                                  [lead.id]: event.target.value,
                                }))
                              }
                              rows={3}
                              placeholder="Add an update on this lead..."
                              style={textAreaStyle(compact)}
                            />
                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                              <button
                                onClick={() => {
                                  void addLeadUpdate(lead, updateDrafts[lead.id] ?? '');
                                  setUpdateDrafts((current) => ({ ...current, [lead.id]: '' }));
                                }}
                                style={primaryButtonStyle(compact)}
                              >
                                Save Update
                              </button>
                            </div>

                            {lead.updates.length ? (
                              lead.updates.map((update) => (
                                <div key={update.id} style={updateRowStyle(compact)}>
                                  <div style={{ color: '#f8fafc', lineHeight: 1.45 }}>{update.text}</div>
                                  <div style={{ color: '#b8c7da', fontSize: compact ? 11 : 12 }}>
                                    {formatDateTime(update.createdAt)}
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div style={{ color: '#c9d5e4' }}>No updates yet.</div>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>
                </div>
              );
            })
          ) : (
            <div style={emptyStateStyle(compact)}>No active leads yet.</div>
          )}
        </div>
      </section>

      <section style={panelStyle(compact)}>
        <SectionHeading
          title="Closed Leads"
          subtitle={`${closedLeads.length} closed`}
          compact={compact}
        />
        <div style={{ display: 'grid', gap: 10 }}>
          {closedLeads.length ? (
            closedLeads.map((lead) => (
              <div key={lead.id} style={leadCardStyle(compact)}>
                <div style={{ fontSize: compact ? 15 : 18, fontWeight: 800 }}>{lead.customerName}</div>
                <div style={{ color: '#c9d5e4', fontSize: compact ? 12 : 14 }}>
                  {lead.vehicle} • {lead.status === 'won' ? 'Won' : 'Lost'}
                </div>
              </div>
            ))
          ) : (
            <div style={emptyStateStyle(compact)}>No closed leads yet.</div>
          )}
        </div>
      </section>

      {selectedPhoto ? (
        <div style={photoViewerOverlayStyle}>
          <div style={photoViewerCardStyle(compact)}>
            <div style={photoViewerToolbarStyle}>
              <div style={{ color: '#dbeafe', fontWeight: 800, fontSize: compact ? 12 : 13 }}>
                {formatDateTime(selectedPhoto.createdAt)}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={() => setPhotoZoom((current) => Math.max(0.5, current - 0.25))}
                  style={secondaryButtonStyle(compact)}
                  type="button"
                >
                  Zoom Out
                </button>
                <button
                  onClick={() => setPhotoZoom((current) => Math.min(3, current + 0.25))}
                  style={secondaryButtonStyle(compact)}
                  type="button"
                >
                  Zoom In
                </button>
                <button
                  onClick={() => setSelectedPhoto(null)}
                  style={primaryButtonStyle(compact)}
                  type="button"
                >
                  Close
                </button>
              </div>
            </div>
            <div style={photoViewerCanvasStyle}>
              <img
                src={selectedPhoto.url}
                alt="Lead full size"
                style={{
                  maxWidth: '100%',
                  maxHeight: '70vh',
                  transform: `scale(${photoZoom})`,
                  transformOrigin: 'center center',
                  transition: 'transform 140ms ease',
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SectionHeading({
  title,
  subtitle,
  compact,
}: {
  title: string;
  subtitle: string;
  compact: boolean;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: compact ? 18 : 24, fontWeight: 900, color: '#f8fafc' }}>
        {title}
      </div>
      <div style={{ color: '#c9d5e4', fontSize: compact ? 12 : 13, marginTop: 4 }}>
        {subtitle}
      </div>
    </div>
  );
}

function Field({
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
    <label style={{ display: 'grid', gap: 8 }}>
      <span style={fieldLabelStyle(false)}>{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} style={inputStyle(false)} />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label style={{ display: 'grid', gap: 8 }}>
      <span style={fieldLabelStyle(false)}>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} style={inputStyle(false)}>
        <option value="new">New</option>
        <option value="contacted">Contacted</option>
        <option value="estimateScheduled">Estimate Scheduled</option>
        <option value="won">Won</option>
        <option value="lost">Lost</option>
      </select>
    </label>
  );
}

function Pill({ children, compact = false }: { children: React.ReactNode; compact?: boolean }) {
  return (
    <span
      style={{
        fontSize: compact ? 11 : 12,
        fontWeight: 800,
        color: '#dbeafe',
        background: 'rgba(37,99,235,0.2)',
        border: '1px solid rgba(96,165,250,0.32)',
        borderRadius: 999,
        padding: compact ? '5px 8px' : '6px 10px',
      }}
    >
      {children}
    </span>
  );
}

function panelStyle(compact: boolean): React.CSSProperties {
  return {
    borderRadius: compact ? 18 : 24,
    padding: compact ? 16 : 24,
    background: 'rgba(57,74,97,0.96)',
    border: '2px solid rgba(168,184,204,0.34)',
    boxShadow: '0 18px 40px rgba(0,0,0,0.14)',
  };
}

function leadCardStyle(compact: boolean): React.CSSProperties {
  return {
    borderRadius: compact ? 16 : 20,
    padding: compact ? 14 : 18,
    background: 'rgba(39,53,73,0.98)',
    border: '2px solid rgba(168,184,204,0.28)',
  };
}

function innerPanelStyle(compact: boolean): React.CSSProperties {
  return {
    borderRadius: compact ? 14 : 16,
    padding: compact ? 12 : 14,
    background: 'rgba(22,34,57,0.98)',
    border: '2px solid rgba(148,163,184,0.28)',
  };
}

function innerTitleStyle(compact: boolean): React.CSSProperties {
  return {
    fontSize: compact ? 12 : 13,
    fontWeight: 900,
    color: '#cbd5e1',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
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

function textAreaStyle(compact: boolean): React.CSSProperties {
  return {
    ...inputStyle(compact),
    minHeight: compact ? 86 : 96,
    resize: 'vertical',
    fontFamily: 'inherit',
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

function primaryButtonStyle(compact: boolean): React.CSSProperties {
  return {
    border: '1px solid rgba(96,165,250,0.4)',
    background: 'rgba(37,99,235,0.38)',
    color: '#f8fafc',
    borderRadius: compact ? 12 : 14,
    padding: compact ? '9px 12px' : '11px 14px',
    fontSize: compact ? 12 : 13,
    fontWeight: 800,
    cursor: 'pointer',
  };
}

function secondaryButtonStyle(compact: boolean): React.CSSProperties {
  return {
    border: '1px solid rgba(148,163,184,0.34)',
    background: 'rgba(51,65,85,0.92)',
    color: '#f8fafc',
    borderRadius: compact ? 12 : 14,
    padding: compact ? '9px 12px' : '11px 14px',
    fontSize: compact ? 12 : 13,
    fontWeight: 800,
    cursor: 'pointer',
  };
}

function dangerButtonStyle(compact: boolean): React.CSSProperties {
  return {
    border: '1px solid rgba(248,113,113,0.34)',
    background: 'rgba(127,29,29,0.36)',
    color: '#fee2e2',
    borderRadius: compact ? 10 : 12,
    padding: compact ? '7px 10px' : '8px 11px',
    fontSize: compact ? 11 : 12,
    fontWeight: 800,
    cursor: 'pointer',
  };
}

function updateRowStyle(compact: boolean): React.CSSProperties {
  return {
    borderRadius: compact ? 12 : 14,
    padding: compact ? 10 : 12,
    background: 'rgba(15,24,42,0.98)',
    border: '2px solid rgba(148,163,184,0.22)',
    display: 'grid',
    gap: 6,
  };
}

function emptyStateStyle(compact: boolean): React.CSSProperties {
  return {
    borderRadius: compact ? 14 : 16,
    padding: compact ? 12 : 14,
    background: 'rgba(22,34,57,0.98)',
    border: '2px solid rgba(148,163,184,0.22)',
    color: '#c9d5e4',
    fontSize: compact ? 12 : 13,
    fontWeight: 700,
  };
}

function loadingCardStyle(compact: boolean): React.CSSProperties {
  return {
    borderRadius: compact ? 16 : 24,
    padding: compact ? 14 : 28,
    background: 'rgba(15,23,42,0.78)',
    border: '1px solid rgba(148,163,184,0.18)',
    color: '#cbd5e1',
    fontSize: compact ? 13 : 16,
    fontWeight: 700,
  };
}

const photoGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(116px, 1fr))',
  gap: 10,
  marginTop: 12,
};

function photoCardStyle(compact: boolean): React.CSSProperties {
  return {
    display: 'grid',
    gap: 8,
    borderRadius: compact ? 12 : 14,
    padding: compact ? 10 : 12,
    background: 'rgba(15,24,42,0.98)',
    border: '2px solid rgba(148,163,184,0.22)',
  };
}

function photoThumbButtonStyle(compact: boolean): React.CSSProperties {
  return {
    ...photoCardStyle(compact),
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
  };
}

const photoPreviewButtonStyle: React.CSSProperties = {
  border: 'none',
  padding: 0,
  background: 'transparent',
  cursor: 'pointer',
};

const photoImageStyle: React.CSSProperties = {
  width: '100%',
  aspectRatio: '1 / 1',
  objectFit: 'cover',
  borderRadius: 12,
  display: 'block',
};

function photoMetaStyle(compact: boolean): React.CSSProperties {
  return {
    color: '#b8c7da',
    fontSize: compact ? 11 : 12,
    fontWeight: 700,
    lineHeight: 1.35,
  };
}

function photoEmptyStateStyle(compact: boolean): React.CSSProperties {
  return {
    marginTop: 12,
    color: '#c9d5e4',
    fontSize: compact ? 12 : 13,
    fontWeight: 700,
  };
}

function photoStatusStyle(compact: boolean): React.CSSProperties {
  return {
    marginTop: 10,
    color: '#dbeafe',
    fontSize: compact ? 12 : 13,
    fontWeight: 800,
  };
}

function photoControlRowStyle(compact: boolean): React.CSSProperties {
  return {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
    marginTop: 4,
    fontSize: compact ? 12 : 13,
  };
}

function checkboxRowStyle(compact: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: '#dbeafe',
    fontSize: compact ? 12 : 13,
    fontWeight: 700,
  };
}

const photoViewerOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(5, 10, 18, 0.76)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
  zIndex: 1000,
};

function photoViewerCardStyle(compact: boolean): React.CSSProperties {
  return {
    width: 'min(960px, 100%)',
    borderRadius: compact ? 18 : 22,
    padding: compact ? 14 : 18,
    background: 'rgba(15,23,42,0.98)',
    border: '2px solid rgba(148,163,184,0.26)',
    boxShadow: '0 24px 60px rgba(0,0,0,0.34)',
  };
}

const photoViewerToolbarStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  alignItems: 'center',
  flexWrap: 'wrap',
  marginBottom: 14,
};

const photoViewerCanvasStyle: React.CSSProperties = {
  minHeight: '40vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'auto',
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatFileSize(bytes: number) {
  if (!bytes) return '0 KB';
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${Math.round(kb)} KB`;
  }

  return `${(kb / 1024).toFixed(1)} MB`;
}

export default LeadsTab;
