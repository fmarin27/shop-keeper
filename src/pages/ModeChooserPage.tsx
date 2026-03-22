import type { AppMode } from '../types/app';

type ModeChooserPageProps = {
  onSelectMode: (mode: AppMode) => void | Promise<void>;
};

function cardStyle(): React.CSSProperties {
  return {
    width: 280,
    padding: 24,
    borderRadius: 20,
    border: '1px solid rgba(96,165,250,0.22)',
    background: 'rgba(15,23,42,0.82)',
    color: '#e5e7eb',
    textAlign: 'left',
    cursor: 'pointer',
    boxShadow: '0 20px 50px rgba(0,0,0,0.22)',
  };
}

function ModeChooserPage({ onSelectMode }: ModeChooserPageProps) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background:
          'linear-gradient(180deg, rgba(2,6,23,1) 0%, rgba(8,15,30,1) 100%)',
        color: '#e5e7eb',
        fontFamily: 'Segoe UI, Inter, sans-serif',
        padding: 24,
        boxSizing: 'border-box',
      }}
    >
      <div style={{ maxWidth: 900, width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <h1 style={{ margin: 0, fontSize: 44 }}>Shop Floor</h1>
          <p style={{ marginTop: 12, fontSize: 18, opacity: 0.82 }}>
            Choose how this device will be used
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 24,
            flexWrap: 'wrap',
          }}
        >
          <button
            onClick={() => onSelectMode('manager')}
            style={cardStyle()}
          >
            <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>
              Manager
            </div>
            <div style={{ fontSize: 16, lineHeight: 1.5, opacity: 0.9 }}>
              Add and manage jobs, notes, materials, and messages.
            </div>
          </button>

          <button
            onClick={() => onSelectMode('tech')}
            style={cardStyle()}
          >
            <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>
              Tech
            </div>
            <div style={{ fontSize: 16, lineHeight: 1.5, opacity: 0.9 }}>
              View jobs, update status, add notes, and send materials/messages.
            </div>
          </button>
        </div>

        <div
          style={{
            textAlign: 'center',
            marginTop: 24,
            fontSize: 14,
            opacity: 0.7,
          }}
        >
          This can be changed later from inside the app.
        </div>
      </div>
    </div>
  );
}

export default ModeChooserPage;