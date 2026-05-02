import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  MaterialRequest,
  MaterialStatus,
  MessageAudienceMode,
} from './types';

type MaterialsNeededSectionProps = {
  materials: MaterialRequest[];
  appMode: MessageAudienceMode;
  compact?: boolean;
  mobile?: boolean;
  unreadCount?: number;
  focusedMaterialId?: string | null;
  onFocusedMaterialHandled?: () => void;
  onAddMaterial: (
    itemName: string,
    quantity: string,
    note: string,
  ) => Promise<{ ok: boolean; message?: string }>;
  onSetMaterialStatus: (id: string, status: MaterialStatus) => void;
  onMarkMaterialRead: (id: string) => void;
  onArchiveMaterial: (id: string, archived: boolean) => void;
  onDeleteMaterial: (id: string) => void;
};

function MaterialsNeededSection({
  materials,
  compact = false,
  mobile = false,
  unreadCount = 0,
  focusedMaterialId = null,
  onFocusedMaterialHandled,
  onAddMaterial,
  onSetMaterialStatus,
  onMarkMaterialRead,
  onArchiveMaterial,
  onDeleteMaterial,
}: MaterialsNeededSectionProps) {
  const [sectionOpen, setSectionOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [itemName, setItemName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [saveState, setSaveState] = useState<{
    kind: 'success' | 'error';
    message: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const focusedMaterialRef = useRef<HTMLDivElement | null>(null);
  const focusTimeoutRef = useRef<number | null>(null);
  const lastAutoFocusedMaterialIdRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (focusTimeoutRef.current !== null) {
        window.clearTimeout(focusTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!focusedMaterialId) return;
    if (lastAutoFocusedMaterialIdRef.current === focusedMaterialId) return;

    const target = materials.find((item) => item.id === focusedMaterialId);
    if (!target) return;

    if (target.unread) {
      onMarkMaterialRead(target.id);
    }

    setSectionOpen(true);
    if (target.archived || target.status === 'received') {
      setHistoryOpen(true);
    }

    window.requestAnimationFrame(() => {
      focusedMaterialRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });

    if (focusTimeoutRef.current !== null) {
      window.clearTimeout(focusTimeoutRef.current);
    }

    lastAutoFocusedMaterialIdRef.current = focusedMaterialId;
    focusTimeoutRef.current = window.setTimeout(() => {
      onFocusedMaterialHandled?.();
    }, 1200);
  }, [focusedMaterialId, materials, onFocusedMaterialHandled, onMarkMaterialRead]);

  useEffect(() => {
    if (!focusedMaterialId) {
      lastAutoFocusedMaterialIdRef.current = null;
    }
  }, [focusedMaterialId]);

  const activeMaterials = useMemo(
    () => materials.filter((item) => !item.archived && item.status !== 'received'),
    [materials],
  );

  const historyMaterials = useMemo(
    () => materials.filter((item) => item.archived || item.status === 'received'),
    [materials],
  );

  const showComposer = !compact || mobile;

  const submit = async () => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    setSaveState(null);

    const result = await onAddMaterial(itemName, quantity, note);

    if (!result.ok) {
      setSaveState({
        kind: 'error',
        message: result.message ?? 'Could not save material request.',
      });
      setIsSubmitting(false);
      return;
    }

    setItemName('');
    setQuantity('');
    setNote('');
    setShowForm(false);
    setSaveState({
      kind: 'success',
      message: result.message ?? 'Material request saved.',
    });
    setIsSubmitting(false);
  };

  return (
    <section style={sectionStyle(compact, unreadCount > 0)}>
      <button
        type="button"
        onClick={() => setSectionOpen((current) => !current)}
        style={headerButtonStyle(compact)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={labelPillStyle(compact)}>Materials</span>
          <h2 style={titleStyle(compact)}>Material Requests</h2>
          {unreadCount > 0 ? (
            <span style={unreadPillStyle(compact)}>{unreadCount} unread</span>
          ) : null}
        </div>

        <span style={miniButtonStyle(compact)}>
          {sectionOpen ? 'Collapse' : 'Expand'}
        </span>
      </button>

      {sectionOpen ? (
        <div style={{ display: 'grid', gap: compact ? 10 : 16 }}>
          {showComposer ? (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowForm((current) => !current)}
                style={actionButtonStyle(compact, true)}
              >
                {showForm ? 'Close' : 'Add Material Request'}
              </button>
            </div>
          ) : null}

          {showComposer && showForm ? (
            <div style={composerCardStyle()}>
              <input
                value={itemName}
                onChange={(event) => setItemName(event.target.value)}
                placeholder="Material name"
                style={inputStyle(compact)}
              />
              <input
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                placeholder="Quantity"
                style={inputStyle(compact)}
              />
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Optional note"
                style={textAreaStyle(compact)}
              />

              {saveState ? (
                <div style={saveStateStyle(saveState.kind)}>{saveState.message}</div>
              ) : null}

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => {
                    void submit();
                  }}
                  disabled={isSubmitting}
                  style={actionButtonStyle(compact, true, isSubmitting)}
                >
                  {isSubmitting ? 'Saving...' : 'Save Request'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setItemName('');
                    setQuantity('');
                    setNote('');
                    setSaveState(null);
                  }}
                  disabled={isSubmitting}
                  style={actionButtonStyle(compact, false, isSubmitting)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          <div style={{ display: 'grid', gap: compact ? 8 : 14 }}>
            {activeMaterials.length ? (
              activeMaterials.map((item, index) => (
                <MaterialCard
                  key={item.id}
                  item={item}
                  compact={compact}
                  isFocused={focusedMaterialId === item.id}
                  stripeIndex={index}
                  cardRef={focusedMaterialId === item.id ? focusedMaterialRef : null}
                  onOpen={() => onMarkMaterialRead(item.id)}
                  actions={
                    <>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onSetMaterialStatus(item.id, nextMaterialStatus(item.status));
                        }}
                        style={miniButtonStyle(compact)}
                      >
                        Change Status
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onArchiveMaterial(item.id, true);
                        }}
                        style={miniButtonStyle(compact)}
                      >
                        Archive
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onDeleteMaterial(item.id);
                        }}
                        style={dangerButtonStyle(compact)}
                      >
                        Delete
                      </button>
                    </>
                  }
                />
              ))
            ) : (
              <div style={emptyStateStyle(compact)}>
                No live material requests yet. Material catalog and invoice data are in Materials Manager.
              </div>
            )}
          </div>

          <div style={historyCardStyle(compact)}>
            <button
              type="button"
              onClick={() => setHistoryOpen((current) => !current)}
              style={historyToggleStyle()}
            >
              <div>
                <div style={{ fontSize: compact ? 14 : 18, fontWeight: 800, color: '#f8fafc' }}>
                  Materials History
                </div>
                <div style={{ color: '#b8c7da', fontSize: compact ? 11 : 12, marginTop: 4 }}>
                  Received or archived requests
                </div>
              </div>

              <span style={miniButtonStyle(compact)}>
                {historyOpen ? 'Collapse' : 'Expand'}
              </span>
            </button>

            {historyOpen ? (
              historyMaterials.length ? (
                <div style={{ display: 'grid', gap: compact ? 8 : 14 }}>
                  {historyMaterials.map((item) => (
                    <MaterialCard
                      key={item.id}
                      item={item}
                      compact={compact}
                      isFocused={focusedMaterialId === item.id}
                      stripeIndex={0}
                      cardRef={focusedMaterialId === item.id ? focusedMaterialRef : null}
                      onOpen={() => onMarkMaterialRead(item.id)}
                      muted
                      actions={
                        <>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onSetMaterialStatus(item.id, 'requested');
                              if (item.archived) {
                                onArchiveMaterial(item.id, false);
                              }
                            }}
                            style={miniButtonStyle(compact)}
                          >
                            Restore
                          </button>
                          {item.archived ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                onArchiveMaterial(item.id, false);
                              }}
                              style={miniButtonStyle(compact)}
                            >
                              Unarchive
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onDeleteMaterial(item.id);
                            }}
                            style={dangerButtonStyle(compact)}
                          >
                            Delete
                          </button>
                        </>
                      }
                    />
                  ))}
                </div>
              ) : (
                <div style={{ color: '#b8c7da', fontSize: compact ? 11 : 13, fontWeight: 700 }}>
                  No material history yet.
                </div>
              )
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function MaterialCard({
  item,
  compact,
  stripeIndex,
  isFocused,
  cardRef,
  onOpen,
  actions,
  muted = false,
}: {
  item: MaterialRequest;
  compact: boolean;
  stripeIndex: number;
  isFocused: boolean;
  cardRef: React.RefObject<HTMLDivElement | null> | null;
  onOpen: () => void;
  actions: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div
      ref={cardRef}
      onClick={onOpen}
      style={{
        borderRadius: compact ? 14 : 18,
        padding: compact ? 12 : 18,
        background: muted
          ? 'rgba(57,68,86,0.92)'
          : item.unread
          ? stripeIndex % 2 === 0
            ? 'rgba(89,60,34,0.98)'
            : 'rgba(111,75,43,0.98)'
          : stripeIndex % 2 === 0
          ? 'rgba(77,58,40,0.96)'
          : 'rgba(98,72,49,0.96)',
        border: isFocused
          ? '2px solid rgba(96,165,250,0.68)'
          : item.unread
          ? '2px solid rgba(96,165,250,0.34)'
          : '2px solid rgba(148,163,184,0.3)',
        boxShadow: isFocused
          ? '0 0 28px rgba(96,165,250,0.18)'
          : '0 10px 24px rgba(0,0,0,0.14)',
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 8,
        }}
      >
        <div>
          <div style={{ fontSize: compact ? 14 : 19, fontWeight: 800, color: '#f8fafc' }}>
            {item.itemName}
          </div>
          <div style={{ fontSize: compact ? 11 : 14, color: '#b8c7da', marginTop: 4 }}>
            Qty: {item.quantity}
          </div>
        </div>

        <span style={statusBadgeStyle(item.status, compact)}>{statusLabel(item.status)}</span>
      </div>

      {item.note ? (
        <div style={{ fontSize: compact ? 11 : 13, color: '#cbd5e1', marginBottom: 10 }}>
          {item.note}
        </div>
      ) : null}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ fontSize: compact ? 10 : 12, color: '#b8c7da' }}>
          {formatDateTime(item.createdAt)}
          {item.unread ? ' | Unread' : ''}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions}</div>
      </div>
    </div>
  );
}

