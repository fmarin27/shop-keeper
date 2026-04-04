import type { DisplayMode } from '../types/app';

type ViewModeControlProps = {
  value: DisplayMode;
  onChange: (mode: DisplayMode) => void;
  compact?: boolean;
  mobile?: boolean;
};

function ViewModeControl({
  value,
  onChange,
  compact = false,
  mobile = false,
}: ViewModeControlProps) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: compact ? 8 : 14,
        color: '#e5e7eb',
        fontSize: compact ? 14 : 18,
        fontWeight: 700,
        width: mobile ? '100%' : 'auto',
        justifyContent: mobile ? 'space-between' : 'flex-start',
      }}
    >
      <span>View</span>

      <select
        value={value}
        onChange={(e) => onChange(e.target.value as DisplayMode)}
        disabled={mobile}
        style={{
          border: '1px solid rgba(148,163,184,0.22)',
          background: mobile ? 'rgba(51,65,85,0.82)' : 'rgba(15,23,42,0.72)',
          color: '#f8fafc',
          borderRadius: compact ? 12 : 16,
          padding: compact ? '9px 12px' : '14px 18px',
          fontSize: compact ? 14 : 16,
          fontWeight: 700,
          outline: 'none',
          cursor: 'pointer',
          minWidth: mobile ? 150 : undefined,
          opacity: mobile ? 0.75 : 1,
        }}
      >
        <option value="normal">Normal</option>
        {!mobile ? <option value="compact">Compact</option> : null}
        {!mobile ? <option value="overlay">Overlay</option> : null}
      </select>
    </label>
  );
}

export default ViewModeControl;
