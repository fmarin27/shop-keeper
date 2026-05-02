import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { app, BrowserWindow, dialog, ipcMain, session } from 'electron';
import type { OpenDialogOptions } from 'electron';
import { autoUpdater } from 'electron-updater';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import {
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { electronDb } from './firebase';
import { SettingsStore } from './store';

const isDev = !!process.env.VITE_DEV_SERVER_URL;
const isPackagedApp = app.isPackaged;
const updaterEnabled = isPackagedApp && !isDev;
const betaAppName = 'Shop Keeper Beta';
const releaseAppName = 'Shop Keeper';
const appDisplayName = isPackagedApp ? releaseAppName : betaAppName;

// This office PC was showing intermittent black Electron windows.
// Disabling GPU acceleration is a reliable fallback for that class of issue.
app.disableHardwareAcceleration();

if (!isPackagedApp) {
  app.setName(betaAppName);
  app.setPath('userData', path.join(app.getPath('appData'), betaAppName));
}

const settingsStore = new SettingsStore();
let mainWindow: BrowserWindow | null = null;
let updateCheckStarted = false;

const MATERIALS_EMAIL_FROM = 'fernandomarin27@gmail.com';
const MATERIALS_EMAIL_APP_PASSWORD = 'cbuewgyckiwbjfxo';
const MATERIALS_EMAIL_TO = 'jay@bronxautopaint.com';
const MATERIALS_EMAIL_CC = 'fernandomarin27@gmail.com, repecueso@hotmail.com';
const MATERIAL_REPLY_CHECK_INTERVAL_MS = 1000 * 60 * 2;
const MATERIAL_REQUEST_TOKEN_PREFIX = 'SK-MAT';
let materialReplyCheckStarted = false;
const MITCHELL_JOBS_CSV_PATH = path.join(
  app.getPath('home'),
  'Mitchell EMS',
  'Mitchell Data',
  'jobs.csv',
);
const EMS_MANAGEMENT_PROJECT_PATH = path.join(
  app.getPath('home'),
  'Projects',
  'Active',
  'EMS Management Platform',
);
const CCC_EMS_ROOT_PATH = path.join(app.getPath('home'), 'CCC EMS');
const MITCHELL_EMS_ROOT_PATH = path.join(app.getPath('home'), 'Mitchell EMS');
const OFFICE_PC_HOST = process.env.SHOP_KEEPER_OFFICE_HOST || '100.69.179.72';
const OFFICE_PC_USER = process.env.SHOP_KEEPER_OFFICE_USER || 'ferna';
const OFFICE_PC_SSH_KEY_PATH =
  process.env.SHOP_KEEPER_OFFICE_SSH_KEY ||
  path.join(app.getPath('home'), '.ssh', 'office_pc_access_v2');
const OFFICE_HOME_PATH = process.env.SHOP_KEEPER_OFFICE_HOME || 'C:\\Users\\ferna';
const OFFICE_CCC_EMS_ROOT_PATH = `${OFFICE_HOME_PATH}\\CCC EMS`;
const OFFICE_MITCHELL_EMS_ROOT_PATH = `${OFFICE_HOME_PATH}\\Mitchell EMS`;
const UAB_ROOT_PATH = path.join(app.getPath('home'), 'UAB');
const ACTIVE_RO_ROOT_PATH = path.join(UAB_ROOT_PATH, "Active RO's");
const CLOSED_RO_ROOT_PATH = path.join(UAB_ROOT_PATH, "Closed RO's");
const MATERIALS_MANAGER_UNLOCK_CODE = 'UAB-MATERIALS-PRO';
const MATERIALS_MANAGER_LOCK_ENABLED = false;
const USER_PYTHON_PATH = path.join(
  app.getPath('home'),
  'AppData',
  'Local',
  'Programs',
  'Python',
  'Python311',
  'python.exe',
);

type MaterialsManagerInstallDefinition = {
  label: string;
  rootPath: string;
  dbRelativePaths: string[];
  entryRelativePath?: string;
  exeRelativePath?: string;
};

type MaterialsManagerInstall = {
  label: string;
  rootPath: string;
  dbPath: string;
  entryPath?: string;
  exePath?: string;
  venvPythonPath: string;
  venvPythonwPath: string;
};

const MATERIALS_MANAGER_INSTALL_DEFINITIONS: MaterialsManagerInstallDefinition[] = [
  {
    label: 'Materials Manager 4.0',
    rootPath: path.join(app.getPath('home'), 'Desktop', 'Materials Manager Version 4.0'),
    dbRelativePaths: [
      'materials_manager.db',
      path.join('dist', 'MaterialsManager', 'materials_manager.db'),
    ],
    entryRelativePath: 'main.py',
    exeRelativePath: path.join('dist', 'MaterialsManager', 'MaterialsManager.exe'),
  },
  {
    label: 'Materials App',
    rootPath: path.join(app.getPath('home'), 'Desktop', 'Materials App'),
    dbRelativePaths: [
      'bodyshop_materials.db',
      path.join('dist', 'BodyShopMaterials', 'bodyshop_materials.db'),
    ],
    entryRelativePath: 'main.py',
    exeRelativePath: path.join('dist', 'BodyShopMaterials', 'BodyShopMaterials.exe'),
  },
  {
    label: 'Legacy Business Apps Materials App',
    rootPath: path.join(app.getPath('home'), 'APPS', 'Business Apps', 'Materials App'),
    dbRelativePaths: ['bodyshop_materials.db'],
    entryRelativePath: 'main.py',
  },
  {
    label: 'UAB Jobs Shop Supplies',
    rootPath: path.join(app.getPath('home'), 'Desktop', 'UAB JOBS', 'Materials', 'shopsupplies'),
    dbRelativePaths: ['bodyshop_materials.db'],
  },
];

type UpdaterStatus =
  | {
      phase: 'idle';
      message?: string;
    }
  | {
      phase: 'checking';
      message: string;
    }
  | {
      phase: 'available';
      version: string;
      message: string;
    }
  | {
      phase: 'downloading';
      version?: string;
      progressPercent: number;
      message: string;
    }
  | {
      phase: 'downloaded';
      version: string;
      message: string;
    }
  | {
      phase: 'installing';
      version?: string;
      message: string;
    }
  | {
      phase: 'not-available';
      version?: string;
      message: string;
    }
  | {
      phase: 'error';
      message: string;
    };

let updaterStatus: UpdaterStatus = {
  phase: 'idle',
};
let updateInstallStarted = false;

function getMainLogPath() {
  try {
    return path.join(app.getPath('userData'), 'main-process.log');
  } catch {
    return path.join(process.cwd(), 'shop-keeper-main.log');
  }
}

function writeMainLog(level: 'INFO' | 'WARN' | 'ERROR', args: unknown[]) {
  try {
    const message = args
      .map((value) => {
        if (value instanceof Error) {
          return value.stack || value.message;
        }

        if (typeof value === 'string') {
          return value;
        }

        try {
          return JSON.stringify(value);
        } catch {
          return String(value);
        }
      })
      .join(' ');

    fs.appendFileSync(
      getMainLogPath(),
      `[${new Date().toISOString()}] [${level}] ${message}\r\n`,
      'utf8',
    );
  } catch {
    // Never let logging crash the main process.
  }
}

type MitchellJobImport = {
  jobUid: string;
  roNumber: string;
  customerName: string;
  phoneNumber: string;
  vehicle: string;
  amount: number;
  promiseDate: string;
  partsWaiting: boolean;
  status: 'notStarted' | 'inProgress' | 'waiting';
  estimatorName: string;
  insuranceCompany: string;
  claimNumber: string;
  departmentName: string;
  leadTechName: string;
  productionStatus: string;
  estimateId: string;
  opportunityNumber: string;
  lastModifiedAt: string;
};

type MitchellJobsSnapshot = {
  sourcePath: string;
  lastModifiedAt: string;
  jobs: MitchellJobImport[];
};

type EmsImportSelectionResult =
  | {
      canceled: true;
    }
  | {
      canceled: false;
      source: string;
      familyId: string;
      selectedPath: string;
      repairOrder: Record<string, unknown>;
    };

type EmsSource = 'ccc' | 'mitchell';
type EmsCandidateLocation = 'local' | 'office';

type EmsImportCandidate = {
  id: string;
  location: EmsCandidateLocation;
  source: EmsSource;
  familyId: string;
  label: string;
  rootPath: string;
  primaryFile: string;
  fileCount: number;
  lastModifiedAt: string;
  roNumber?: string;
  customerName?: string;
  amount?: number;
  vehicle?: string;
  insuranceCompany?: string;
  claimNumber?: string;
  previewError?: string;
};

type EmsWatchedSourceStatus = {
  id: string;
  label: string;
  path: string;
  available: boolean;
  candidateCount: number;
  message?: string;
};

type EmsImportCandidatesSnapshot = {
  generatedAt: string;
  candidates: EmsImportCandidate[];
  sources: EmsWatchedSourceStatus[];
};

type EmsImportCandidateConversionResult = {
  source: string;
  familyId: string;
  selectedPath: string;
  repairOrder: Record<string, unknown>;
};

type OfficeEmsFamilyFiles = {
  files: Array<{
    name: string;
    bytesBase64: string;
    lastModifiedAt: string;
  }>;
};

type SyncOfficeEmsFamilyOptions = {
  overwrite?: boolean;
};

type MaterialsManagerSummary = {
  materialCount: number;
  invoiceCount: number;
  invoiceItemCount: number;
  refundCount: number;
  catalogValue: number;
  totalInvoiceSpend: number;
  latestInvoiceDate: string;
  latestUpdatedAt: string;
};

type MaterialsManagerInvoice = {
  id: number;
  number: string;
  date: string;
  isRefund: boolean;
  sourceDevice: string;
  updatedAt: string;
  lineItemCount: number;
  subtotal: number;
  tax: number;
  total: number;
  materialNames: string[];
};

type MaterialsManagerMaterial = {
  id: number;
  name: string;
  partNumber: string;
  netPrice: number;
  usageCount: number;
  totalPurchasedQty: number;
  averageUnitCost: number;
  lastInvoiceDate: string;
};

type MaterialsManagerSnapshot = {
  sourcePath: string;
  generatedAt: string;
  summary: MaterialsManagerSummary;
  recentInvoices: MaterialsManagerInvoice[];
  materials: MaterialsManagerMaterial[];
};

type RoFolderJobRecord = {
  id: string;
  vehicle: string;
  roNumber: string;
  customerName: string;
  phoneNumber?: string;
  paintCode: string;
  amount: number;
  amountStatus: string;
  status: string;
  done: boolean;
  promiseDate: string;
  partsWaiting: boolean;
  partsRequests: Array<{
    id: string;
    name: string;
    quantity: string;
    kind?: string;
    requestedBy: string;
    status: string;
    note?: string;
    invoiceNumber?: string;
    createdAt: string;
    receivedAt?: string;
    paidAt?: string;
  }>;
  textNotes: Array<{
    id: string;
    type: 'text' | 'audio';
    text?: string;
    audioUrl?: string;
    createdAt: string;
    read: boolean;
  }>;
  photos: Array<{
    id: string;
    url: string;
    createdAt: string;
    fileSize: number;
    width: number;
    height: number;
    timestampIncluded: boolean;
  }>;
  sortOrder?: number;
};

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      const nextChar = line[index + 1];
      if (inQuotes && nextChar === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current);
  return values.map((value) => value.trim());
}

function parseMitchellDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return parsed.toISOString().slice(0, 10);
}

function parseMitchellNumber(value: string) {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseMitchellBoolean(value: string) {
  return value.trim().toLowerCase() === 'true';
}

function buildMitchellVehicle(row: Record<string, string>) {
  return [
    row.VehicleYear?.trim(),
    row.VehicleMake?.trim(),
    row.VehicleModel?.trim(),
  ]
    .filter(Boolean)
    .join(' ');
}

function buildMitchellCustomerName(row: Record<string, string>) {
  return [row.CustomerFirstName?.trim(), row.CustomerLastOrCompanyName?.trim()]
    .filter(Boolean)
    .join(' ');
}

function buildMitchellPhoneNumber(row: Record<string, string>) {
  return (
    row.CustomerCellPhone?.trim() ||
    row.CustomerMobilePhone?.trim() ||
    row.CustomerPhone?.trim() ||
    row.CustomerDayPhone?.trim() ||
    row.CustomerEveningPhone?.trim() ||
    row.CustomerHomePhone?.trim() ||
    ''
  );
}

function getMitchellJobStatus(
  row: Record<string, string>,
): MitchellJobImport['status'] {
  const productionStatus = row.ProductionStatus?.trim().toLowerCase() ?? '';
  const partsStatus = row.PartsStatus?.trim().toLowerCase() ?? '';
  const hasTasks = parseMitchellBoolean(row.HasTasks ?? '');
  const laborCompletedPercent = parseMitchellNumber(row.LaborCompletedPercent ?? '');
  const isPartsOrdered = parseMitchellBoolean(row.IsPartsOrdered ?? '');
  const partsReceivedPercent = parseMitchellNumber(row.PartsReceivedPercent ?? '');

  if (
    productionStatus.includes('wait') ||
    partsStatus.includes('wait') ||
    (isPartsOrdered && partsReceivedPercent < 100)
  ) {
    return 'waiting';
  }

  if (productionStatus.includes('progress') || hasTasks || laborCompletedPercent > 0) {
    return 'inProgress';
  }

  return 'notStarted';
}

function parseMitchellJobsCsv(csvText: string, lastModifiedAt: string): MitchellJobImport[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length <= 1) {
    return [];
  }

  const headers = parseCsvLine(lines[0]);

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row = headers.reduce<Record<string, string>>((result, header, index) => {
      result[header] = values[index] ?? '';
      return result;
    }, {});

    const partsReceivedPercent = parseMitchellNumber(row.PartsReceivedPercent ?? '');
    const isPartsOrdered = parseMitchellBoolean(row.IsPartsOrdered ?? '');

    return {
      jobUid: row.JobUid?.trim() ?? '',
      roNumber: row.RONumber?.trim() ?? '',
      customerName: buildMitchellCustomerName(row),
      phoneNumber: buildMitchellPhoneNumber(row),
      vehicle: buildMitchellVehicle(row),
      amount: parseMitchellNumber(row.TotalAmount ?? ''),
      promiseDate: parseMitchellDate(row.DueOutDate ?? ''),
      partsWaiting: isPartsOrdered && partsReceivedPercent < 100,
      status: getMitchellJobStatus(row),
      estimatorName: row.EstimatorFullName?.trim() ?? '',
      insuranceCompany: row.InsuranceCompanyName?.trim() ?? '',
      claimNumber: row.ClaimNumber?.trim() ?? '',
      departmentName: row.DepartmentName?.trim() ?? '',
      leadTechName: row.LeadTechName?.trim() ?? '',
      productionStatus: row.ProductionStatus?.trim() ?? '',
      estimateId: row.EstimateId?.trim() ?? '',
      opportunityNumber: row.OpportunityNumber?.trim() ?? '',
      lastModifiedAt,
    };
  }).filter((job) => job.roNumber && job.vehicle);
}

function buildMaterialsManagerInstallCandidates() {
  const overrideRootPath = process.env.SHOP_KEEPER_MATERIALS_ROOT?.trim();
  const overrideDbPath = process.env.SHOP_KEEPER_MATERIALS_DB_PATH?.trim();
  const overrideEntryPath = process.env.SHOP_KEEPER_MATERIALS_ENTRY_PATH?.trim();
  const overrideExePath = process.env.SHOP_KEEPER_MATERIALS_EXE_PATH?.trim();

  const definitions = [...MATERIALS_MANAGER_INSTALL_DEFINITIONS];

  if (overrideRootPath || overrideDbPath) {
    const rootPath = overrideRootPath || path.dirname(overrideDbPath || '');
    definitions.unshift({
      label: 'Configured Materials Manager',
      rootPath,
      dbRelativePaths: overrideDbPath ? [overrideDbPath] : ['materials_manager.db', 'bodyshop_materials.db'],
      entryRelativePath: overrideEntryPath || 'main.py',
      exeRelativePath: overrideExePath,
    });
  }

  return definitions.flatMap<MaterialsManagerInstall>((definition) =>
    definition.dbRelativePaths.map((dbRelativePath) => {
      const dbPath = path.isAbsolute(dbRelativePath)
        ? dbRelativePath
        : path.join(definition.rootPath, dbRelativePath);
      const entryPath = definition.entryRelativePath
        ? path.isAbsolute(definition.entryRelativePath)
          ? definition.entryRelativePath
          : path.join(definition.rootPath, definition.entryRelativePath)
        : undefined;
      const exePath = definition.exeRelativePath
        ? path.isAbsolute(definition.exeRelativePath)
          ? definition.exeRelativePath
          : path.join(definition.rootPath, definition.exeRelativePath)
        : undefined;

      return {
        label: definition.label,
        rootPath: definition.rootPath,
        dbPath,
        entryPath,
        exePath,
        venvPythonPath: path.join(definition.rootPath, '.venv', 'Scripts', 'python.exe'),
        venvPythonwPath: path.join(definition.rootPath, '.venv', 'Scripts', 'pythonw.exe'),
      };
    }),
  );
}

function checkedMaterialsManagerPaths() {
  return buildMaterialsManagerInstallCandidates()
    .map((candidate) => candidate.dbPath)
    .filter((candidatePath, index, allPaths) => allPaths.indexOf(candidatePath) === index);
}

function resolveMaterialsManagerInstall() {
  const match = buildMaterialsManagerInstallCandidates().find((candidate) =>
    fs.existsSync(candidate.dbPath),
  );

  if (!match) {
    throw new Error(
      `Materials database not found. Checked: ${checkedMaterialsManagerPaths().join('; ')}`,
    );
  }

  return match;
}

function getMaterialsManagerSnapshotPythonPath(install: MaterialsManagerInstall) {
  if (fs.existsSync(install.venvPythonPath)) {
    return install.venvPythonPath;
  }

  if (fs.existsSync(USER_PYTHON_PATH)) {
    return USER_PYTHON_PATH;
  }

  return 'python';
}

function getMaterialsManagerLaunchPythonPath(install: MaterialsManagerInstall) {
  if (fs.existsSync(install.venvPythonwPath)) {
    return install.venvPythonwPath;
  }

  return getMaterialsManagerSnapshotPythonPath(install);
}

async function launchMaterialsManagerApp() {
  const install = resolveMaterialsManagerInstall();

  if (install.exePath && fs.existsSync(install.exePath)) {
    const child = spawn(install.exePath, [], {
      cwd: path.dirname(install.exePath),
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });

    child.unref();
    return;
  }

  if (install.entryPath && fs.existsSync(install.entryPath)) {
    const pythonPath = getMaterialsManagerLaunchPythonPath(install);
    const child = spawn(pythonPath, [install.entryPath], {
      cwd: install.rootPath,
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });

    child.unref();
    return;
  }

  throw new Error(
    `Materials Manager app was found at ${install.dbPath}, but no launcher was found in ${install.rootPath}.`,
  );
}