function nextMaterialStatus(status: MaterialStatus): MaterialStatus {
  switch (status) {
    case 'requested':
      return 'ordered';
    case 'ordered':
      return 'received';
    case 'received':
      return 'requested';
    default:
      return 'requested';
  }
}

function statusLabel(status: MaterialStatus) {
  switch (status) {
    case 'requested':
      return 'Requested';
    case 'ordered':
      return 'Ordered';
    case 'received':
      return 'Received';
    default:
      return status;
  }
}

function sectionStyle(compact: boolean, activeUnread: boolean): React.CSSProperties {
  return {
    borderRadius: compact ? 16 : 24,
    padding: compact ? 14 : 28,
    background: activeUnread ? 'rgba(58,74,97,0.96)' : 'rgba(58,74,97,0.94)',
    border: activeUnread
      ? '2px solid rgba(96,165,250,0.42)'
      : '2px solid rgba(175,189,208,0.32)',
    boxShadow: activeUnread
      ? '0 0 26px rgba(96,165,250,0.1), 0 18px 40px rgba(0,0,0,0.14)'
      : '0 18px 40px rgba(0,0,0,0.14), inset 0 0 0 1px rgba(255,255,255,0.05)',
  };
}

function headerButtonStyle(compact: boolean): React.CSSProperties {
  return {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
    marginBottom: compact ? 10 : 20,
    width: '100%',
    background: 'transparent',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    textAlign: 'left',
  };
}

