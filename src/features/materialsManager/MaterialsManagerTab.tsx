import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { appBridge } from '../../services/platform/appBridge';

type MaterialsManagerTabProps = {
  compact?: boolean;
  mobile?: boolean;
};

function MaterialsManagerTab({
  compact = false,
  mobile = false,
}: MaterialsManagerTabProps) {
  const [unlocked, setUnlocked] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadAccess = async () => {
      try {
        const access = await appBridge.getMaterialsManagerAccess();
        if (mounted) {
          setUnlocked(access.unlocked);
        }
      } catch (error) {
        if (mounted) {
          setStatusMessage(
            error instanceof Error
              ? error.message
              : 'Could not load Materials Manager access.',
          );
        }
      }
    };

    void loadAccess();

    return () => {
      mounted = false;
    };
  }, []);

  const handleUnlock = async () => {
    setIsBusy(true);
    setStatusMessage(null);

    try {
      const result = await appBridge.unlockMaterialsManager(accessCode);
      setUnlocked(result.settings.materialsManagerUnlocked);
      setStatusMessage(result.message);
      if (result.ok) {
        setAccessCode('');
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleLaunch = async () => {
    setIsBusy(true);
    setStatusMessage(null);

    try {
      const result = await appBridge.launchMaterialsManager();
      setStatusMessage(result.message);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section
      style={{
        display: 'grid',
        gap: mobile ? 12 : 16,
      }}
    >
      <div
        style={{
          borderRadius: 24,
          border: '2px solid rgba(196,207,223,0.42)',
          background: 'linear-gradient(180deg, rgba(78,94,120,0.97), rgba(43,56,77,0.98))',
          padding: mobile ? 14 : compact ? 16 : 22,
          boxShadow: '0 18px 42px rgba(0,0,0,0.16)',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: mobile ? '1fr' : 'minmax(0, 1.15fr) minmax(320px, 0.85fr)',
            gap: mobile ? 14 : 20,
          }}
        >
          <div
            style={{
              borderRadius: 20,
              border: '1px solid rgba(148,163,184,0.22)',
              background: 'rgba(8,16,28,0.35)',
              padding: mobile ? 16 : 22,
            }}
          >
            <div style={{ color: '#9fc2ff', fontWeight: 900, fontSize: 12, letterSpacing: 0.7 }}>
              PREMIUM ADD-ON
            </div>
            <h2
              style={{
                margin: '8px 0 10px',
                fontSize: mobile ? 24 : 34,
                fontWeight: 900,
                color: '#f8fbff',
              }}
            >
              Materials Manager
            </h2>
            <p
              style={{
                margin: 0,
                color: '#d7e3f4',
                fontSize: mobile ? 13 : 15,
                lineHeight: 1.55,
                maxWidth: 740,
              }}
            >
              This connects Shop Keeper to your separate materials and invoice workflow so office
              staff can launch the dedicated materials program from one place. It is intentionally
              gated as a paid add-on for shops that want the extra purchasing and invoice tools.
            </p>

            <div
              style={{
                marginTop: 18,
                display: 'grid',
                gap: 10,
              }}
            >
              {[
                'Launch the dedicated Materials App from inside Shop Keeper',
                'Keep Repair Orders and materials workflow side-by-side on desktop',
                'Set this up as a premium add-on instead of bundling it into the base app',
              ].map((item) => (
                <div
                  key={item}
                  style={{
                    display: 'flex',
                    gap: 10,
                    alignItems: 'flex-start',
                    color: '#eef5ff',
                    fontWeight: 700,
                  }}
                >
                  <span style={{ color: '#60a5fa' }}>•</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              borderRadius: 20,
              border: unlocked
                ? '1px solid rgba(74,222,128,0.34)'
                : '1px solid rgba(251,191,36,0.28)',
              background: unlocked ? 'rgba(5,150,105,0.14)' : 'rgba(120,53,15,0.18)',
              padding: mobile ? 16 : 22,
              display: 'grid',
              gap: 14,
              alignContent: 'start',
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 900,
                  letterSpacing: 0.7,
                  color: unlocked ? '#9ef7ba' : '#fcd34d',
                }}
              >
                {unlocked ? 'UNLOCKED ON THIS DEVICE' : 'LOCKED'}
              </div>
              <div
                style={{
                  marginTop: 8,
                  fontSize: 24,
                  fontWeight: 900,
                  color: '#ffffff',
                }}
              >
                {unlocked ? 'Materials Manager Ready' : 'Upgrade Required'}
              </div>
            </div>

            {!unlocked ? (
              <>
                <div
                  style={{
                    color: '#f6e7b6',
                    fontSize: 14,
                    lineHeight: 1.5,
                  }}
                >
                  Use your paid add-on access code to unlock the Materials Manager launcher for
                  this desktop install.
                </div>

                <input
                  value={accessCode}
                  onChange={(event) => setAccessCode(event.target.value)}
                  placeholder="Enter Materials Manager access code"
                  style={{
                    borderRadius: 12,
                    border: '1px solid rgba(251,191,36,0.3)',
                    background: 'rgba(15,23,42,0.78)',
                    color: '#f8fbff',
                    padding: '12px 14px',
                    fontSize: 14,
                    fontWeight: 700,
                    outline: 'none',
                  }}
                />

                <button
                  type="button"
                  onClick={() => void handleUnlock()}
                  disabled={isBusy || !accessCode.trim()}
                  style={primaryButtonStyle(isBusy || !accessCode.trim(), '#d97706')}
                >
                  {isBusy ? 'Unlocking...' : 'Unlock Materials Manager'}
                </button>
              </>
            ) : (
              <>
                <div
                  style={{
                    color: '#d4ffe3',
                    fontSize: 14,
                    lineHeight: 1.5,
                  }}
                >
                  The add-on is unlocked here. You can launch the dedicated Materials App directly
                  from Shop Keeper.
                </div>

                <button
                  type="button"
                  onClick={() => void handleLaunch()}
                  disabled={isBusy}
                  style={primaryButtonStyle(isBusy, '#059669')}
                >
                  {isBusy ? 'Launching...' : 'Open Materials Manager'}
                </button>
              </>
            )}

            {statusMessage ? (
              <div
                style={{
                  borderRadius: 12,
                  border: '1px solid rgba(148,163,184,0.2)',
                  background: 'rgba(15,23,42,0.55)',
                  color: '#e2ecf9',
                  padding: '12px 14px',
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                {statusMessage}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function primaryButtonStyle(disabled: boolean, borderColor: string): CSSProperties {
  return {
    borderRadius: 14,
    border: `1px solid ${borderColor}`,
    background: disabled ? '#5b6678' : '#1d4ed8',
    color: '#f8fbff',
    padding: '13px 16px',
    fontSize: 14,
    fontWeight: 800,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.82 : 1,
  };
}

export default MaterialsManagerTab;