async function getMaterialsManagerSnapshot(): Promise<MaterialsManagerSnapshot> {
  const install = resolveMaterialsManagerInstall();
  const pythonPath = getMaterialsManagerSnapshotPythonPath(install);
  const snapshotScript = `
import json
import sqlite3
import sys
from pathlib import Path

db_path = Path(sys.argv[1])
source_label = sys.argv[2]
if not db_path.exists():
    raise FileNotFoundError('Materials database not found at ' + str(db_path))

connection = sqlite3.connect(str(db_path))
connection.row_factory = sqlite3.Row
cursor = connection.cursor()

def table_columns(table_name):
    cursor.execute(f"PRAGMA table_info({table_name})")
    return {row['name'] for row in cursor.fetchall()}

invoice_columns = table_columns('invoices')
source_device_expr = "COALESCE(i.source_device, '')" if 'source_device' in invoice_columns else "''"
updated_at_expr = "COALESCE(i.updated_at, '')" if 'updated_at' in invoice_columns else "''"
summary_updated_expr = "COALESCE(MAX(updated_at), '')" if 'updated_at' in invoice_columns else "COALESCE(MAX(date), '')"

def query_one(sql):
    cursor.execute(sql)
    row = cursor.fetchone()
    return dict(row) if row else {}

def query_all(sql):
    cursor.execute(sql)
    return [dict(row) for row in cursor.fetchall()]

summary = query_one(f"""
SELECT
  (SELECT COUNT(*) FROM materials) AS materialCount,
  (SELECT COUNT(*) FROM invoices) AS invoiceCount,
  (SELECT COUNT(*) FROM invoice_items) AS invoiceItemCount,
  (SELECT COUNT(*) FROM invoices WHERE COALESCE(is_refund, 0) = 1) AS refundCount,
  (SELECT COALESCE(SUM(COALESCE(net_price, 0)), 0) FROM materials) AS catalogValue,
  (
    SELECT COALESCE(
      SUM(
        COALESCE(ii.qty, 0) * COALESCE(ii.unit_cost, 0) +
        CASE
          WHEN COALESCE(ii.taxable, 0) = 1
            THEN COALESCE(ii.qty, 0) * COALESCE(ii.unit_cost, 0) * COALESCE(ii.tax_rate, 0)
          ELSE 0
        END
      ),
      0
    )
    FROM invoice_items ii
  ) AS totalInvoiceSpend,
  (SELECT COALESCE(MAX(date), '') FROM invoices) AS latestInvoiceDate,
  (SELECT {summary_updated_expr} FROM invoices) AS latestUpdatedAt
""")

recent_invoices = query_all(f"""
SELECT
  i.id,
  COALESCE(i.number, '') AS number,
  COALESCE(i.date, '') AS date,
  COALESCE(i.is_refund, 0) AS isRefund,
  {source_device_expr} AS sourceDevice,
  {updated_at_expr} AS updatedAt,
  COUNT(ii.id) AS lineItemCount,
  COALESCE(SUM(COALESCE(ii.qty, 0) * COALESCE(ii.unit_cost, 0)), 0) AS subtotal,
  COALESCE(
    SUM(
      CASE
        WHEN COALESCE(ii.taxable, 0) = 1
          THEN COALESCE(ii.qty, 0) * COALESCE(ii.unit_cost, 0) * COALESCE(ii.tax_rate, 0)
        ELSE 0
      END
    ),
    0
  ) AS tax,
  COALESCE(GROUP_CONCAT(DISTINCT m.name), '') AS materialNames
FROM invoices i
LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
LEFT JOIN materials m ON m.id = ii.material_id
GROUP BY i.id
ORDER BY COALESCE(i.date, '') DESC, i.id DESC
LIMIT 40
""")

materials = query_all("""
SELECT
  m.id,
  COALESCE(m.name, '') AS name,
  COALESCE(m.part_no, '') AS partNumber,
  COALESCE(m.net_price, 0) AS netPrice,
  COUNT(ii.id) AS usageCount,
  COALESCE(SUM(COALESCE(ii.qty, 0)), 0) AS totalPurchasedQty,
  COALESCE(AVG(COALESCE(ii.unit_cost, 0)), 0) AS averageUnitCost,
  COALESCE(MAX(i.date), '') AS lastInvoiceDate
FROM materials m
LEFT JOIN invoice_items ii ON ii.material_id = m.id
LEFT JOIN invoices i ON i.id = ii.invoice_id
GROUP BY m.id
ORDER BY LOWER(COALESCE(m.name, '')) ASC
""")

payload = {
    'sourcePath': str(db_path),
    'sourceLabel': source_label,
    'generatedAt': __import__('datetime').datetime.utcnow().isoformat() + 'Z',
    'summary': {
        'materialCount': int(summary.get('materialCount') or 0),
        'invoiceCount': int(summary.get('invoiceCount') or 0),
        'invoiceItemCount': int(summary.get('invoiceItemCount') or 0),
        'refundCount': int(summary.get('refundCount') or 0),
        'catalogValue': float(summary.get('catalogValue') or 0),
        'totalInvoiceSpend': float(summary.get('totalInvoiceSpend') or 0),
        'latestInvoiceDate': summary.get('latestInvoiceDate') or '',
        'latestUpdatedAt': summary.get('latestUpdatedAt') or '',
    },
    'recentInvoices': [],
    'materials': [],
}

for invoice in recent_invoices:
    subtotal = float(invoice.get('subtotal') or 0)
    tax = float(invoice.get('tax') or 0)
    names = [name.strip() for name in (invoice.get('materialNames') or '').split(',') if name.strip()]
    payload['recentInvoices'].append({
        'id': int(invoice.get('id') or 0),
        'number': invoice.get('number') or '',
        'date': invoice.get('date') or '',
        'isRefund': bool(invoice.get('isRefund') or 0),
        'sourceDevice': invoice.get('sourceDevice') or '',
        'updatedAt': invoice.get('updatedAt') or '',
        'lineItemCount': int(invoice.get('lineItemCount') or 0),
        'subtotal': subtotal,
        'tax': tax,
        'total': subtotal + tax,
        'materialNames': names,
    })

for material in materials:
    payload['materials'].append({
        'id': int(material.get('id') or 0),
        'name': material.get('name') or '',
        'partNumber': material.get('partNumber') or '',
        'netPrice': float(material.get('netPrice') or 0),
        'usageCount': int(material.get('usageCount') or 0),
        'totalPurchasedQty': float(material.get('totalPurchasedQty') or 0),
        'averageUnitCost': float(material.get('averageUnitCost') or 0),
        'lastInvoiceDate': material.get('lastInvoiceDate') or '',
    })

print(json.dumps(payload))
`;

  return new Promise((resolve, reject) => {
    const child = spawn(pythonPath, ['-c', snapshotScript, install.dbPath, install.label], {
      cwd: install.rootPath,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(
          new Error(
            stderr.trim() || `Materials Manager snapshot exited with code ${code ?? 'unknown'}.`,
          ),
        );
        return;
      }

      try {
        const parsed = JSON.parse(stdout.trim()) as MaterialsManagerSnapshot;
        resolve(parsed);
      } catch (error) {
        reject(
          new Error(
            `Could not parse Materials Manager snapshot JSON. ${
              error instanceof Error ? error.message : String(error)
            }`,
          ),
        );
      }
    });
  });
}

function getMitchellJobsSnapshot(): MitchellJobsSnapshot {
  const stats = fs.statSync(MITCHELL_JOBS_CSV_PATH);
  const csvText = fs.readFileSync(MITCHELL_JOBS_CSV_PATH, 'utf8');
  const lastModifiedAt = stats.mtime.toISOString();

  return {
    sourcePath: MITCHELL_JOBS_CSV_PATH,
    lastModifiedAt,
    jobs: parseMitchellJobsCsv(csvText, lastModifiedAt),
  };
}

function getEmsImportDefaultPath() {
  if (fs.existsSync(CCC_EMS_ROOT_PATH)) {
    return CCC_EMS_ROOT_PATH;
  }

  if (fs.existsSync(MITCHELL_EMS_ROOT_PATH)) {
    return MITCHELL_EMS_ROOT_PATH;
  }

  return app.getPath('home');
}

function inferEmsSourceAndFamily(filePath: string) {
  const normalizedFilePath = path.resolve(filePath).toLowerCase();
  const cccRoot = path.resolve(CCC_EMS_ROOT_PATH).toLowerCase() + path.sep;
  const mitchellRoot = path.resolve(MITCHELL_EMS_ROOT_PATH).toLowerCase() + path.sep;
  const parsed = path.parse(filePath);

  if (normalizedFilePath.startsWith(cccRoot)) {
    return {
      source: 'ccc',
      familyId: parsed.name,
    };
  }

  if (normalizedFilePath.startsWith(mitchellRoot)) {
    const match = parsed.name.match(/^(\d+)/);
    return {
      source: 'mitchell',
      familyId: match?.[1] ?? parsed.name,
    };
  }

  throw new Error(
    `Choose an EMS file from ${CCC_EMS_ROOT_PATH} or ${MITCHELL_EMS_ROOT_PATH}.`,
  );
}