function labelPillStyle(compact: boolean): React.CSSProperties {
  return {
    borderRadius: 999,
    padding: compact ? '5px 9px' : '7px 12px',
    background: 'linear-gradient(180deg, rgba(251,191,36,0.26), rgba(180,83,9,0.34))',
    border: '1px solid rgba(253,224,71,0.42)',
    color: '#fff7ed',
    fontSize: compact ? 10 : 12,
    fontWeight: 900,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  };
}

function titleStyle(compact: boolean): React.CSSProperties {
  return {
    margin: 0,
    fontSize: compact ? 16 : 28,
    fontWeight: 800,
    color: '#f8fafc',
  };
}

function unreadPillStyle(compact: boolean): React.CSSProperties {
  return {
    fontSize: compact ? 11 : 13,
    fontWeight: 900,
    color: '#dbeafe',
    background: 'rgba(37,99,235,0.22)',
    border: '1px solid rgba(96,165,250,0.34)',
    borderRadius: 999,
    padding: compact ? '5px 8px' : '7px 11px',
    boxShadow: '0 0 16px rgba(96,165,250,0.16)',
    whiteSpace: 'nowrap',
  };
}

function composerCardStyle(): React.CSSProperties {
  return {
    display: 'grid',
    gap: 10,
    padding: 14,
    borderRadius: 16,
    background: 'rgba(39,53,73,0.96)',
    border: '2px solid rgba(175,189,208,0.3)',
  };
}

