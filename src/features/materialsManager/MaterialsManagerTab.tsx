import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type {
  MaterialsManagerInvoice,
  MaterialsManagerMaterial,
  MaterialsManagerSnapshot,
} from '../../types/app';
import { appBridge } from '../../services/platform/appBridge';

type MaterialsManagerTabProps = {
  compact?: boolean;
  mobile?: boolean;
};

type SortDirection = 'asc' | 'desc';
type InvoiceSortKey = 'invoice' | 'date' | 'items' | 'total' | 'materials';
type MaterialSortKey =
  | 'material'
  | 'part'
  | 'catalog'
  | 'usage'
  | 'averageCost'
  | 'lastInvoice';

type TableSort<TKey extends string> = {
  key: TKey;
  direction: SortDirection;
};

function MaterialsManagerTab({
  compact = false,
  mobile = false,
}: MaterialsManagerTabProps) {
  const [unlocked, setUnlocked] = useState(true);
  const [accessCode, setAccessCode] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isLoadingSnapshot, setIsLoadingSnapshot] = useState(false);
  const [snapshot, setSnapshot] = useState<MaterialsManagerSnapshot | null>(null);
  const [materialsQuery, setMaterialsQuery] = useState('');
  const [invoiceQuery, setInvoiceQuery] = useState('');
  const [invoiceSort, setInvoiceSort] = useState<TableSort<InvoiceSortKey>>({
    key: 'date',
    direction: 'desc',
  });
  const [materialSort, setMaterialSort] = useState<TableSort<MaterialSortKey>>({
    key: 'material',
    direction: 'asc',
  });

  useEffect(() => {
    let mounted = true;

    const loadInitialState = async () => {
      try {
        const access = await appBridge.getMaterialsManagerAccess();
        if (!mounted) {
          return;
        }

        setUnlocked(access.unlocked);

        if (access.unlocked) {
          setIsLoadingSnapshot(true);

          try {
            const nextSnapshot = await appBridge.getMaterialsManagerSnapshot();
            if (mounted) {
              setSnapshot(nextSnapshot);
            }
          } catch (error) {
            if (mounted) {
              setStatusMessage(
                error instanceof Error
                  ? error.message
                  : 'Could not load Materials Manager data.',
              );
            }
          } finally {
            if (mounted) {
              setIsLoadingSnapshot(false);
            }
          }
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

    void loadInitialState();

    return () => {
      mounted = false;
    };
  }, []);

  const refreshSnapshot = async (message?: string) => {
    setIsLoadingSnapshot(true);
    setStatusMessage(null);

    try {
      const nextSnapshot = await appBridge.getMaterialsManagerSnapshot();
      setSnapshot(nextSnapshot);
      if (message) {
        setStatusMessage(message);
      }
    } catch (error) {
      setStatusMessage(
        error instanceof Error
          ? error.message
          : 'Could not refresh Materials Manager data.',
      );
    } finally {
      setIsLoadingSnapshot(false);
    }
  };

  const handleUnlock = async () => {
    setIsBusy(true);
    setStatusMessage(null);

    try {
      const result = await appBridge.unlockMaterialsManager(accessCode);
      setUnlocked(result.settings.materialsManagerUnlocked);
      setStatusMessage(result.message);

      if (result.ok) {
        setAccessCode('');
        await refreshSnapshot('Materials Manager unlocked and connected.');
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

  const filteredInvoices = useMemo(
    () =>
      snapshot
        ? sortInvoices(
            snapshot.recentInvoices.filter((invoice) =>
              matchesInvoice(invoice, invoiceQuery),
            ),
            invoiceSort,
          ).slice(0, compact ? 10 : 16)
        : [],
    [compact, invoiceQuery, invoiceSort, snapshot],
  );

  const filteredMaterials = useMemo(
    () =>
      snapshot
        ? sortMaterials(
            snapshot.materials.filter((material) =>
              matchesMaterial(material, materialsQuery),
            ),
            materialSort,
          ).slice(0, compact ? 18 : 28)
        : [],
    [compact, materialSort, materialsQuery, snapshot],
  );

  const toggleInvoiceSort = (key: InvoiceSortKey) => {
    setInvoiceSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const toggleMaterialSort = (key: MaterialSortKey) => {
    setMaterialSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const topMaterials = snapshot
    ? [...snapshot.materials]
        .sort((left, right) => {
          if (right.usageCount !== left.usageCount) {
            return right.usageCount - left.usageCount;
          }

          return right.totalPurchasedQty - left.totalPurchasedQty;
        })
        .slice(0, compact ? 6 : 8)
    : [];

  const summaryCards = snapshot
    ? [
        {
          label: 'Catalog Items',
          value: formatWholeNumber(snapshot.summary.materialCount),
          note: `${formatCurrency(snapshot.summary.catalogValue)} in listed material value`,
        },
        {
          label: 'Invoices',
          value: formatWholeNumber(snapshot.summary.invoiceCount),
          note: `${formatWholeNumber(snapshot.summary.invoiceItemCount)} invoice lines tracked`,
        },
        {
          label: 'Tracked Spend',
          value: formatCurrency(snapshot.summary.totalInvoiceSpend),
          note: snapshot.summary.latestInvoiceDate
            ? `Latest invoice ${formatDate(snapshot.summary.latestInvoiceDate)}`
            : 'No invoice dates recorded yet',
        },
        {
          label: 'Refunds',
          value: formatWholeNumber(snapshot.summary.refundCount),
          note: snapshot.summary.latestUpdatedAt
            ? `Last sync source update ${formatDateTime(snapshot.summary.latestUpdatedAt)}`
            : 'Waiting for source updates',
        },
      ]
    : [];

  return (
    <section
      style={{
        display: 'grid',
        gap: mobile ? 12 : 16,
      }}
    >
      <div style={shellPanelStyle(mobile, compact)}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: mobile ? '1fr' : 'minmax(0, 1.15fr) minmax(340px, 0.85fr)',
            gap: mobile ? 14 : 20,
          }}
        >
          <div style={featurePanelStyle(mobile)}>
            <div style={eyebrowStyle('#9fc2ff')}>PROJECT WORKSPACE</div>
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
                maxWidth: 760,
              }}
            >
              This add-on now pulls the real materials database into Shop Keeper so office staff
              can work invoices and material records from the same desktop app. The original
              Materials App is still available as a fallback for anything we have not embedded yet.
            </p>

            <div
              style={{
                marginTop: 18,
                display: 'grid',
                gap: 10,
              }}
            >
              {[
                'Review the live materials catalog and recent invoices without leaving Shop Keeper',
                'Keep the embedded materials tools open while we finish the app',
                'Open the original Materials App only when you need the legacy workflow',
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
                  <span style={{ color: '#60a5fa' }}>*</span>
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
                {unlocked ? 'LIVE DESKTOP DATABASE' : 'LOCKED'}
              </div>
              <div
                style={{
                  marginTop: 8,
                  fontSize: 24,
                  fontWeight: 900,
                  color: '#ffffff',
                }}
              >
                {unlocked ? 'Materials Workspace Ready' : 'Upgrade Required'}
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
                  Use your paid add-on access code to unlock the embedded materials workspace on
                  this desktop install.
                </div>

                <input
                  value={accessCode}
                  onChange={(event) => setAccessCode(event.target.value)}
                  placeholder="Enter Materials Manager access code"
                  style={inputStyle}
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
                  {snapshot
                    ? `Connected to ${snapshot.sourceLabel ?? 'Materials Manager'} at ${snapshot.sourcePath}. Refresh any time to pull the latest material and invoice data.`
                    : 'The add-on is unlocked. Load the latest material and invoice data below.'}
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 10,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => void refreshSnapshot('Materials data refreshed.')}
                    disabled={isLoadingSnapshot}
                    style={primaryButtonStyle(isLoadingSnapshot, '#2563eb')}
                  >
                    {isLoadingSnapshot ? 'Refreshing...' : 'Refresh Embedded Data'}
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleLaunch()}
                    disabled={isBusy}
                    style={secondaryButtonStyle(isBusy)}
                  >
                    {isBusy ? 'Opening...' : 'Open Legacy Materials App'}
                  </button>
                </div>
              </>
            )}

            {statusMessage ? (
              <div style={messageBoxStyle}>{statusMessage}</div>
            ) : null}
          </div>
        </div>
      </div>

      {unlocked ? (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: mobile ? '1fr' : compact ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))',
              gap: 12,
            }}
          >
            {summaryCards.map((card) => (
              <article key={card.label} style={summaryCardStyle}>
                <div style={eyebrowStyle('#9fc2ff')}>{card.label}</div>
                <div
                  style={{
                    marginTop: 8,
                    color: '#ffffff',
                    fontSize: compact ? 26 : 30,
                    fontWeight: 900,
                  }}
                >
                  {card.value}
                </div>
                <div
                  style={{
                    marginTop: 8,
                    color: '#d8e3f1',
                    fontSize: 13,
                    lineHeight: 1.5,
                  }}
                >
                  {card.note}
                </div>
              </article>
            ))}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: mobile ? '1fr' : 'minmax(0, 1.2fr) minmax(320px, 0.8fr)',
              gap: 16,
            }}
          >
            <section style={workspaceCardStyle}>
              <div style={cardHeaderRowStyle}>
                <div>
                  <div style={eyebrowStyle('#8fd8ff')}>INVOICES</div>
                  <h3 style={cardTitleStyle}>Recent Invoice Flow</h3>
                </div>
                <input
                  value={invoiceQuery}
                  onChange={(event) => setInvoiceQuery(event.target.value)}
                  placeholder="Search invoice number or item"
                  style={searchInputStyle}
                />
              </div>

              <div style={tableShellStyle}>
                {filteredInvoices.length ? (
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        {[
                          { key: 'invoice' as const, label: 'Invoice' },
                          { key: 'date' as const, label: 'Date' },
                          { key: 'items' as const, label: 'Items' },
                          { key: 'total' as const, label: 'Total' },
                          { key: 'materials' as const, label: 'Materials' },
                        ].map((header) => (
                          <SortableHead
                            key={header.key}
                            active={invoiceSort.key === header.key}
                            direction={invoiceSort.direction}
                            onClick={() => toggleInvoiceSort(header.key)}
                          >
                            {header.label}
                          </SortableHead>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInvoices.map((invoice) => (
                        <tr key={invoice.id}>
                          <td style={tableCellStyle}>
                            <div style={{ color: '#ffffff', fontWeight: 800 }}>
                              {invoice.number || `Invoice ${invoice.id}`}
                            </div>
                            <div style={tableSubtleStyle}>
                              {invoice.isRefund ? 'Refund' : 'Purchase'}
                            </div>
                          </td>
                          <td style={tableCellStyle}>{formatDate(invoice.date)}</td>
                          <td style={tableCellStyle}>
                            <div style={{ fontWeight: 700 }}>{formatWholeNumber(invoice.lineItemCount)}</div>
                            <div style={tableSubtleStyle}>{invoice.sourceDevice || 'Local device'}</div>
                          </td>
                          <td style={tableCellStyle}>
                            <div style={{ fontWeight: 800, color: '#f8fbff' }}>
                              {formatCurrency(invoice.total)}
                            </div>
                            <div style={tableSubtleStyle}>
                              {formatCurrency(invoice.subtotal)} + {formatCurrency(invoice.tax)} tax
                            </div>
                          </td>
                          <td style={tableCellStyle}>
                            <div style={tagWrapStyle}>
                              {(invoice.materialNames.length
                                ? invoice.materialNames
                                : ['No material lines'])
                                .slice(0, 3)
                                .map((name) => (
                                  <span key={`${invoice.id}-${name}`} style={tagStyle}>
                                    {name}
                                  </span>
                                ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <EmptyState message="No invoices match that search yet." />
                )}
              </div>
            </section>

            <section style={workspaceCardStyle}>
              <div style={cardHeaderRowStyle}>
                <div>
                  <div style={eyebrowStyle('#8fd8ff')}>MOST USED</div>
                  <h3 style={cardTitleStyle}>Top Materials</h3>
                </div>
              </div>

              {topMaterials.length ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  {topMaterials.map((material) => (
                    <article key={material.id} style={stackedListItemStyle}>
                      <div style={{ display: 'grid', gap: 4 }}>
                        <div style={{ color: '#ffffff', fontSize: 16, fontWeight: 800 }}>
                          {material.name}
                        </div>
                        <div style={tableSubtleStyle}>
                          {material.partNumber || 'No part number'} | last bought{' '}
                          {formatDate(material.lastInvoiceDate)}
                        </div>
                      </div>
                      <div style={{ display: 'grid', justifyItems: 'end', gap: 4 }}>
                        <div style={{ color: '#9fc2ff', fontWeight: 900 }}>
                          {formatWholeNumber(material.usageCount)} uses
                        </div>
                        <div style={tableSubtleStyle}>
                          Qty {formatDecimal(material.totalPurchasedQty)} | avg{' '}
                          {formatCurrency(material.averageUnitCost)}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyState message="No material activity has been recorded yet." />
              )}
            </section>
          </div>

          <section style={workspaceCardStyle}>
            <div style={cardHeaderRowStyle}>
              <div>
                <div style={eyebrowStyle('#8fd8ff')}>CATALOG</div>
                <h3 style={cardTitleStyle}>Materials Catalog</h3>
              </div>
              <input
                value={materialsQuery}
                onChange={(event) => setMaterialsQuery(event.target.value)}
                placeholder="Search material or part number"
                style={searchInputStyle}
              />
            </div>

            <div style={tableShellStyle}>
              {filteredMaterials.length ? (
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      {[
                        { key: 'material' as const, label: 'Material' },
                        { key: 'part' as const, label: 'Part #' },
                        { key: 'catalog' as const, label: 'Catalog' },
                        { key: 'usage' as const, label: 'Usage' },
                        { key: 'averageCost' as const, label: 'Average Cost' },
                        { key: 'lastInvoice' as const, label: 'Last Invoice' },
                      ].map((header) => (
                        <SortableHead
                          key={header.key}
                          active={materialSort.key === header.key}
                          direction={materialSort.direction}
                          onClick={() => toggleMaterialSort(header.key)}
                        >
                          {header.label}
                        </SortableHead>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMaterials.map((material) => (
                      <tr key={material.id}>
                        <td style={tableCellStyle}>
                          <div style={{ color: '#ffffff', fontWeight: 800 }}>{material.name}</div>
                        </td>
                        <td style={tableCellStyle}>{material.partNumber || '-'}</td>
                        <td style={tableCellStyle}>{formatCurrency(material.netPrice)}</td>
                        <td style={tableCellStyle}>
                          <div style={{ fontWeight: 800 }}>{formatWholeNumber(material.usageCount)}</div>
                          <div style={tableSubtleStyle}>
                            Qty {formatDecimal(material.totalPurchasedQty)}
                          </div>
                        </td>
                        <td style={tableCellStyle}>{formatCurrency(material.averageUnitCost)}</td>
                        <td style={tableCellStyle}>{formatDate(material.lastInvoiceDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <EmptyState message="No materials match that search yet." />
              )}
            </div>
          </section>
        </>
      ) : null}
    </section>
  );
}

function matchesInvoice(invoice: MaterialsManagerInvoice, query: string) {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return true;
  }

  return (
    invoice.number.toLowerCase().includes(trimmed) ||
    invoice.materialNames.some((name) => name.toLowerCase().includes(trimmed))
  );
}

function matchesMaterial(material: MaterialsManagerMaterial, query: string) {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return true;
  }

  return (
    material.name.toLowerCase().includes(trimmed) ||
    material.partNumber.toLowerCase().includes(trimmed)
  );
}

function sortInvoices(
  invoices: MaterialsManagerInvoice[],
  sort: TableSort<InvoiceSortKey>,
) {
  return [...invoices].sort((left, right) => {
    const comparison = compareSortValues(
      getInvoiceSortValue(left, sort.key),
      getInvoiceSortValue(right, sort.key),
    );

    return sort.direction === 'asc' ? comparison : comparison * -1;
  });
}

function getInvoiceSortValue(
  invoice: MaterialsManagerInvoice,
  key: InvoiceSortKey,
) {
  switch (key) {
    case 'invoice':
      return invoice.number || `Invoice ${invoice.id}`;
    case 'date':
      return getDateSortValue(invoice.date);
    case 'items':
      return invoice.lineItemCount;
    case 'total':
      return invoice.total;
    case 'materials':
      return invoice.materialNames.join(' ');
    default:
      return '';
  }
}

function sortMaterials(
  materials: MaterialsManagerMaterial[],
  sort: TableSort<MaterialSortKey>,
) {
  return [...materials].sort((left, right) => {
    const comparison = compareSortValues(
      getMaterialSortValue(left, sort.key),
      getMaterialSortValue(right, sort.key),
    );

    return sort.direction === 'asc' ? comparison : comparison * -1;
  });
}

function getMaterialSortValue(
  material: MaterialsManagerMaterial,
  key: MaterialSortKey,
) {
  switch (key) {
    case 'material':
      return material.name;
    case 'part':
      return material.partNumber;
    case 'catalog':
      return material.netPrice;
    case 'usage':
      return material.usageCount;
    case 'averageCost':
      return material.averageUnitCost;
    case 'lastInvoice':
      return getDateSortValue(material.lastInvoiceDate);
    default:
      return '';
  }
}

function getDateSortValue(value: string) {
  if (!value) {
    return 0;
  }

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
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

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function formatWholeNumber(value: number) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatDecimal(value: number) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function formatDate(value: string) {
  if (!value) {
    return '-';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString();
}

function formatDateTime(value: string) {
  if (!value) {
    return '-';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function EmptyState({ message }: { message: string }) {
  return (
    <div
      style={{
        borderRadius: 16,
        border: '1px dashed rgba(148,163,184,0.28)',
        background: 'rgba(15,23,42,0.5)',
        color: '#d4deed',
        padding: '22px 18px',
        textAlign: 'center',
        fontWeight: 700,
      }}
    >
      {message}
    </div>
  );
}

function SortableHead({
  children,
  active,
  direction,
  onClick,
}: {
  children: ReactNode;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
}) {
  return (
    <th style={tableHeadStyle}>
      <button
        type="button"
        onClick={onClick}
        style={{
          border: 0,
          padding: 0,
          margin: 0,
          background: 'transparent',
          color: active ? '#ffffff' : '#9fc2ff',
          font: 'inherit',
          fontWeight: 900,
          cursor: 'pointer',
          display: 'inline-flex',
          gap: 5,
          alignItems: 'center',
        }}
      >
        <span>{children}</span>
        <span style={{ color: active ? '#93c5fd' : '#64748b' }}>
          {active ? (direction === 'asc' ? '^' : 'v') : '-'}
        </span>
      </button>
    </th>
  );
}

const inputStyle: CSSProperties = {
  borderRadius: 12,
  border: '1px solid rgba(251,191,36,0.3)',
  background: 'rgba(15,23,42,0.78)',
  color: '#f8fbff',
  padding: '12px 14px',
  fontSize: 14,
  fontWeight: 700,
  outline: 'none',
};

const searchInputStyle: CSSProperties = {
  ...inputStyle,
  border: '1px solid rgba(96,165,250,0.22)',
  minWidth: 220,
};

const summaryCardStyle: CSSProperties = {
  borderRadius: 22,
  border: '1px solid rgba(148,163,184,0.2)',
  background: 'linear-gradient(180deg, rgba(54,72,96,0.95), rgba(31,41,59,0.96))',
  padding: 18,
  boxShadow: '0 14px 30px rgba(0,0,0,0.12)',
};

const workspaceCardStyle: CSSProperties = {
  borderRadius: 22,
  border: '1px solid rgba(148,163,184,0.2)',
  background: 'linear-gradient(180deg, rgba(55,72,96,0.95), rgba(35,45,62,0.98))',
  padding: 18,
  display: 'grid',
  gap: 14,
  boxShadow: '0 18px 36px rgba(0,0,0,0.14)',
};

const tableShellStyle: CSSProperties = {
  borderRadius: 18,
  border: '1px solid rgba(148,163,184,0.16)',
  background: 'rgba(15,23,42,0.48)',
  overflow: 'hidden',
};

const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
};

const tableHeadStyle: CSSProperties = {
  color: '#9fc2ff',
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: 0.5,
  textAlign: 'left',
  padding: '14px 14px 12px',
  borderBottom: '1px solid rgba(148,163,184,0.16)',
  background: 'rgba(8,15,28,0.42)',
};

const tableCellStyle: CSSProperties = {
  color: '#dce7f5',
  padding: '14px',
  verticalAlign: 'top',
  borderBottom: '1px solid rgba(148,163,184,0.1)',
  fontSize: 14,
};

const tableSubtleStyle: CSSProperties = {
  color: '#97a8be',
  fontSize: 12,
  lineHeight: 1.4,
};

const cardHeaderRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'space-between',
  gap: 12,
  alignItems: 'center',
};

const cardTitleStyle: CSSProperties = {
  margin: '4px 0 0',
  color: '#ffffff',
  fontSize: 24,
  fontWeight: 900,
};

const tagWrapStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
};

const tagStyle: CSSProperties = {
  borderRadius: 999,
  border: '1px solid rgba(96,165,250,0.24)',
  background: 'rgba(30,64,175,0.22)',
  color: '#dbeafe',
  padding: '4px 10px',
  fontSize: 12,
  fontWeight: 700,
};

const stackedListItemStyle: CSSProperties = {
  borderRadius: 16,
  border: '1px solid rgba(148,163,184,0.16)',
  background: 'rgba(13,21,35,0.46)',
  padding: '14px 16px',
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  gap: 12,
  alignItems: 'center',
};

const messageBoxStyle: CSSProperties = {
  borderRadius: 12,
  border: '1px solid rgba(148,163,184,0.2)',
  background: 'rgba(15,23,42,0.55)',
  color: '#e2ecf9',
  padding: '12px 14px',
  fontSize: 13,
  fontWeight: 700,
};

function shellPanelStyle(mobile: boolean, compact: boolean): CSSProperties {
  return {
    borderRadius: 24,
    border: '2px solid rgba(196,207,223,0.42)',
    background: 'linear-gradient(180deg, rgba(78,94,120,0.97), rgba(43,56,77,0.98))',
    padding: mobile ? 14 : compact ? 16 : 22,
    boxShadow: '0 18px 42px rgba(0,0,0,0.16)',
  };
}

function featurePanelStyle(mobile: boolean): CSSProperties {
  return {
    borderRadius: 20,
    border: '1px solid rgba(148,163,184,0.22)',
    background: 'rgba(8,16,28,0.35)',
    padding: mobile ? 16 : 22,
  };
}

function eyebrowStyle(color: string): CSSProperties {
  return {
    color,
    fontWeight: 900,
    fontSize: 12,
    letterSpacing: 0.7,
  };
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

function secondaryButtonStyle(disabled: boolean): CSSProperties {
  return {
    borderRadius: 14,
    border: '1px solid rgba(148,163,184,0.26)',
    background: disabled ? '#4b5563' : 'rgba(15,23,42,0.6)',
    color: '#f8fbff',
    padding: '13px 16px',
    fontSize: 14,
    fontWeight: 800,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.82 : 1,
  };
}

export default MaterialsManagerTab;