const EMS_BUNDLE_EXTENSIONS = new Set([
  'ad1',
  'ad2',
  'dbt',
  'env',
  'lin',
  'pfh',
  'pfl',
  'pfm',
  'pfo',
  'pfp',
  'pft',
  'stl',
  'ttl',
  'veh',
  'ven',
]);

function getFamilyIdForEmsPath(source: EmsSource, filePath: string) {
  const name = path.parse(filePath).name;
  if (source === 'mitchell') {
    return name.match(/^(\d+)/)?.[1] ?? name;
  }

  return name;
}

function scanLocalEmsRoot(
  location: EmsCandidateLocation,
  source: EmsSource,
  label: string,
  rootPath: string,
) {
  const status: EmsWatchedSourceStatus = {
    id: `${location}:${source}`,
    label,
    path: rootPath,
    available: false,
    candidateCount: 0,
  };

  if (!fs.existsSync(rootPath)) {
    return {
      status: {
        ...status,
        message: 'Folder not found.',
      },
      candidates: [] as EmsImportCandidate[],
    };
  }

  const grouped = new Map<
    string,
    {
      fileCount: number;
      lastModifiedAt: string;
      primaryFile: string;
    }
  >();

  for (const entry of fs.readdirSync(rootPath, { withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }

    const filePath = path.join(rootPath, entry.name);
    const extension = path.extname(entry.name).replace('.', '').toLowerCase();
    if (!EMS_BUNDLE_EXTENSIONS.has(extension)) {
      continue;
    }

    const familyId = getFamilyIdForEmsPath(source, filePath);
    const stats = fs.statSync(filePath);
    const lastModifiedAt = stats.mtime.toISOString();
    const current = grouped.get(familyId);

    if (!current) {
      grouped.set(familyId, {
        fileCount: 1,
        lastModifiedAt,
        primaryFile: filePath,
      });
      continue;
    }

    current.fileCount += 1;
    if (lastModifiedAt > current.lastModifiedAt) {
      current.lastModifiedAt = lastModifiedAt;
      current.primaryFile = filePath;
    }
  }

  const candidates = [...grouped.entries()]
    .map(([familyId, details]) => ({
      id: `${location}:${source}:${familyId}`,
      location,
      source,
      familyId,
      label: `${label} ${familyId}`,
      rootPath,
      primaryFile: details.primaryFile,
      fileCount: details.fileCount,
      lastModifiedAt: details.lastModifiedAt,
    }))
    .sort((left, right) => right.lastModifiedAt.localeCompare(left.lastModifiedAt));

  return {
    status: {
      ...status,
      available: true,
      candidateCount: candidates.length,
      message: candidates.length
        ? `${candidates.length} EMS bundle${candidates.length === 1 ? '' : 's'} found.`
        : 'No EMS bundles found.',
    },
    candidates,
  };
}

function getPythonExecutable() {
  if (fs.existsSync(USER_PYTHON_PATH)) {
    return USER_PYTHON_PATH;
  }

  return 'python';
}

function runPythonJson(args: string[]) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const child = spawn(getPythonExecutable(), args, {
      cwd: EMS_MANAGEMENT_PROJECT_PATH,
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `EMS converter exited with code ${code}.`));
        return;
      }

      try {
        resolve(JSON.parse(stdout.trim()) as Record<string, unknown>);
      } catch (error) {
        reject(
          new Error(
            `EMS converter returned invalid JSON: ${
              error instanceof Error ? error.message : String(error)
            }`,
          ),
        );
      }
    });
  });
}

function encodePowerShell(script: string) {
  return Buffer.from(script, 'utf16le').toString('base64');
}

function extractJsonPayload(stdout: string) {
  const trimmed = stdout.trim();
  const firstBrace = trimmed.indexOf('{');
  const firstBracket = trimmed.indexOf('[');
  const starts = [firstBrace, firstBracket].filter((index) => index >= 0);
  if (!starts.length) {
    throw new Error('Office bridge returned no JSON.');
  }

  const start = Math.min(...starts);
  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let index = start; index < trimmed.length; index += 1) {
    const char = trimmed[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      stack.push('}');
      continue;
    }

    if (char === '[') {
      stack.push(']');
      continue;
    }

    if (char === '}' || char === ']') {
      const expected = stack.pop();
      if (expected !== char) {
        throw new Error('Office bridge returned malformed JSON.');
      }

      if (!stack.length) {
        return trimmed.slice(start, index + 1);
      }
    }
  }

  throw new Error('Office bridge returned incomplete JSON.');
}