function historyCardStyle(compact: boolean): React.CSSProperties {
  return {
    borderRadius: compact ? 14 : 18,
    padding: compact ? 12 : 14,
    background: 'rgba(39,53,73,0.82)',
    border: '2px solid rgba(175,189,208,0.22)',
    display: 'grid',
    gap: 12,
  };
}

function historyToggleStyle(): React.CSSProperties {
  return {
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    background: 'transparent',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    color: 'inherit',
    textAlign: 'left',
  };
}

function inputStyle(compact: boolean): React.CSSProperties {
  return {
    width: '100%',
    boxSizing: 'border-box',
    borderRadius: compact ? 12 : 14,
    border: '2px solid rgba(148,163,184,0.24)',
    background: 'rgba(9,15,28,0.96)',
    color: '#f8fafc',
    padding: compact ? '10px 12px' : '12px 14px',
    fontSize: compact ? 12 : 13,
    outline: 'none',
  };
}

function textAreaStyle(compact: boolean): React.CSSProperties {
  return {
    ...inputStyle(compact),
    minHeight: 84,
    resize: 'vertical',
    fontFamily: 'inherit',
  };
}

function actionButtonStyle(
  compact: boolean,
  primary: boolean,
  disabled = false,
): React.CSSProperties {
  return {
    border: primary
      ? '1px solid rgba(96,165,250,0.4)'
      : '1px solid rgba(148,163,184,0.34)',
    background: primary ? 'rgba(37,99,235,0.38)' : 'rgba(51,65,85,0.92)',
    color: '#f8fafc',
    borderRadius: compact ? 12 : 14,
    padding: compact ? '9px 12px' : '11px 14px',
    fontSize: compact ? 12 : 13,
    fontWeight: 800,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  };
}

function miniButtonStyle(compact: boolean): React.CSSProperties {
  return {
    border: '1px solid rgba(148,163,184,0.34)',
    background: 'rgba(51,65,85,0.92)',
    color: '#f8fafc',
    borderRadius: compact ? 10 : 12,
    padding: compact ? '7px 10px' : '8px 12px',
    fontSize: compact ? 11 : 12,
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
    padding: compact ? '7px 10px' : '8px 12px',
    fontSize: compact ? 11 : 12,
    fontWeight: 800,
    cursor: 'pointer',
  };
}

function statusBadgeStyle(status: MaterialStatus, compact: boolean): React.CSSProperties {
  const styles: Record<MaterialStatus, React.CSSProperties> = {
    requested: {
      background: 'rgba(180,83,9,0.22)',
      border: '1px solid rgba(251,191,36,0.28)',
      color: '#fde68a',
    },
    ordered: {
      background: 'rgba(37,99,235,0.22)',
      border: '1px solid rgba(96,165,250,0.34)',
      color: '#dbeafe',
    },
    received: {
      background: 'rgba(22,163,74,0.22)',
      border: '1px solid rgba(74,222,128,0.28)',
      color: '#dcfce7',
    },
  };

  return {
    ...styles[status],
    fontSize: compact ? 11 : 13,
    fontWeight: 800,
    borderRadius: 999,
    padding: compact ? '5px 9px' : '7px 12px',
    whiteSpace: 'nowrap',
  };
}

function emptyStateStyle(compact: boolean): React.CSSProperties {
  return {
    borderRadius: compact ? 14 : 18,
    padding: compact ? 12 : 16,
    background: 'rgba(39,53,73,0.96)',
    border: '2px solid rgba(175,189,208,0.3)',
    color: '#b8c7da',
    fontSize: compact ? 11 : 13,
    fontWeight: 700,
  };
}

function saveStateStyle(kind: 'success' | 'error'): React.CSSProperties {
  return {
    color: kind === 'success' ? '#bbf7d0' : '#fecaca',
    fontSize: 13,
    fontWeight: 700,
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

export default MaterialsNeededSection;
