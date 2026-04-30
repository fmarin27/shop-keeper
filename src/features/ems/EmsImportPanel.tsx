import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { appBridge } from '../../services/platform/appBridge';
import { convertEmsRepairOrderToJob } from '../../services/firebase/jobs';
import type {
  EmsImportCandidate,
  EmsImportCandidatesSnapshot,
  EmsNormalizedRepairOrder,
} from '../../types/app';

type EmsImportPanelProps = {
  compact?: boolean;
  mobile?: boolean;
};

type EmsImportDraft = {
  roNumber: string;
  customerName: string;
  amount: string;
};

type SortDirection = 'asc' | 'desc';
type EmsCandidateSortKey =
  | 'updated'
  | 'customer'
  | 'ro'
  | 'vehicle'
  | 'amount'
  | 'source';
type EmsCandidateSort = {
  key: EmsCandidateSortKey;
  direction: SortDirection;
};

const DEFAULT_MESSAGE =
  'EMS import is manual. The app watches this PC and the office PC, then you choose which EMS bundle becomes an RO.';

function EmsImportPanel({
  compact = false,
  mobile = false,
}: EmsImportPanelProps) {
  const [emsImportMessage, setEmsImportMessage] = useState<string | null>(
    DEFAULT_MESSAGE,
  );
  const [emsImportError, setEmsImportError] = useState<string | null>(null);
  const [emsCandidatesSnapshot, setEmsCandidatesSnapshot] =
    useState<EmsImportCandidatesSnapshot | null>(null);
  const [showEmsImportModal, setShowEmsImportModal] = useState(false);
  const [loadingEmsCandidates, setLoadingEmsCandidates] = useState(false);
  const [convertingEmsCandidateId, setConvertingEmsCandidateId] = useState<
    string | null
  >(null);
  const [candidateDrafts, setCandidateDrafts] = useState<Record<string, EmsImportDraft>>({});

  const emsCandidateCount = emsCandidatesSnapshot?.candidates.length ?? 0;
  const isEmsImportBusy = loadingEmsCandidates || Boolean(convertingEmsCandidateId);

  const refreshEmsCandidates = async (options: { silent?: boolean } = {}) => {
    if (!appBridge.isDesktop()) {
      return null;
    }

    if (!options.silent) {
      setLoadingEmsCandidates(true);
      setEmsImportError(null);
    }

    try {
      const snapshot = await appBridge.listEmsImportCandidates();
      setEmsCandidatesSnapshot(snapshot);

      if (!options.silent) {
        setEmsImportMessage(
          `EMS watch found ${snapshot.candidates.length} bundle${
            snapshot.candidates.length === 1 ? '' : 's'
          } across this PC and the office PC. Choose one when you are ready to create an RO.`,
        );
      }

      return snapshot;
    } catch (error) {
      if (!options.silent) {
        setEmsImportError(
          error instanceof Error ? error.message : 'Could not scan EMS watched folders.',
        );
      }

      return null;
    } finally {
      if (!options.silent) {
        setLoadingEmsCandidates(false);
      }
    }
  };

  useEffect(() => {
    if (!appBridge.isDesktop()) {
      return undefined;
    }

    void refreshEmsCandidates();
    const intervalId = window.setInterval(() => {
      void refreshEmsCandidates({ silent: true });
    }, 30000);

    return () => window.clearInterval(intervalId);
  }, []);

  const handleOpenEmsImportModal = async () => {
    setShowEmsImportModal(true);
    await refreshEmsCandidates();
  };

  const closeEmsImportModal = () => {
    if (convertingEmsCandidateId) return;
    setShowEmsImportModal(false);
  };

  const handleConvertEmsCandidate = async (candidate: EmsImportCandidate) => {
    setConvertingEmsCandidateId(candidate.id);
    setEmsImportError(null);
    setEmsImportMessage(`Converting ${candidate.label} into an RO...`);

    try {
      const conversion = await appBridge.convertEmsImportCandidate(candidate);
      const repairOrder = applyEmsImportDraft(
        conversion.repairOrder,
        getCandidateDraft(candidate, candidateDrafts),
      );
      const result = await convertEmsRepairOrderToJob(
        repairOrder,
        conversion.selectedPath,
        { sourceModifiedAt: candidate.lastModifiedAt },
      );

      setEmsImportMessage(
        `Converted ${candidate.label} into RO ${result.roNumber} for ${
          result.customerName || result.vehicle || 'selected EMS bundle'
        }. ${result.lineCount} estimate lines and ${result.partCount} parts candidates imported.`,
      );
      await refreshEmsCandidates({ silent: true });
      setShowEmsImportModal(false);
    } catch (error) {
      setEmsImportError(
        error instanceof Error ? error.message : 'Could not convert the selected EMS bundle.',
      );
    } finally {
      setConvertingEmsCandidateId(null);
    }
  };

  if (!appBridge.isDesktop()) {
    return null;
  }

  return (
    <>
      <div
        style={{
          display: 'grid',
          gap: 10,
          marginBottom: compact ? 14 : 18,
        }}
      >
        <div
          style={{
            borderRadius: compact ? 14 : 18,
            padding: compact ? '10px 12px' : '12px 16px',
            background: emsImportError
              ? 'rgba(127,29,29,0.32)'
              : 'rgba(37,99,235,0.14)',
            border: emsImportError
              ? '1px solid rgba(248,113,113,0.34)'
              : '1px solid rgba(96,165,250,0.28)',
            color: emsImportError ? '#fecaca' : '#dbeafe',
            fontSize: compact ? 12 : 13,
            fontWeight: 800,
            lineHeight: 1.5,
          }}
        >
          {emsImportError ? `EMS import error: ${emsImportError}` : emsImportMessage}
        </div>

        {emsCandidatesSnapshot ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: mobile ? '1fr' : 'repeat(4, minmax(0, 1fr))',
              gap: 8,
            }}
          >
            {emsCandidatesSnapshot.sources.map((source) => (
              <div
                key={source.id}
                title={source.path}
                style={{
                  borderRadius: 12,
                  padding: compact ? '8px 10px' : '9px 11px',
                  background: source.available
                    ? 'rgba(15,23,42,0.72)'
                    : 'rgba(127,29,29,0.22)',
                  border: source.available
                    ? '1px solid rgba(148,163,184,0.18)'
                    : '1px solid rgba(248,113,113,0.26)',
                  color: source.available ? '#cbd5e1' : '#fecaca',
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    fontSize: compact ? 11 : 12,
                    fontWeight: 900,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {source.label}
                </div>
                <div
                  style={{
                    marginTop: 3,
                    fontSize: compact ? 10 : 11,
                    fontWeight: 700,
                    opacity: 0.84,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {source.candidateCount} found - {source.message}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            onClick={() => {
              void refreshEmsCandidates();
            }}
            disabled={loadingEmsCandidates}
            style={{
              border: '1px solid rgba(148,163,184,0.24)',
              background: 'rgba(15,23,42,0.76)',
              color: '#cbd5e1',
              fontWeight: 800,
              fontSize: mobile ? 13 : 14,
              padding: mobile ? '10px 14px' : '10px 16px',
              borderRadius: 12,
              cursor: loadingEmsCandidates ? 'not-allowed' : 'pointer',
              opacity: loadingEmsCandidates ? 0.75 : 1,
              width: mobile ? '100%' : 'auto',
            }}
          >
            {loadingEmsCandidates ? 'Scanning...' : 'Refresh Watch'}
          </button>
          <button
            type="button"
            onClick={() => {
              void handleOpenEmsImportModal();
            }}
            disabled={isEmsImportBusy}
            style={{
              border: '1px solid rgba(96,165,250,0.45)',
              background: isEmsImportBusy
                ? 'rgba(51,65,85,0.92)'
                : 'linear-gradient(180deg, rgba(37,99,235,0.92), rgba(29,78,216,0.92))',
              color: '#eff6ff',
              fontWeight: 800,
              fontSize: mobile ? 13 : 14,
              padding: mobile ? '10px 14px' : '10px 16px',
              borderRadius: 12,
              cursor: isEmsImportBusy ? 'not-allowed' : 'pointer',
              opacity: isEmsImportBusy ? 0.75 : 1,
              width: mobile ? '100%' : 'auto',
            }}
          >
            {convertingEmsCandidateId
              ? 'Converting EMS...'
              : `Choose EMS to Convert (${emsCandidateCount})`}
          </button>
        </div>
      </div>

      {showEmsImportModal ? (
        <EmsImportModal
          snapshot={emsCandidatesSnapshot}
          loading={loadingEmsCandidates}
          convertingCandidateId={convertingEmsCandidateId}
          mobile={mobile}
          onClose={closeEmsImportModal}
          onRefresh={() => {
            void refreshEmsCandidates();
          }}
          candidateDrafts={candidateDrafts}
          onCandidateDraftChange={(candidateId, draft) =>
            setCandidateDrafts((current) => ({
              ...current,
              [candidateId]: draft,
            }))
          }
          onConvert={(candidate) => {
            void handleConvertEmsCandidate(candidate);
          }}
        />
      ) : null}
    </>
  );
}

type EmsImportModalProps = {
  snapshot: EmsImportCandidatesSnapshot | null;
  loading: boolean;
  convertingCandidateId: string | null;
  mobile: boolean;
  onClose: () => void;
  onRefresh: () => void;
  candidateDrafts: Record<string, EmsImportDraft>;
  onCandidateDraftChange: (candidateId: string, draft: EmsImportDraft) => void;
  onConvert: (candidate: EmsImportCandidate) => void;
};

function EmsImportModal({
  snapshot,
  loading,
  convertingCandidateId,
  mobile,
  onClose,
  onRefresh,
  candidateDrafts,
  onCandidateDraftChange,
  onConvert,
}: EmsImportModalProps) {
  const candidates = snapshot?.candidates ?? [];
  const sources = snapshot?.sources ?? [];
  const isConverting = Boolean(convertingCandidateId);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<EmsCandidateSort>({
    key: 'updated',
    direction: 'desc',
  });
  const filteredCandidates = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matches = !query
      ? candidates
      : candidates.filter((candidate) =>
          [
            candidate.label,
            candidate.familyId,
            candidate.roNumber ?? '',
            candidate.customerName ?? '',
            candidate.vehicle ?? '',
            candidate.insuranceCompany ?? '',
            candidate.claimNumber ?? '',
            candidate.primaryFile,
          ]
            .join(' ')
            .toLowerCase()
            .includes(query),
        );

    return [...matches].sort((left, right) => {
      const comparison = compareSortValues(
        getCandidateSortValue(left, sort.key, candidateDrafts),
        getCandidateSortValue(right, sort.key, candidateDrafts),
      );

      return sort.direction === 'asc' ? comparison : comparison * -1;
    });
  }, [candidates, candidateDrafts, search, sort]);

  const toggleSort = (key: EmsCandidateSortKey) => {
    setSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(2,6,23,0.64)',
        backdropFilter: 'blur(4px)',
        display: 'grid',
        placeItems: 'center',
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: mobile ? '100%' : 'min(1040px, 100%)',
          maxHeight: mobile ? '100vh' : 'calc(100vh - 40px)',
          borderRadius: 24,
          background:
            'linear-gradient(180deg, rgba(15,23,42,0.98), rgba(2,6,23,0.98))',
          border: '1px solid rgba(148,163,184,0.18)',
          boxShadow: '0 30px 80px rgba(0,0,0,0.45)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            padding: mobile ? '16px' : '20px 24px',
            borderBottom: '1px solid rgba(148,163,184,0.14)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div>
            <div
              style={{
                color: '#f8fafc',
                fontWeight: 900,
                fontSize: mobile ? 20 : 22,
                lineHeight: 1.1,
              }}
            >
              Convert EMS to RO
            </div>
            <div
              style={{
                color: '#94a3b8',
                fontSize: 13,
                marginTop: 6,
              }}
            >
              Choose one watched CCC or Mitchell bundle.
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isConverting}
            style={{
              border: '1px solid rgba(148,163,184,0.18)',
              background: 'rgba(15,23,42,0.7)',
              color: '#cbd5e1',
              fontWeight: 800,
              fontSize: 13,
              padding: '9px 12px',
              borderRadius: 12,
              cursor: isConverting ? 'not-allowed' : 'pointer',
              opacity: isConverting ? 0.6 : 1,
            }}
          >
            Close
          </button>
        </div>

        <div
          style={{
            padding: mobile ? 16 : 24,
            display: 'grid',
            gap: 16,
            overflowY: 'auto',
            minHeight: 0,
          }}
        >
          {sources.length ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: mobile
                  ? '1fr'
                  : 'repeat(4, minmax(0, 1fr))',
                gap: 10,
              }}
            >
              {sources.map((source) => (
                <div
                  key={source.id}
                  style={{
                    borderRadius: 14,
                    border: source.available
                      ? '1px solid rgba(148,163,184,0.18)'
                      : '1px solid rgba(248,113,113,0.26)',
                    background: source.available
                      ? 'rgba(15,23,42,0.74)'
                      : 'rgba(127,29,29,0.2)',
                    padding: '11px 12px',
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      color: source.available ? '#f8fafc' : '#fecaca',
                      fontSize: 12,
                      fontWeight: 900,
                    }}
                  >
                    {source.label}
                  </div>
                  <div
                    style={{
                      color: source.available ? '#94a3b8' : '#fecaca',
                      fontSize: 11,
                      fontWeight: 700,
                      marginTop: 5,
                    }}
                  >
                    {source.candidateCount} bundle
                    {source.candidateCount === 1 ? '' : 's'}
                  </div>
                  <div
                    title={source.path}
                    style={{
                      color: '#64748b',
                      fontSize: 10,
                      fontWeight: 700,
                      marginTop: 6,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {source.path}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div
              style={{
                color: '#cbd5e1',
                fontSize: 13,
                fontWeight: 800,
              }}
            >
              {filteredCandidates.length} of {candidates.length} EMS bundle
              {candidates.length === 1 ? '' : 's'}
            </div>
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading || isConverting}
              style={{
                border: '1px solid rgba(148,163,184,0.22)',
                background: 'rgba(15,23,42,0.74)',
                color: '#cbd5e1',
                fontWeight: 800,
                fontSize: 13,
                padding: '9px 12px',
                borderRadius: 12,
                cursor: loading || isConverting ? 'not-allowed' : 'pointer',
                opacity: loading || isConverting ? 0.68 : 1,
              }}
            >
              {loading ? 'Scanning...' : 'Refresh'}
            </button>
          </div>

          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search customer, RO, vehicle, insurance, claim, or EMS file..."
            style={{
              width: '100%',
              boxSizing: 'border-box',
              borderRadius: 14,
              border: '1px solid rgba(148,163,184,0.26)',
              background: 'rgba(15,23,42,0.78)',
              color: '#f8fafc',
              fontSize: 13,
              fontWeight: 700,
              padding: '12px 14px',
              outline: 'none',
            }}
          />

          <div
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            {[
              { key: 'updated' as const, label: 'Updated' },
              { key: 'customer' as const, label: 'Customer' },
              { key: 'ro' as const, label: 'RO' },
              { key: 'vehicle' as const, label: 'Vehicle' },
              { key: 'amount' as const, label: 'Amount' },
              { key: 'source' as const, label: 'Source' },
            ].map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => toggleSort(option.key)}
                style={sortChipStyle(sort.key === option.key)}
              >
                {option.label}
                {sort.key === option.key ? ` ${sort.direction === 'asc' ? '^' : 'v'}` : ''}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            {filteredCandidates.length ? (
              filteredCandidates.map((candidate) => {
                const isCandidateConverting =
                  convertingCandidateId === candidate.id;
                const draft = getCandidateDraft(candidate, candidateDrafts);
                const customerName =
                  draft.customerName.trim() || candidate.customerName?.trim() || 'Customer not parsed';
                const amountLabel =
                  draft.amount.trim() && !Number.isNaN(Number(draft.amount))
                    ? formatCurrency(Number(draft.amount))
                    : 'Amount not parsed';
                const vehicle = candidate.vehicle?.trim();
                const claimDetail = candidate.claimNumber
                  ? `Claim ${candidate.claimNumber}`
                  : '';
                const metaDetails = [
                  candidate.roNumber ? `RO ${candidate.roNumber}` : '',
                  vehicle,
                  candidate.insuranceCompany,
                  claimDetail,
                ].filter(Boolean);

                return (
                  <div
                    key={candidate.id}
                    style={{
                      borderRadius: 16,
                      border: '1px solid rgba(148,163,184,0.18)',
                      background: 'rgba(15,23,42,0.72)',
                      padding: mobile ? 12 : 14,
                      display: 'grid',
                      gridTemplateColumns: mobile ? '1fr' : '1fr auto',
                      gap: 12,
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: mobile ? '1fr' : 'minmax(0, 1fr) auto',
                          gap: 10,
                          alignItems: 'center',
                        }}
                      >
                        <div
                          style={{
                            color: '#f8fafc',
                            fontSize: 16,
                            fontWeight: 900,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {customerName}
                        </div>
                        <div
                          style={{
                            justifySelf: mobile ? 'start' : 'end',
                            borderRadius: 999,
                            border: '1px solid rgba(147,197,253,0.34)',
                            background: 'rgba(37,99,235,0.2)',
                            color: '#dbeafe',
                            fontSize: 13,
                            fontWeight: 900,
                            padding: '6px 10px',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {amountLabel}
                        </div>
                      </div>
                      <div
                        style={{
                          color: '#cbd5e1',
                          fontSize: 12,
                          fontWeight: 800,
                          marginTop: 7,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {candidate.label}
                        {metaDetails.length ? ` - ${metaDetails.join(' - ')}` : ''}
                      </div>
                      <div
                        style={{
                          color: '#94a3b8',
                          fontSize: 12,
                          fontWeight: 700,
                          marginTop: 5,
                        }}
                      >
                        {candidate.location === 'local' ? 'This PC' : 'Office PC'} -{' '}
                        {candidate.source.toUpperCase()} - {candidate.fileCount} file
                        {candidate.fileCount === 1 ? '' : 's'} - updated{' '}
                        {formatDateTime(candidate.lastModifiedAt)}
                      </div>
                      {candidate.previewError ? (
                        <div
                          style={{
                            color: '#fecaca',
                            fontSize: 11,
                            fontWeight: 700,
                            marginTop: 6,
                          }}
                        >
                          Preview unavailable: {candidate.previewError}
                        </div>
                      ) : null}
                      <div
                        title={candidate.primaryFile}
                        style={{
                          color: '#64748b',
                          fontSize: 11,
                          fontWeight: 700,
                          marginTop: 6,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {candidate.primaryFile}
                      </div>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: mobile
                            ? '1fr'
                            : 'minmax(120px, 0.7fr) minmax(160px, 1fr) minmax(110px, 0.6fr)',
                          gap: 8,
                          marginTop: 10,
                        }}
                      >
                        <EditableImportField
                          label="RO #"
                          value={draft.roNumber}
                          onChange={(value) =>
                            onCandidateDraftChange(candidate.id, {
                              ...draft,
                              roNumber: value,
                            })
                          }
                        />
                        <EditableImportField
                          label="Customer"
                          value={draft.customerName}
                          onChange={(value) =>
                            onCandidateDraftChange(candidate.id, {
                              ...draft,
                              customerName: value,
                            })
                          }
                        />
                        <EditableImportField
                          label="Amount"
                          value={draft.amount}
                          onChange={(value) =>
                            onCandidateDraftChange(candidate.id, {
                              ...draft,
                              amount: value,
                            })
                          }
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onConvert(candidate)}
                      disabled={isConverting}
                      style={{
                        border: '1px solid rgba(96,165,250,0.45)',
                        background: isCandidateConverting
                          ? 'rgba(51,65,85,0.92)'
                          : 'linear-gradient(180deg, rgba(37,99,235,0.92), rgba(29,78,216,0.92))',
                        color: '#eff6ff',
                        fontWeight: 900,
                        fontSize: 13,
                        padding: '10px 14px',
                        borderRadius: 12,
                        cursor: isConverting ? 'not-allowed' : 'pointer',
                        opacity: isConverting && !isCandidateConverting ? 0.5 : 1,
                        width: mobile ? '100%' : 'auto',
                      }}
                    >
                      {isCandidateConverting ? 'Converting...' : 'Convert'}
                    </button>
                  </div>
                );
              })
            ) : (
              <div
                style={{
                  borderRadius: 16,
                  border: '1px solid rgba(148,163,184,0.18)',
                  background: 'rgba(15,23,42,0.72)',
                  color: '#cbd5e1',
                  fontSize: 13,
                  fontWeight: 800,
                  padding: 16,
                }}
              >
                {loading
                  ? 'Scanning watched EMS folders...'
                  : search.trim()
                  ? 'No EMS bundles match that search.'
                  : 'No EMS bundles were found in the watched folders.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function getCandidateSortValue(
  candidate: EmsImportCandidate,
  key: EmsCandidateSortKey,
  drafts: Record<string, EmsImportDraft>,
) {
  const draft = getCandidateDraft(candidate, drafts);

  switch (key) {
    case 'customer':
      return draft.customerName || candidate.customerName || '';
    case 'ro':
      return draft.roNumber || candidate.roNumber || candidate.familyId;
    case 'vehicle':
      return candidate.vehicle || '';
    case 'amount': {
      const amount = Number(draft.amount || candidate.amount || 0);
      return Number.isFinite(amount) ? amount : 0;
    }
    case 'source':
      return `${candidate.location} ${candidate.source} ${candidate.fileCount}`;
    case 'updated':
    default:
      return new Date(candidate.lastModifiedAt).getTime() || 0;
  }
}

function compareSortValues(left: string | number, right: string | number) {
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }

  return String(left).localeCompare(String(right), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

function sortChipStyle(active: boolean): CSSProperties {
  return {
    border: active
      ? '1px solid rgba(147,197,253,0.5)'
      : '1px solid rgba(148,163,184,0.22)',
    background: active ? 'rgba(37,99,235,0.36)' : 'rgba(15,23,42,0.74)',
    color: active ? '#dbeafe' : '#cbd5e1',
    fontWeight: 900,
    fontSize: 12,
    padding: '8px 10px',
    borderRadius: 999,
    cursor: 'pointer',
  };
}

function EditableImportField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label style={{ display: 'grid', gap: 5 }}>
      <span style={{ color: '#94a3b8', fontSize: 10, fontWeight: 900 }}>
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          borderRadius: 10,
          border: '1px solid rgba(148,163,184,0.24)',
          background: '#0f172a',
          color: '#f8fafc',
          fontSize: 12,
          fontWeight: 750,
          padding: '8px 9px',
          outline: 'none',
        }}
      />
    </label>
  );
}

function getCandidateDraft(
  candidate: EmsImportCandidate,
  drafts: Record<string, EmsImportDraft>,
): EmsImportDraft {
  return (
    drafts[candidate.id] ?? {
      roNumber: candidate.roNumber ?? candidate.familyId,
      customerName: candidate.customerName ?? '',
      amount:
        typeof candidate.amount === 'number' && Number.isFinite(candidate.amount)
          ? String(candidate.amount)
          : '',
    }
  );
}

function applyEmsImportDraft(
  repairOrder: EmsNormalizedRepairOrder,
  draft: EmsImportDraft,
): EmsNormalizedRepairOrder {
  const amount = draft.amount.trim() ? Number(draft.amount) : NaN;
  const next: EmsNormalizedRepairOrder = {
    ...repairOrder,
    customer: {
      ...(repairOrder.customer ?? {}),
    },
    totals: {
      ...(repairOrder.totals ?? {}),
    },
  };

  if (draft.roNumber.trim()) {
    next.ro_number = draft.roNumber.trim();
  }

  if (draft.customerName.trim()) {
    next.customer = {
      ...(next.customer ?? {}),
      full_name: draft.customerName.trim(),
    };
  }

  if (Number.isFinite(amount) && amount >= 0) {
    next.totals = {
      ...(next.totals ?? {}),
      grand_total: amount,
    };
  }

  return next;
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

function formatDateTime(value: string) {
  if (!value) return 'Unknown';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString([], {
    month: 'numeric',
    day: 'numeric',
    year: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default EmsImportPanel;