function runOfficePowerShellJson<T>(script: string) {
  if (!fs.existsSync(OFFICE_PC_SSH_KEY_PATH)) {
    return Promise.reject(
      new Error(`Office bridge SSH key not found at ${OFFICE_PC_SSH_KEY_PATH}.`),
    );
  }

  return new Promise<T>((resolve, reject) => {
    const child = spawn(
      'ssh',
      [
        '-o',
        'BatchMode=yes',
        '-o',
        'ConnectTimeout=5',
        '-i',
        OFFICE_PC_SSH_KEY_PATH,
        `${OFFICE_PC_USER}@${OFFICE_PC_HOST}`,
        'powershell',
        '-NoProfile',
        '-EncodedCommand',
        encodePowerShell(script),
      ],
      {
        windowsHide: true,
      },
    );
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Office bridge exited with code ${code}.`));
        return;
      }

      try {
        resolve(JSON.parse(extractJsonPayload(stdout)) as T);
      } catch (error) {
        reject(
          new Error(
            `Office bridge returned invalid JSON: ${
              error instanceof Error ? error.message : String(error)
            }`,
          ),
        );
      }
    });
  });
}

async function normalizeEmsBundle(source: string, familyId: string) {
  if (!fs.existsSync(EMS_MANAGEMENT_PROJECT_PATH)) {
    throw new Error(`EMS Management Platform project not found at ${EMS_MANAGEMENT_PROJECT_PATH}.`);
  }

  const script = [
    'import json, sys',
    'from pathlib import Path',
    `project = Path(${JSON.stringify(EMS_MANAGEMENT_PROJECT_PATH)})`,
    'sys.path.insert(0, str(project))',
    'from converter.bundle_import import normalize_bundle_family',
    'repair_order = normalize_bundle_family(sys.argv[1], sys.argv[2])',
    'print(json.dumps(repair_order.to_dict()))',
  ].join('\n');

  return runPythonJson(['-c', script, source, familyId]);
}

const emsCandidatePreviewCache = new Map<string, EmsImportCandidate>();

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function previewText(value: unknown) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

function firstPreviewText(...values: unknown[]) {
  for (const value of values) {
    const clean = previewText(value);
    if (clean) return clean;
  }

  return '';
}

function previewNumber(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[$,]/g, '').trim());
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function getEmsRepairOrderPreview(repairOrder: Record<string, unknown>) {
  const customer = recordValue(repairOrder.customer);
  const vehicle = recordValue(repairOrder.vehicle);
  const claim = recordValue(repairOrder.claim);
  const totals = recordValue(repairOrder.totals);
  const customerName = firstPreviewText(
    customer.full_name,
    [customer.first_name, customer.last_name]
      .map(previewText)
      .filter(Boolean)
      .join(' '),
  );
  const vehicleLabel = [vehicle.year, vehicle.make, vehicle.model]
    .map(previewText)
    .filter(Boolean)
    .join(' ');

  return {
    roNumber: firstPreviewText(repairOrder.ro_number, repairOrder.external_estimate_id),
    customerName,
    amount: previewNumber(totals.grand_total),
    vehicle: vehicleLabel,
    insuranceCompany: previewText(claim.insurance_company),
    claimNumber: previewText(claim.claim_number),
  };
}

async function enrichEmsImportCandidatePreview(
  candidate: EmsImportCandidate,
): Promise<EmsImportCandidate> {
  const cacheKey = `${candidate.id}:${candidate.lastModifiedAt}`;
  const cached = emsCandidatePreviewCache.get(cacheKey);
  if (cached) {
    return {
      ...candidate,
      roNumber: cached.roNumber,
      customerName: cached.customerName,
      amount: cached.amount,
      vehicle: cached.vehicle,
      insuranceCompany: cached.insuranceCompany,
      claimNumber: cached.claimNumber,
      previewError: cached.previewError,
    };
  }

  try {
    if (candidate.location === 'office') {
      await syncOfficeEmsFamilyToLocal(
        candidate.source,
        candidate.familyId,
        candidate.primaryFile,
        { overwrite: false },
      );
    }

    const repairOrder = await normalizeEmsBundle(candidate.source, candidate.familyId);
    const enriched = {
      ...candidate,
      ...getEmsRepairOrderPreview(repairOrder as Record<string, unknown>),
    };
    emsCandidatePreviewCache.set(cacheKey, enriched);
    return enriched;
  } catch (error) {
    const enriched = {
      ...candidate,
      previewError:
        error instanceof Error ? error.message : 'Could not preview this EMS bundle.',
    };
    emsCandidatePreviewCache.set(cacheKey, enriched);
    return enriched;
  }
}

function getOfficeEmsScanScript() {
  return `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$extensions = @('ad1','ad2','dbt','env','lin','pfh','pfl','pfm','pfo','pfp','pft','stl','ttl','veh','ven')
$roots = @(
  @{ Location = 'office'; Source = 'ccc'; Label = 'Office CCC EMS'; Root = ${JSON.stringify(OFFICE_CCC_EMS_ROOT_PATH)} },
  @{ Location = 'office'; Source = 'mitchell'; Label = 'Office Mitchell EMS'; Root = ${JSON.stringify(OFFICE_MITCHELL_EMS_ROOT_PATH)} }
)
function Get-FamilyId($source, $file) {
  $name = [System.IO.Path]::GetFileNameWithoutExtension($file)
  if ($source -eq 'mitchell' -and $name -match '^(\\d+)') {
    return $Matches[1]
  }
  return $name
}
$allCandidates = @()
$statuses = @()
foreach ($root in $roots) {
  $status = [ordered]@{
    id = "$($root.Location):$($root.Source)"
    label = $root.Label
    path = $root.Root
    available = $false
    candidateCount = 0
    message = 'Folder not found.'
  }
  if (Test-Path -LiteralPath $root.Root) {
    $groups = @{}
    Get-ChildItem -LiteralPath $root.Root -File -Force | ForEach-Object {
      $extension = $_.Extension.TrimStart('.').ToLowerInvariant()
      if ($extensions -contains $extension) {
        $familyId = Get-FamilyId $root.Source $_.FullName
        if (-not $groups.ContainsKey($familyId)) {
          $groups[$familyId] = [ordered]@{
            fileCount = 0
            lastModifiedAt = ''
            primaryFile = ''
          }
        }
        $group = $groups[$familyId]
        $group.fileCount += 1
        $lastModifiedAt = $_.LastWriteTimeUtc.ToString('o')
        if ($lastModifiedAt -gt $group.lastModifiedAt) {
          $group.lastModifiedAt = $lastModifiedAt
          $group.primaryFile = $_.FullName
        }
      }
    }
    foreach ($familyId in $groups.Keys) {
      $group = $groups[$familyId]
      $allCandidates += [ordered]@{
        id = "$($root.Location):$($root.Source):$familyId"
        location = $root.Location
        source = $root.Source
        familyId = $familyId
        label = "$($root.Label) $familyId"
        rootPath = $root.Root
        primaryFile = $group.primaryFile
        fileCount = $group.fileCount
        lastModifiedAt = $group.lastModifiedAt
      }
    }
    $status.available = $true
    $status.candidateCount = $groups.Count
    $status.message = if ($groups.Count -eq 1) { '1 EMS bundle found.' } else { "$($groups.Count) EMS bundles found." }
  }
  $statuses += $status
}
[ordered]@{
  generatedAt = [DateTime]::UtcNow.ToString('o')
  candidates = @($allCandidates | Sort-Object lastModifiedAt -Descending)
  sources = $statuses
} | ConvertTo-Json -Depth 8 -Compress
`;
}

async function listOfficeEmsCandidates() {
  return runOfficePowerShellJson<EmsImportCandidatesSnapshot>(getOfficeEmsScanScript());
}

async function syncOfficeEmsFamilyToLocal(
  source: EmsSource,
  familyId: string,
  primaryFile: string,
  options: SyncOfficeEmsFamilyOptions = {},
) {
  const officeRoot =
    source === 'ccc' ? OFFICE_CCC_EMS_ROOT_PATH : OFFICE_MITCHELL_EMS_ROOT_PATH;
  const localRoot = source === 'ccc' ? CCC_EMS_ROOT_PATH : MITCHELL_EMS_ROOT_PATH;
  const script = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$extensions = @('ad1','ad2','dbt','env','lin','pfh','pfl','pfm','pfo','pfp','pft','stl','ttl','veh','ven')
$source = ${JSON.stringify(source)}
$familyId = ${JSON.stringify(familyId)}
$root = ${JSON.stringify(officeRoot)}
function Test-FamilyId($source, $file, $familyId) {
  $name = [System.IO.Path]::GetFileNameWithoutExtension($file)
  if ($source -eq 'mitchell') {
    if ($name -match '^(\\d+)') {
      return $Matches[1] -eq $familyId
    }
    return $false
  }
  return $name -ieq $familyId
}
if (-not (Test-Path -LiteralPath $root)) {
  throw "Office EMS folder not found at $root."
}
$files = @()
Get-ChildItem -LiteralPath $root -File -Force | ForEach-Object {
  $extension = $_.Extension.TrimStart('.').ToLowerInvariant()
  if (($extensions -contains $extension) -and (Test-FamilyId $source $_.FullName $familyId)) {
    $files += [ordered]@{
      name = $_.Name
      bytesBase64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($_.FullName))
      lastModifiedAt = $_.LastWriteTimeUtc.ToString('o')
    }
  }
}
if (-not $files.Count) {
  throw "No office EMS files found for $source $familyId."
}
[ordered]@{
  files = @($files)
} | ConvertTo-Json -Depth 5 -Compress
`;

  const payload = await runOfficePowerShellJson<OfficeEmsFamilyFiles>(script);
  fs.mkdirSync(localRoot, { recursive: true });

  let selectedPath = path.join(localRoot, path.basename(primaryFile));
  for (const file of payload.files) {
    const targetPath = path.join(localRoot, path.basename(file.name));
    const lastModifiedAt = new Date(file.lastModifiedAt);
    const canUseRemoteMtime = !Number.isNaN(lastModifiedAt.getTime());

    if (options.overwrite === false && fs.existsSync(targetPath)) {
      const localModifiedAt = fs.statSync(targetPath).mtime;
      if (!canUseRemoteMtime || localModifiedAt.getTime() >= lastModifiedAt.getTime()) {
        continue;
      }
    }

    fs.writeFileSync(targetPath, Buffer.from(file.bytesBase64, 'base64'));

    if (canUseRemoteMtime) {
      fs.utimesSync(targetPath, lastModifiedAt, lastModifiedAt);
    }
  }

  if (!fs.existsSync(selectedPath)) {
    selectedPath = path.join(localRoot, payload.files[0]?.name ?? `${familyId}.ems`);
  }

  return selectedPath;
}

async function listEmsImportCandidates(): Promise<EmsImportCandidatesSnapshot> {
  const localCcc = scanLocalEmsRoot('local', 'ccc', 'This PC CCC EMS', CCC_EMS_ROOT_PATH);
  const localMitchell = scanLocalEmsRoot(
    'local',
    'mitchell',
    'This PC Mitchell EMS',
    MITCHELL_EMS_ROOT_PATH,
  );
  let officeSnapshot: EmsImportCandidatesSnapshot = {
    generatedAt: new Date().toISOString(),
    candidates: [],
    sources: [
      {
        id: 'office:ccc',
        label: 'Office CCC EMS',
        path: OFFICE_CCC_EMS_ROOT_PATH,
        available: false,
        candidateCount: 0,
        message: 'Office bridge not checked yet.',
      },
      {
        id: 'office:mitchell',
        label: 'Office Mitchell EMS',
        path: OFFICE_MITCHELL_EMS_ROOT_PATH,
        available: false,
        candidateCount: 0,
        message: 'Office bridge not checked yet.',
      },
    ],
  };

  try {
    officeSnapshot = await listOfficeEmsCandidates();
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Office bridge could not be reached.';
    officeSnapshot = {
      generatedAt: new Date().toISOString(),
      candidates: [],
      sources: officeSnapshot.sources.map((source) => ({
        ...source,
        message,
      })),
    };
  }

  const discoveredCandidates = [
    ...localCcc.candidates,
    ...localMitchell.candidates,
    ...officeSnapshot.candidates,
  ].sort((left, right) => right.lastModifiedAt.localeCompare(left.lastModifiedAt));
  const candidates: EmsImportCandidate[] = [];

  for (const candidate of discoveredCandidates) {
    candidates.push(await enrichEmsImportCandidatePreview(candidate));
  }

  return {
    generatedAt: new Date().toISOString(),
    candidates,
    sources: [localCcc.status, localMitchell.status, ...officeSnapshot.sources],
  };
}

async function convertEmsImportCandidate(
  candidate: EmsImportCandidate,
): Promise<EmsImportCandidateConversionResult> {
  if (!['ccc', 'mitchell'].includes(candidate.source)) {
    throw new Error(`Unsupported EMS source: ${candidate.source}`);
  }

  const selectedPath =
    candidate.location === 'office'
      ? await syncOfficeEmsFamilyToLocal(
          candidate.source,
          candidate.familyId,
          candidate.primaryFile,
        )
      : candidate.primaryFile;
  const repairOrder = await normalizeEmsBundle(candidate.source, candidate.familyId);

  return {
    source: candidate.source,
    familyId: candidate.familyId,
    selectedPath,
    repairOrder,
  };
}

async function selectEmsRepairOrder(): Promise<EmsImportSelectionResult> {
  const dialogOptions: OpenDialogOptions = {
    title: 'Choose EMS file to convert into an RO',
    defaultPath: getEmsImportDefaultPath(),
    properties: ['openFile'],
    filters: [
      {
        name: 'EMS bundle files',
        extensions: ['ad1', 'ad2', 'veh', 'ven', 'stl', 'ttl', 'lin', 'env', 'pfh', 'pfl', 'pfm', 'pfo', 'pfp', 'pft'],
      },
      {
        name: 'All files',
        extensions: ['*'],
      },
    ],
  };
  const selection = mainWindow
    ? await dialog.showOpenDialog(mainWindow, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions);

  if (selection.canceled || !selection.filePaths[0]) {
    return { canceled: true };
  }

  const selectedPath = selection.filePaths[0];
  const { source, familyId } = inferEmsSourceAndFamily(selectedPath);
  const repairOrder = await normalizeEmsBundle(source, familyId);

  return {
    canceled: false,
    source,
    familyId,
    selectedPath,
    repairOrder,
  };
}

function sanitizeFolderSegment(value: string) {
  return value
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function ensureRoRoots() {
  fs.mkdirSync(ACTIVE_RO_ROOT_PATH, { recursive: true });
  fs.mkdirSync(CLOSED_RO_ROOT_PATH, { recursive: true });
}

function getFolderNameForRo(roNumber: string, customerName: string) {
  return customerName.trim()
    ? `${roNumber.trim()} - ${sanitizeFolderSegment(customerName)}`
    : roNumber.trim();
}

function findRoFolder(
  rootPath: string,
  roNumber: string,
) {
  if (!fs.existsSync(rootPath)) {
    return null;
  }

  const folderPrefix = `${roNumber.trim()} - `;
  const existingFolder = fs
    .readdirSync(rootPath, { withFileTypes: true })
    .find((entry) => entry.isDirectory() && (entry.name === roNumber.trim() || entry.name.startsWith(folderPrefix)));

  return existingFolder ? path.join(rootPath, existingFolder.name) : null;
}

function moveFolderIfNeeded(sourcePath: string, destinationPath: string) {
  if (sourcePath === destinationPath) {
    return destinationPath;
  }

  if (fs.existsSync(destinationPath)) {
    const sourceEntries = fs.readdirSync(sourcePath, { withFileTypes: true });
    sourceEntries.forEach((entry) => {
      const from = path.join(sourcePath, entry.name);
      const to = path.join(destinationPath, entry.name);

      if (fs.existsSync(to)) {
        return;
      }

      fs.renameSync(from, to);
    });

    const remainingEntries = fs.readdirSync(sourcePath);
    if (!remainingEntries.length) {
      fs.rmdirSync(sourcePath);
    }

    return destinationPath;
  }

  fs.renameSync(sourcePath, destinationPath);
  return destinationPath;
}

function resolveRoFolderPath(
  roNumber: string,
  customerName: string,
  done = false,
) {
  const trimmedRo = roNumber.trim();
  if (!trimmedRo) {
    throw new Error('RO number is required.');
  }

  ensureRoRoots();

  const targetRoot = done ? CLOSED_RO_ROOT_PATH : ACTIVE_RO_ROOT_PATH;
  const destinationPath = path.join(targetRoot, getFolderNameForRo(trimmedRo, customerName));

  const existingTarget = findRoFolder(targetRoot, trimmedRo);
  if (existingTarget) {
    return existingTarget;
  }

  const legacyRootFolder = findRoFolder(UAB_ROOT_PATH, trimmedRo);
  if (legacyRootFolder) {
    return moveFolderIfNeeded(legacyRootFolder, destinationPath);
  }

  const alternateRoot = done ? ACTIVE_RO_ROOT_PATH : CLOSED_RO_ROOT_PATH;
  const existingAlternate = findRoFolder(alternateRoot, trimmedRo);
  if (existingAlternate) {
    return moveFolderIfNeeded(existingAlternate, destinationPath);
  }

  fs.mkdirSync(destinationPath, { recursive: true });
  return destinationPath;
}

function saveJobPhotoToRoFolder(payload: {
  roNumber: string;
  customerName: string;
  done?: boolean;
  bytes: number[];
}) {
  const folderPath = resolveRoFolderPath(
    payload.roNumber,
    payload.customerName,
    payload.done ?? false,
  );
  const fileName = `shop-keeper-photo-${new Date()
    .toISOString()
    .replace(/[:.]/g, '-')}.jpg`;
  const savedPath = path.join(folderPath, fileName);

  fs.writeFileSync(savedPath, Buffer.from(payload.bytes));

  return {
    savedPath,
  };
}

function saveJobAudioToRoFolder(payload: {
  roNumber: string;
  customerName: string;
  done?: boolean;
  bytes: number[];
  extension: string;
}) {
  const folderPath = resolveRoFolderPath(
    payload.roNumber,
    payload.customerName,
    payload.done ?? false,
  );
  const audioFolderPath = path.join(folderPath, 'Audio Notes');
  fs.mkdirSync(audioFolderPath, { recursive: true });

  const safeExtension = sanitizeFolderSegment(payload.extension).replace(/\./g, '') || 'webm';
  const fileName = `audio-note-${new Date().toISOString().replace(/[:.]/g, '-')}.${safeExtension}`;
  const savedPath = path.join(audioFolderPath, fileName);

  fs.writeFileSync(savedPath, Buffer.from(payload.bytes));

  return {
    savedPath,
  };
}

function saveJobTextNoteToRoFolder(payload: {
  roNumber: string;
  customerName: string;
  done?: boolean;
  text: string;
  createdAt?: string;
}) {
  const folderPath = resolveRoFolderPath(
    payload.roNumber,
    payload.customerName,
    payload.done ?? false,
  );
  const notesFolderPath = path.join(folderPath, 'Notes');
  fs.mkdirSync(notesFolderPath, { recursive: true });

  const timestamp = payload.createdAt
    ? new Date(payload.createdAt).toISOString()
    : new Date().toISOString();
  const fileName = `note-${timestamp.replace(/[:.]/g, '-')}.txt`;
  const savedPath = path.join(notesFolderPath, fileName);

  fs.writeFileSync(savedPath, payload.text, 'utf8');

  return {
    savedPath,
  };
}

function moveRoFolderForJob(payload: {
  roNumber: string;
  customerName: string;
  done: boolean;
}) {
  const folderPath = resolveRoFolderPath(
    payload.roNumber,
    payload.customerName,
    payload.done,
  );

  return {
    folderPath,
  };
}

function ensureRoFolderForJob(payload: {
  roNumber: string;
  customerName: string;
  done?: boolean;
}) {
  const folderPath = resolveRoFolderPath(
    payload.roNumber,
    payload.customerName,
    payload.done ?? false,
  );

  return {
    folderPath,
  };
}

function buildJobNotesText(job: RoFolderJobRecord) {
  const lines: string[] = [
    `RO: ${job.roNumber}`,
    `Customer: ${job.customerName}`,
    `Phone: ${job.phoneNumber || 'Not set'}`,
    `Vehicle: ${job.vehicle}`,
    `Status: ${job.done ? 'Closed' : 'Active'} / ${job.status}`,
    `Promise Date: ${job.promiseDate || 'Not set'}`,
    `Amount: ${job.amount}`,
    '',
    'Notes',
    '-----',
  ];

  if (!job.textNotes.length) {
    lines.push('No notes yet.');
  } else {
    job.textNotes.forEach((note, index) => {
      lines.push(`[${index + 1}] ${new Date(note.createdAt).toLocaleString()}`);
      lines.push(`Type: ${note.type}`);
      lines.push(`Read: ${note.read ? 'Yes' : 'No'}`);
      lines.push(note.type === 'text' ? `Text: ${note.text ?? ''}` : `Audio URL: ${note.audioUrl ?? ''}`);
      lines.push('');
    });
  }

  lines.push('Parts');
  lines.push('-----');

  if (!job.partsRequests.length) {
    lines.push('No parts requests.');
  } else {
    job.partsRequests.forEach((part, index) => {
      lines.push(`[${index + 1}] ${part.name} x${part.quantity} | ${part.kind ?? 'part'} | ${part.status} | ${part.requestedBy}`);
      if (part.invoiceNumber?.trim()) {
        lines.push(`Invoice: ${part.invoiceNumber.trim()}`);
      }
      if (part.note?.trim()) {
        lines.push(`Note: ${part.note.trim()}`);
      }
      lines.push(`Created: ${new Date(part.createdAt).toLocaleString()}`);
      if (part.receivedAt) {
        lines.push(`Received: ${new Date(part.receivedAt).toLocaleString()}`);
      }
      if (part.paidAt) {
        lines.push(`Paid: ${new Date(part.paidAt).toLocaleString()}`);
      }
      lines.push('');
    });
  }

  lines.push('Photos');
  lines.push('------');

  if (!job.photos.length) {
    lines.push('No photos yet.');
  } else {
    job.photos.forEach((photo, index) => {
      lines.push(`[${index + 1}] ${new Date(photo.createdAt).toLocaleString()} | ${photo.width}x${photo.height} | ${photo.fileSize} bytes`);
      lines.push(`URL: ${photo.url}`);
      lines.push('');
    });
  }

  return lines.join('\r\n');
}

function saveJobRecordToRoFolder(payload: { job: RoFolderJobRecord }) {
  const { job } = payload;
  const folderPath = resolveRoFolderPath(job.roNumber, job.customerName, job.done);
  const summaryPath = path.join(folderPath, 'shop-keeper-summary.txt');

  fs.writeFileSync(summaryPath, buildJobNotesText(job), 'utf8');

  return {
    folderPath,
    summaryPath,
  };
}

function installSafeConsole() {
  const isBrokenPipeError = (error: unknown) =>
    !!(
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'EPIPE'
    );

  console.log = (...args: unknown[]) => writeMainLog('INFO', args);
  console.info = (...args: unknown[]) => writeMainLog('INFO', args);
  console.warn = (...args: unknown[]) => writeMainLog('WARN', args);
  console.error = (...args: unknown[]) => writeMainLog('ERROR', args);

  process.on('uncaughtException', (error) => {
    if (isBrokenPipeError(error)) {
      return;
    }

    console.error('[main] Uncaught exception:', error);
  });

  process.on('unhandledRejection', (reason) => {
    if (isBrokenPipeError(reason)) {
      return;
    }

    console.error('[main] Unhandled rejection:', reason);
  });
}

installSafeConsole();

function publishUpdaterStatus(nextStatus: UpdaterStatus) {
  updaterStatus = nextStatus;
  mainWindow?.webContents.send('updater:status', updaterStatus);
}

function installDownloadedUpdate() {
  if (updateInstallStarted) {
    return {
      ok: false,
      message: 'Update install is already starting.',
    };
  }

  if (updaterStatus.phase !== 'downloaded') {
    return {
      ok: false,
      message: 'No downloaded update is ready to install.',
    };
  }

  updateInstallStarted = true;
  publishUpdaterStatus({
    phase: 'installing',
    version: updaterStatus.version,
    message: `Installing update ${updaterStatus.version}...`,
  });

  setImmediate(() => {
    autoUpdater.quitAndInstall(true, true);
  });

  return {
    ok: true,
    message: `Installing update ${updaterStatus.version}...`,
  };
}

async function sendMaterialRequestEmail(payload: {
  materialId: string;
  itemName: string;
  quantity: string;
  note?: string;
  requestedBy: 'manager' | 'tech';
}) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: MATERIALS_EMAIL_FROM,
      pass: MATERIALS_EMAIL_APP_PASSWORD,
    },
  });

  const requestedAt = new Intl.DateTimeFormat('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date());

  const subject = `[${MATERIAL_REQUEST_TOKEN_PREFIX}:${payload.materialId}] Shop Keeper Material Request - ${payload.itemName}`;
  const lines = [
    'New material request from Shop Keeper.',
    '',
    `Requested by: ${payload.requestedBy === 'tech' ? 'Tech' : 'Manager'}`,
    `Material: ${payload.itemName}`,
    `Quantity: ${payload.quantity}`,
    `Requested at: ${requestedAt}`,
  ];

  if (payload.note?.trim()) {
    lines.push(`Note: ${payload.note.trim()}`);
  }

  await transporter.sendMail({
    from: MATERIALS_EMAIL_FROM,
    to: MATERIALS_EMAIL_TO,
    cc: MATERIALS_EMAIL_CC,
    subject,
    text: lines.join('\n'),
  });
}

