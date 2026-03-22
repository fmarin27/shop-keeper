import type { AppMode } from '../types/app';

type OverlayViewProps = {
  appMode: AppMode;
  onExpand: () => void;
  onClose: () => void;
};

export default function OverlayView({
  appMode,
  onExpand,
  onClose,
}: OverlayViewProps) {
  const topPriorityJob = {
    vehicle: '2022 Honda CR-V',
    ro: '25481',
    amount: '$5,600 - Not Final',
    status: 'In Progress',
    promiseDate: '4/18/26',
    partsWaiting: true,
    unread: true,
  };

  const unreadActivity = [
    { type: 'Job Note', text: 'Honda CR-V has 2 unread notes', unread: true },
    { type: 'Material', text: 'Primer requested for Camry repair', unread: true },
    { type: 'Message', text: 'Customer called, awaiting callback', unread: true },
  ];

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'transparent',
        padding: 12,
        boxSizing: 'border-box',
        fontFamily: 'Segoe UI, Inter, sans-serif',
        color: '#f8fafc',
      }}
    >
      <div
        style={{
          borderRadius: 22,
          padding: 14,
          background: 'rgba(2, 6, 23, 0.42)',
          border: '1px solid rgba(96, 165, 250, 0.18)',
          boxShadow: '0 18px 50px rgba(0,0,0,0.28)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)' as any,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 12,
            WebkitAppRegion: 'drag' as any,
          }}
        >
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.05 }}>
              Shop Floor
            </div>
            <div
              style={{
                marginTop: 5,
                fontSize: 12,
                color: 'rgba(226,232,240,0.82)',
              }}
            >
              {appMode === 'manager' ? 'Manager' : 'Tech'} Overlay
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 8,
              WebkitAppRegion: 'no-drag' as any,
            }}
          >
            <button onClick={onExpand} style={buttonStyle(true)}>
              Expand
            </button>
            <button onClick={onClose} style={buttonStyle(false)}>
              Close
            </button>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gap: 10,
            WebkitAppRegion: 'no-drag' as any,
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 8,
            }}
          >
            <MiniStat label="Unread Job Notes" value="2" glow />
            <MiniStat label="Unread Activity" value="3" glow />
            <MiniStat label="Mode" value={appMode === 'manager' ? 'Manager' : 'Tech'} />
          </div>

          <div
            style={{
              borderRadius: 16,
              padding: 12,
              background: 'rgba(15,23,42,0.34)',
              border: '1px solid rgba(96,165,250,0.18)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 10,
                alignItems: 'flex-start',
                flexWrap: 'wrap',
                marginBottom: 8,
              }}
            >
              <div>
                <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>
                  Top Priority Job
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.15 }}>
                  {topPriorityJob.vehicle}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'rgba(226,232,240,0.78)',
                    marginTop: 4,
                  }}
                >
                  RO {topPriorityJob.ro}
                </div>
              </div>

              <span
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  padding: '5px 9px',
                  borderRadius: 999,
                  background: 'rgba(37,99,235,0.2)',
                  border: '1px solid rgba(96,165,250,0.24)',
                  color: '#dbeafe',
                  whiteSpace: 'nowrap',
                }}
              >
                {topPriorityJob.status}
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: 8,
                marginBottom: 10,
              }}
            >
              <InfoTile label="Amount" value={topPriorityJob.amount} />
              <InfoTile label="Promise" value={topPriorityJob.promiseDate} />
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 10,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {topPriorityJob.partsWaiting ? (
                  <span style={chipStyle('warning')}>Parts Waiting</span>
                ) : null}
                {topPriorityJob.unread ? (
                  <span style={chipStyle('glow')}>Unread Note</span>
                ) : null}
              </div>

              <button style={inlineActionStyle()}>Open Full View</button>
            </div>
          </div>

          <div
            style={{
              borderRadius: 16,
              padding: 12,
              background: 'rgba(15,23,42,0.30)',
              border: '1px solid rgba(148,163,184,0.14)',
            }}
          >
            <div
              style={{
                fontSize: 12,
                opacity: 0.82,
                marginBottom: 8,
              }}
            >
              Unread Activity
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              {unreadActivity.map((item, index) => (
                <div
                  key={`${item.type}-${index}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 10,
                    alignItems: 'center',
                    borderRadius: 12,
                    padding: '10px 11px',
                    background: 'rgba(2,6,23,0.28)',
                    border: '1px solid rgba(148,163,184,0.12)',
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        color: '#93c5fd',
                        marginBottom: 3,
                      }}
                    >
                      {item.type}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        color: '#f8fafc',
                        fontWeight: 600,
                        lineHeight: 1.2,
                      }}
                    >
                      {item.text}
                    </div>
                  </div>

                  {item.unread ? (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        color: '#93c5fd',
                        textShadow: '0 0 8px rgba(96,165,250,0.4)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Unread
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  glow = false,
}: {
  label: string;
  value: string;
  glow?: boolean;
}) {
  return (
    <div
      style={{
        borderRadius: 14,
        padding: '10px 11px',
        background: glow ? 'rgba(37,99,235,0.18)' : 'rgba(15,23,42,0.28)',
        border: glow
          ? '1px solid rgba(96,165,250,0.22)'
          : '1px solid rgba(148,163,184,0.12)',
        boxShadow: glow ? '0 0 16px rgba(96,165,250,0.12)' : 'none',
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          color: 'rgba(226,232,240,0.72)',
          marginBottom: 4,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 900,
          color: '#f8fafc',
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function InfoTile({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        borderRadius: 12,
        padding: '9px 10px',
        background: 'rgba(2,6,23,0.26)',
        border: '1px solid rgba(148,163,184,0.1)',
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          color: 'rgba(226,232,240,0.68)',
          marginBottom: 4,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: '#f8fafc',
          lineHeight: 1.15,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function chipStyle(kind: 'warning' | 'glow'): React.CSSProperties {
  if (kind === 'warning') {
    return {
      fontSize: 11,
      fontWeight: 800,
      color: '#fde68a',
      background: 'rgba(180,83,9,0.18)',
      border: '1px solid rgba(251,191,36,0.2)',
      borderRadius: 999,
      padding: '5px 8px',
      whiteSpace: 'nowrap',
    };
  }

  return {
    fontSize: 11,
    fontWeight: 800,
    color: '#93c5fd',
    background: 'rgba(37,99,235,0.18)',
    border: '1px solid rgba(96,165,250,0.22)',
    borderRadius: 999,
    padding: '5px 8px',
    whiteSpace: 'nowrap',
    textShadow: '0 0 8px rgba(96,165,250,0.35)',
  };
}

function inlineActionStyle(): React.CSSProperties {
  return {
    border: '1px solid rgba(96,165,250,0.28)',
    background: 'rgba(37,99,235,0.2)',
    color: '#eff6ff',
    borderRadius: 12,
    padding: '8px 11px',
    fontSize: 12,
    fontWeight: 800,
    cursor: 'pointer',
  };
}

function buttonStyle(primary: boolean): React.CSSProperties {
  return {
    border: primary
      ? '1px solid rgba(96,165,250,0.48)'
      : '1px solid rgba(148,163,184,0.22)',
    background: primary ? 'rgba(37,99,235,0.28)' : 'rgba(30,41,59,0.56)',
    color: '#f8fafc',
    borderRadius: 12,
    padding: '8px 12px',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  };
}