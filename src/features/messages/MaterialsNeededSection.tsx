import React, { useEffect, useRef, useState } from 'react';
import type {
  MaterialRequest,
  MaterialStatus,
  MessageAudienceMode,
} from './types';

type MaterialsNeededSectionProps = {
  materials: MaterialRequest[];
  appMode: MessageAudienceMode;
  compact?: boolean;
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
};

function MaterialsNeededSection({
  materials,
  appMode,
  compact = false,
  unreadCount = 0,
  focusedMaterialId = null,
  onFocusedMaterialHandled,
  onAddMaterial,
  onSetMaterialStatus,
  onMarkMaterialRead,
}: MaterialsNeededSectionProps) {
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

  useEffect(() => {
    return () => {
      if (focusTimeoutRef.current !== null) {
        window.clearTimeout(focusTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!focusedMaterialId) return;

    const target = materials.find((item) => item.id === focusedMaterialId);
    if (!target) return;

    window.requestAnimationFrame(() => {
      focusedMaterialRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });

    if (focusTimeoutRef.current !== null) {
      window.clearTimeout(focusTimeoutRef.current);
    }

    focusTimeoutRef.current = window.setTimeout(() => {
      onFocusedMaterialHandled?.();
    }, 1200);
  }, [focusedMaterialId, materials, onFocusedMaterialHandled]);

  const submit = async () => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    setSaveState(null);

    const result = await onAddMaterial(
      itemName,
      quantity,
      note,
    );

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

  const showComposer = !compact;

  return (
    <section
      style={{
        borderRadius: compact ? 16 : 24,
        padding: compact ? 14 : 28,
        background: unreadCount > 0 ? 'rgba(58,74,97,0.96)' : 'rgba(58,74,97,0.94)',
        border:
          unreadCount > 0
            ? '2px solid rgba(96,165,250,0.42)'
            : '2px solid rgba(175,189,208,0.32)',
        boxShadow:
          unreadCount > 0
            ? '0 0 26px rgba(96,165,250,0.1), 0 18px 40px rgba(0,0,0,0.14)'
            : '0 18px 40px rgba(0,0,0,0.14), inset 0 0 0 1px rgba(255,255,255,0.05)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: compact ? 10 : 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span
            style={{
              borderRadius: 999,
              padding: compact ? '5px 9px' : '7px 12px',
              background:
                'linear-gradient(180deg, rgba(251,191,36,0.26), rgba(180,83,9,0.34))',
              border: '1px solid rgba(253,224,71,0.42)',
              color: '#fff7ed',
              fontSize: compact ? 10 : 12,
              fontWeight: 900,
              letterSpacing: 0.8,
              textTransform: 'uppercase',
            }}
          >
            Materials
          </span>
          <h2
            style={{
              margin: 0,
              fontSize: compact ? 16 : 28,
              fontWeight: 800,
              color: '#f8fafc',
            }}
          >
            {compact ? 'Unread Materials' : 'Materials Needed'}
          </h2>

          {unreadCount > 0 ? (
            <span
              style={{
                fontSize: compact ? 11 : 13,
                fontWeight: 900,
                color: '#dbeafe',
                background: 'rgba(37,99,235,0.22)',
                border: '1px solid rgba(96,165,250,0.34)',
                borderRadius: 999,
                padding: compact ? '5px 8px' : '7px 11px',
                boxShadow: '0 0 16px rgba(96,165,250,0.16)',
                whiteSpace: 'nowrap',
              }}
            >
              {unreadCount} unread
            </span>
          ) : null}
        </div>

        {showComposer ? (
          <button
            onClick={() => setShowForm((v) => !v)}
            style={{
              border: '1px solid rgba(96,165,250,0.5)',
              background:
                'linear-gradient(180deg, rgba(37,99,235,0.9) 0%, rgba(29,78,216,0.9) 100%)',
              color: '#eff6ff',
              borderRadius: 18,
              padding: '14px 22px',
              fontSize: 16,
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            {showForm ? 'Close' : 'Add Material Request'}
          </button>
        ) : null}
      </div>

      {showComposer && showForm ? (
        <div
          style={{
            display: 'grid',
            gap: 10,
            marginBottom: 18,
            padding: 14,
            borderRadius: 16,
            background: 'rgba(39,53,73,0.96)',
            border: '2px solid rgba(175,189,208,0.3)',
          }}
        >
          <input
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            placeholder="Material name"
            style={inputStyle(false)}
          />

          <input
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="Quantity"
            style={inputStyle(false)}
          />

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note"
            style={{
              ...inputStyle(false),
              minHeight: 84,
              resize: 'vertical',
              fontFamily: 'inherit',
            }}
          />

          {saveState ? (
            <div
              style={{
                color: saveState.kind === 'success' ? '#bbf7d0' : '#fecaca',
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {saveState.message}
            </div>
          ) : null}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={() => {
                void submit();
              }}
              style={actionButtonStyle(false, true)}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : 'Save Request'}
            </button>
            <button
              onClick={() => {
                setShowForm(false);
                setItemName('');
                setQuantity('');
                setNote('');
                setSaveState(null);
              }}
              style={actionButtonStyle(false, false)}
              disabled={isSubmitting}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div style={{ display: 'grid', gap: compact ? 8 : 14 }}>
        {materials.length ? (
          materials.map((item, index) => (
            <div
              key={item.id}
              ref={focusedMaterialId === item.id ? focusedMaterialRef : null}
              onClick={() => onMarkMaterialRead(item.id)}
              style={{
                borderRadius: compact ? 14 : 18,
                padding: compact ? 12 : 18,
                background: item.unread
                  ? index % 2 === 0
                    ? 'rgba(89,60,34,0.98)'
                    : 'rgba(111,75,43,0.98)'
                  : index % 2 === 0
                  ? 'rgba(77,58,40,0.96)'
                  : 'rgba(98,72,49,0.96)',
                border: focusedMaterialId === item.id
                  ? '2px solid rgba(96,165,250,0.68)'
                  : item.unread
                  ? '2px solid rgba(96,165,250,0.34)'
                  : '2px solid rgba(148,163,184,0.3)',
                boxShadow:
                  focusedMaterialId === item.id
                    ? '0 0 28px rgba(96,165,250,0.18)'
                    : item.unread
                    ? '0 10px 24px rgba(0,0,0,0.18)'
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
                  <div
                    style={{
                      fontSize: compact ? 14 : 19,
                      fontWeight: 800,
                      color: '#f8fafc',
                      marginBottom: 4,
                    }}
                  >
                    {item.itemName}
                  </div>

                <div
                  style={{
                    fontSize: compact ? 11 : 14,
                      color: '#b8c7da',
                    }}
                  >
                    Qty: {item.quantity}
                  </div>

                  {item.emailStatus === 'sent' ? (
                    <div
                      style={{
                        fontSize: compact ? 10 : 12,
                        color: '#bfdbfe',
                        fontWeight: 800,
                        marginTop: 4,
                      }}
                    >
                      Email sent to materials
                    </div>
                  ) : null}

                  {item.emailStatus === 'confirmed' ? (
                    <div
                      style={{
                        fontSize: compact ? 10 : 12,
                        color: '#bbf7d0',
                        fontWeight: 900,
                        marginTop: 4,
                      }}
                    >
                      Vendor confirmed by email
                    </div>
                  ) : null}

                  {item.emailStatus === 'failed' ? (
                    <div
                      style={{
                        fontSize: compact ? 10 : 12,
                        color: '#fecaca',
                        fontWeight: 800,
                        marginTop: 4,
                      }}
                    >
                      Email failed
                    </div>
                  ) : null}
                </div>

                <span style={statusBadgeStyle(item.status, compact)}>
                  {statusLabel(item.status)}
                </span>
              </div>

              {item.note ? (
                <div
                  style={{
                    fontSize: compact ? 11 : 13,
                    color: '#cbd5e1',
                    marginBottom: 10,
                  }}
                >
                  {item.note}
                </div>
              ) : null}

              {item.emailStatus === 'confirmed' && item.emailReplyText ? (
                <div
                  style={{
                    fontSize: compact ? 11 : 13,
                    color: '#d1fae5',
                    marginBottom: 10,
                  }}
                >
                  Reply: {item.emailReplyText}
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
                <div
                  style={{
                    fontSize: compact ? 10 : 12,
                    color: '#b8c7da',
                  }}
                >
                  {formatDateTime(item.createdAt)}
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {item.unread ? (
                    <div
                      style={{
                        fontSize: compact ? 11 : 13,
                        fontWeight: 800,
                        color: '#93c5fd',
                        textShadow: '0 0 10px rgba(96,165,250,0.5)',
                      }}
                    >
                      Unread
                    </div>
                  ) : null}

                  {!compact ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSetMaterialStatus(item.id, nextMaterialStatus(item.status));
                      }}
                      style={miniButtonStyle(false)}
                    >
                      Change Status
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div
            style={{
              borderRadius: compact ? 14 : 18,
              padding: compact ? 12 : 16,
              background: 'rgba(39,53,73,0.96)',
              border: '2px solid rgba(175,189,208,0.3)',
              color: '#b8c7da',
              fontSize: compact ? 11 : 13,
              fontWeight: 700,
            }}
          >
            {compact ? 'No unread material requests.' : 'No material requests yet.'}
          </div>
        )}
      </div>
    </section>
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

function statusBadgeStyle(
  status: MaterialStatus,
  compact: boolean,
): React.CSSProperties {
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

function actionButtonStyle(compact: boolean, primary: boolean): React.CSSProperties {
  return {
    border: primary
      ? '1px solid rgba(96,165,250,0.4)'
      : '1px solid rgba(148,163,184,0.34)',
    background: primary
      ? 'rgba(37,99,235,0.38)'
      : 'rgba(51,65,85,0.92)',
    color: '#f8fafc',
    borderRadius: compact ? 12 : 14,
    padding: compact ? '9px 12px' : '11px 14px',
    fontSize: compact ? 12 : 13,
    fontWeight: 800,
    cursor: 'pointer',
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