function extractMaterialRequestId(subject: string) {
  const match = subject.match(/\[SK-MAT:([A-Za-z0-9_-]+)\]/i);
  return match?.[1] ?? null;
}

async function markMaterialEmailConfirmed(materialId: string, replyText: string) {
  const materialRef = doc(electronDb, 'materials', materialId);
  const snapshot = await getDoc(materialRef);

  if (!snapshot.exists()) {
    return;
  }

  const data = snapshot.data() as Record<string, unknown>;

  if (data.emailStatus === 'confirmed') {
    return;
  }

  await updateDoc(materialRef, {
    emailStatus: 'confirmed',
    emailConfirmedAt: serverTimestamp(),
    emailReplyText: replyText.slice(0, 1000),
    unread: true,
    unreadByManager: true,
    unreadByTech: true,
    updatedAt: serverTimestamp(),
  });
}

async function checkMaterialReplyConfirmations() {
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
      user: MATERIALS_EMAIL_FROM,
      pass: MATERIALS_EMAIL_APP_PASSWORD,
    },
  });

  try {
    await client.connect();
    await client.mailboxOpen('INBOX');

    for await (const message of client.fetch({ seen: false }, { uid: true, envelope: true, source: true })) {
      const subject = message.envelope?.subject ?? '';
      const materialId = extractMaterialRequestId(subject);

      if (!materialId || !message.source) {
        continue;
      }

      const parsed = await simpleParser(message.source);
      const replyText = `${parsed.subject ?? ''}\n${parsed.text ?? ''}`.trim();

      if (!replyText) {
        continue;
      }

      await markMaterialEmailConfirmed(materialId, replyText);

      if (message.uid) {
        await client.messageFlagsAdd(message.uid, ['\\Seen']);
      }
    }
  } catch (error) {
    writeMainLog('ERROR', ['[mail] Failed to check material reply confirmations:', error]);
  } finally {
    await client.logout().catch(() => undefined);
  }
}

