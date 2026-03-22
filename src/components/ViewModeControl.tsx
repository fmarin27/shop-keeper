import type { DisplayMode } from '../types/app';

type ViewModeControlProps = {
  value: DisplayMode;
  onChange: (mode: DisplayMode) => void;
  compact?: boolean;
};

function ViewModeControl({ value, onChange, compact = false }: ViewModeControlProps) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: compact ? 8 : 14,
        color: '#e5e7eb',
        fontSize: compact ? 14 : 18,
        fontWeight: 700,
      }}
    >
      <span>View</span>

      <select
        value={value}
        onChange={(e) => onChange(e.target.value as DisplayMode)}
        style={{
          border: '1px solid rgba(148,163,184,0.22)',
          background: 'rgba(15,23,42,0.72)',
          color: '#f8fafc',
          borderRadius: compact ? 12 : 16,
          padding: compact ? '9px 12px' : '14px 18px',
          fontSize: compact ? 14 : 16,
          fontWeight: 700,
          outline: 'none',
          cursor: 'pointer',
        }}
      >
        <option value="normal">Normal</option>
        <option value="compact">Compact</option>
        <option value="overlay">Overlay</option>
      </select>
    </label>
  );
}

export default ViewModeControl;