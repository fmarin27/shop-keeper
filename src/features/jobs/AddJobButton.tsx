type AddJobButtonProps = {
  compact?: boolean;
};

function AddJobButton({ compact = false }: AddJobButtonProps) {
  return (
    <button
      style={{
        border: '1px solid rgba(96,165,250,0.5)',
        background:
          'linear-gradient(180deg, rgba(37,99,235,0.9) 0%, rgba(29,78,216,0.9) 100%)',
        color: '#eff6ff',
        borderRadius: compact ? 14 : 18,
        padding: compact ? '11px 18px' : '16px 28px',
        fontSize: compact ? 14 : 18,
        fontWeight: 800,
        cursor: 'pointer',
        boxShadow: '0 12px 30px rgba(37,99,235,0.28)',
      }}
    >
      Add Job
    </button>
  );
}

export default AddJobButton;