function startMaterialReplyConfirmationWatcher() {
  if (materialReplyCheckStarted || isDev) {
    return;
  }

  materialReplyCheckStarted = true;
  void checkMaterialReplyConfirmations();
  setInterval(() => {
    void checkMaterialReplyConfirmations();
  }, MATERIAL_REPLY_CHECK_INTERVAL_MS);
}

function getHtmlPath() {
  return path.join(app.getAppPath(), 'dist', 'index.html');
}

function getWindowOptions(): Electron.BrowserWindowConstructorOptions {
  const settings = settingsStore.getSettings();
  const isCompact = settings.displayMode === 'compact';
  const isOverlay = settings.displayMode === 'overlay';

  return {
    width: isOverlay ? settings.overlayWidth : isCompact ? 900 : 1400,
    height: isOverlay ? settings.overlayHeight : isCompact ? 560 : 900,
    x: isOverlay && settings.overlayX !== null ? settings.overlayX : undefined,
    y: isOverlay && settings.overlayY !== null ? settings.overlayY : undefined,
    minWidth: 700,
    minHeight: 500,
    autoHideMenuBar: true,
    title: appDisplayName,
    alwaysOnTop: isOverlay,
    frame: true,
    transparent: false,
    backgroundColor: '#020617',
    hasShadow: true,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  };
}

function applyDisplayMode(window: BrowserWindow) {
  const settings = settingsStore.getSettings();
  const isCompact = settings.displayMode === 'compact';
  const isOverlay = settings.displayMode === 'overlay';

  if (isOverlay) {
    window.setAlwaysOnTop(true, 'screen-saver');
    window.setResizable(true);
    window.setMinimumSize(360, 220);
    window.setSize(settings.overlayWidth, settings.overlayHeight);
    window.setOpacity(0.88);

    if (settings.overlayX !== null && settings.overlayY !== null) {
      window.setPosition(settings.overlayX, settings.overlayY);
    }
  } else if (isCompact) {
    window.setAlwaysOnTop(false);
    window.setResizable(true);
    window.setMinimumSize(700, 500);
    window.setSize(900, 560);
    window.setOpacity(1);
    window.center();
  } else {
    window.setAlwaysOnTop(false);
    window.setResizable(true);
    window.setMinimumSize(900, 600);
    window.setSize(1400, 900);
    window.setOpacity(1);
    window.center();
  }

  window.show();
  window.focus();
}

function setupAutoUpdates() {
  if (!updaterEnabled || updateCheckStarted) {
    return;
  }

  updateCheckStarted = true;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.disableWebInstaller = true;
  autoUpdater.disableDifferentialDownload = true;

  autoUpdater.on('checking-for-update', () => {
    console.log('[updater] Checking for update...');
    publishUpdaterStatus({
      phase: 'checking',
      message: 'Checking for updates...',
    });
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[updater] Update available:', info.version);
    publishUpdaterStatus({
      phase: 'available',
      version: info.version,
      message: `Update ${info.version} found. Downloading now...`,
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('[updater] No update available. Current/latest:', info.version);
    publishUpdaterStatus({
      phase: 'not-available',
      version: info.version,
      message: 'This app is up to date.',
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    console.log(
      `[updater] Downloading ${Math.round(progress.percent)}% (${progress.transferred}/${progress.total})`,
    );
    publishUpdaterStatus({
      phase: 'downloading',
      progressPercent: Math.round(progress.percent),
      message: `Downloading update... ${Math.round(progress.percent)}%`,
    });
  });

  autoUpdater.on('update-downloaded', async (info) => {
    console.log('[updater] Update downloaded:', info.version);
    publishUpdaterStatus({
      phase: 'downloaded',
      version: info.version,
      message: `Update ${info.version} is ready. Restart to install.`,
    });

    const targetWindow = mainWindow ?? BrowserWindow.getFocusedWindow();

    const result = targetWindow
      ? await dialog.showMessageBox(targetWindow, {
          type: 'info',
          buttons: ['Restart now', 'Later'],
          defaultId: 0,
          cancelId: 1,
          title: 'Update ready',
          message: `A new version of ${releaseAppName} has been downloaded.`,
          detail: 'Restart the app to install the update.',
          noLink: true,
        })
      : await dialog.showMessageBox({
          type: 'info',
          buttons: ['Restart now', 'Later'],
          defaultId: 0,
          cancelId: 1,
          title: 'Update ready',
          message: `A new version of ${releaseAppName} has been downloaded.`,
          detail: 'Restart the app to install the update.',
          noLink: true,
        });

    if (result.response === 0) {
      installDownloadedUpdate();
    }
  });

  autoUpdater.on('error', (error) => {
    console.error('[updater] Auto update error:', error);
    publishUpdaterStatus({
      phase: 'error',
      message: error instanceof Error ? error.message : 'Update failed.',
    });
  });

  void autoUpdater.checkForUpdatesAndNotify();

  setInterval(() => {
    void autoUpdater.checkForUpdatesAndNotify();
  }, 1000 * 60 * 60 * 4);
}

async function createWindow() {
  mainWindow = new BrowserWindow(getWindowOptions());

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    await mainWindow.loadFile(getHtmlPath());
  }

  applyDisplayMode(mainWindow);
  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow?.webContents.send('updater:status', updaterStatus);
  });

  mainWindow.on('resize', () => {
    const settings = settingsStore.getSettings();
    if (settings.displayMode !== 'overlay' || !mainWindow) return;

    const [width, height] = mainWindow.getSize();
    const [x, y] = mainWindow.getPosition();
    settingsStore.setOverlayBounds({ width, height, x, y });
  });

  mainWindow.on('move', () => {
    const settings = settingsStore.getSettings();
    if (settings.displayMode !== 'overlay' || !mainWindow) return;

    const [width, height] = mainWindow.getSize();
    const [x, y] = mainWindow.getPosition();
    settingsStore.setOverlayBounds({ width, height, x, y });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  app.setAppUserModelId(
    isPackagedApp ? 'com.shopkeeper.app' : 'com.shopkeeper.beta',
  );

  session.defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      if (permission === 'media') {
        callback(true);
        return;
      }

      callback(false);
    },
  );

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    if (permission === 'media') {
      return true;
    }

    return false;
  });

  ipcMain.handle('settings:get', () => settingsStore.getSettings());

  ipcMain.handle('settings:setAppMode', (_event, mode: 'manager' | 'tech') =>
    settingsStore.setAppMode(mode),
  );

  ipcMain.handle(
    'settings:setDisplayMode',
    (_event, mode: 'normal' | 'compact' | 'overlay') => {
      const nextSettings = settingsStore.setDisplayMode(mode);

      if (mainWindow) {
        applyDisplayMode(mainWindow);
      }

      return nextSettings;
    },
  );

  ipcMain.handle(
    'settings:setOverlayBounds',
    (
      _event,
      bounds: {
        width: number;
        height: number;
        x: number | null;
        y: number | null;
      },
    ) => settingsStore.setOverlayBounds(bounds),
  );

  ipcMain.handle('settings:getMaterialsManagerAccess', () => ({
    unlocked:
      !MATERIALS_MANAGER_LOCK_ENABLED ||
      settingsStore.getSettings().materialsManagerUnlocked,
  }));

  ipcMain.handle('settings:unlockMaterialsManager', (_event, accessCode: string) => {
    const unlocked =
      !MATERIALS_MANAGER_LOCK_ENABLED ||
      accessCode.trim() === MATERIALS_MANAGER_UNLOCK_CODE;
    const nextSettings = settingsStore.setMaterialsManagerUnlocked(unlocked);

    return {
      ok: unlocked,
      message: unlocked
        ? 'Materials Manager is unlocked while the project is in progress.'
        : 'That access code did not work.',
      settings: nextSettings,
    };
  });

  ipcMain.handle('window:switchToNormal', () => {
    const nextSettings = settingsStore.setDisplayMode('normal');

    if (mainWindow) {
      applyDisplayMode(mainWindow);
    }

    return nextSettings;
  });

  ipcMain.handle('updater:checkNow', async () => {
    if (!updaterEnabled) {
      return {
        ok: false,
        message: 'Updater is only enabled in the installed app.',
      };
    }

    try {
      publishUpdaterStatus({
        phase: 'checking',
        message: 'Checking for updates...',
      });
      const result = await autoUpdater.checkForUpdates();
      return {
        ok: true,
        updateInfo: result?.updateInfo ?? null,
        status: updaterStatus,
      };
    } catch (error) {
      console.error('[updater] Manual check failed:', error);
      const message =
        error instanceof Error ? error.message : 'Update check failed.';
      publishUpdaterStatus({
        phase: 'error',
        message,
      });
      return {
        ok: false,
        message,
      };
    }
  });

  ipcMain.handle('updater:getStatus', () => updaterStatus);

  ipcMain.handle('updater:installNow', () => {
    return installDownloadedUpdate();
  });

  ipcMain.handle(
    'mail:sendMaterialRequestEmail',
    async (
      _event,
      payload: {
        materialId: string;
        itemName: string;
        quantity: string;
        note?: string;
        requestedBy: 'manager' | 'tech';
      },
    ) => {
      try {
        await sendMaterialRequestEmail(payload);
        return {
          ok: true,
          message: `Email sent to ${MATERIALS_EMAIL_TO}.`,
        };
      } catch (error) {
        console.error('[mail] Failed to send material request email:', error);
        return {
          ok: false,
          message:
            error instanceof Error
              ? error.message
              : 'Could not send material request email.',
        };
      }
    },
  );

  ipcMain.handle('mitchell:getJobsSnapshot', async () => {
    try {
      return getMitchellJobsSnapshot();
    } catch (error) {
      console.error('[mitchell] Failed to load jobs snapshot:', error);
      throw new Error(
        error instanceof Error
          ? error.message
          : 'Could not read Mitchell jobs data.',
      );
    }
  });

  ipcMain.handle('ems:selectRepairOrder', async () => {
    try {
      return await selectEmsRepairOrder();
    } catch (error) {
      console.error('[ems] Failed to convert selected EMS file:', error);
      throw new Error(
        error instanceof Error
          ? error.message
          : 'Could not convert the selected EMS file.',
      );
    }
  });

  ipcMain.handle('ems:listImportCandidates', async () => {
    try {
      return await listEmsImportCandidates();
    } catch (error) {
      console.error('[ems] Failed to list EMS import candidates:', error);
      throw new Error(
        error instanceof Error
          ? error.message
          : 'Could not list EMS import candidates.',
      );
    }
  });

  ipcMain.handle(
    'ems:convertImportCandidate',
    async (_event, candidate: EmsImportCandidate) => {
      try {
        return await convertEmsImportCandidate(candidate);
      } catch (error) {
        console.error('[ems] Failed to convert EMS import candidate:', error);
        throw new Error(
          error instanceof Error
            ? error.message
            : 'Could not convert the selected EMS candidate.',
        );
      }
    },
  );

  ipcMain.handle(
    'jobs:savePhotoToRoFolder',
    async (
      _event,
      payload: {
        roNumber: string;
        customerName: string;
        done?: boolean;
        bytes: number[];
      },
    ) => {
      try {
        return saveJobPhotoToRoFolder(payload);
      } catch (error) {
        console.error('[jobs] Failed to save photo to RO folder:', error);
        throw new Error(
          error instanceof Error
            ? error.message
            : 'Could not save photo to the RO folder.',
        );
      }
    },
  );

  ipcMain.handle(
    'jobs:saveAudioToRoFolder',
    async (
      _event,
      payload: {
        roNumber: string;
        customerName: string;
        done?: boolean;
        bytes: number[];
        extension: string;
      },
    ) => {
      try {
        return saveJobAudioToRoFolder(payload);
      } catch (error) {
        console.error('[jobs] Failed to save audio to RO folder:', error);
        throw new Error(
          error instanceof Error
            ? error.message
            : 'Could not save audio to the RO folder.',
        );
      }
    },
  );

  ipcMain.handle(
    'jobs:saveTextNoteToRoFolder',
    async (
      _event,
      payload: {
        roNumber: string;
        customerName: string;
        done?: boolean;
        text: string;
        createdAt?: string;
      },
    ) => {
      try {
        return saveJobTextNoteToRoFolder(payload);
      } catch (error) {
        console.error('[jobs] Failed to save text note to RO folder:', error);
        throw new Error(
          error instanceof Error
            ? error.message
            : 'Could not save text note to the RO folder.',
        );
      }
    },
  );

  ipcMain.handle(
    'jobs:moveRoFolderForJob',
    async (
      _event,
      payload: {
        roNumber: string;
        customerName: string;
        done: boolean;
      },
    ) => {
      try {
        return moveRoFolderForJob(payload);
      } catch (error) {
        console.error('[jobs] Failed to move RO folder:', error);
        throw new Error(
          error instanceof Error
            ? error.message
            : 'Could not move the RO folder.',
        );
      }
    },
  );

  ipcMain.handle(
    'jobs:ensureRoFolderForJob',
    async (
      _event,
      payload: {
        roNumber: string;
        customerName: string;
        done?: boolean;
      },
    ) => {
      try {
        return ensureRoFolderForJob(payload);
      } catch (error) {
        console.error('[jobs] Failed to ensure RO folder:', error);
        throw new Error(
          error instanceof Error
            ? error.message
            : 'Could not ensure the RO folder.',
        );
      }
    },
  );

  ipcMain.handle(
    'jobs:saveJobRecordToRoFolder',
    async (
      _event,
      payload: {
        job: RoFolderJobRecord;
      },
    ) => {
      try {
        return saveJobRecordToRoFolder(payload);
      } catch (error) {
        console.error('[jobs] Failed to save job record to RO folder:', error);
        throw new Error(
          error instanceof Error
            ? error.message
            : 'Could not save the job record to the RO folder.',
        );
      }
    },
  );

  ipcMain.handle('app:getInfo', () => ({
    name: appDisplayName,
    version: app.getVersion(),
    owner: 'Fernando Marin',
  }));

  ipcMain.handle('materialsManager:getSnapshot', async () => {
    const settings = settingsStore.getSettings();
    if (MATERIALS_MANAGER_LOCK_ENABLED && !settings.materialsManagerUnlocked) {
      throw new Error('Materials Manager is locked until the add-on is unlocked.');
    }

    try {
      return await getMaterialsManagerSnapshot();
    } catch (error) {
      console.error('[materials-manager] Failed to load embedded snapshot:', error);
      throw new Error(
        error instanceof Error
          ? error.message
          : 'Could not load the embedded Materials Manager data.',
      );
    }
  });

  ipcMain.handle('materialsManager:launch', async () => {
    const settings = settingsStore.getSettings();
    if (MATERIALS_MANAGER_LOCK_ENABLED && !settings.materialsManagerUnlocked) {
      return {
        ok: false,
        message: 'Materials Manager is locked until the add-on is unlocked.',
      };
    }

    try {
      await launchMaterialsManagerApp();
      return {
        ok: true,
        message: 'Materials Manager launched.',
      };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : 'Could not launch Materials Manager.',
      };
    }
  });

  await createWindow();
  setupAutoUpdates();
  startMaterialReplyConfirmationWatcher();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
      setupAutoUpdates();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
