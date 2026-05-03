import fs from 'node:fs';
import path from 'node:path';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  setLogLevel,
} from 'firebase/firestore';
import { electronDb } from './firebase';

type JobNote = {
  id: string;
  type: 'text' | 'audio';
  text?: string;
  audioUrl?: string;
  createdAt: string;
  read: boolean;
};

type JobPartRequest = {
  id: string;
  name: string;
  quantity: string;
  kind?: string;
  source?: string;
  estimateLineId?: string;
  estimateLineNumber?: string;
  partNumber?: string;
  estimateAmount?: number;
  requestedBy: string;
  status: string;
  note?: string;
  requestPhoto?: JobPhoto;
  invoiceNumber?: string;
  invoiceVendor?: string;
  invoiceListPrice?: number;
  invoiceNetPrice?: number;
  invoicePhoto?: JobPhoto;
  createdAt: string;
  receivedAt?: string;
  paidAt?: string;
};

type JobPhoto = {
  id: string;
  url: string;
  createdAt: string;
  fileSize: number;
  width: number;
  height: number;
  timestampIncluded: boolean;
};

type BridgeJob = {
  id: string;
  vehicle: string;
  roNumber: string;
  customerName: string;
  paintCode: string;
  amount: number;
  amountStatus: string;
  status: string;
  done: boolean;
  promiseDate: string;
  partsWaiting: boolean;
  partsRequests: JobPartRequest[];
  textNotes: JobNote[];
  photos: JobPhoto[];
  sortOrder?: number;
};

const HOME_PATH = process.env.USERPROFILE || process.env.HOME || '';
const UAB_ROOT_PATH = path.join(HOME_PATH, 'UAB');
const ACTIVE_RO_ROOT_PATH = path.join(UAB_ROOT_PATH, "Active RO's");
const CLOSED_RO_ROOT_PATH = path.join(UAB_ROOT_PATH, "Closed RO's");
const LOG_PATH = path.join(UAB_ROOT_PATH, 'shop-keeper-bridge.log');
const jobsCollection = collection(electronDb, 'jobs');

const syncedJobSignatures = new Map<string, string>();

function writeLog(level: 'INFO' | 'WARN' | 'ERROR', message: string) {
  try {
    fs.mkdirSync(UAB_ROOT_PATH, { recursive: true });
    fs.appendFileSync(
      LOG_PATH,
      `[${new Date().toISOString()}] [${level}] ${message}\r\n`,
      'utf8',
    );
  } catch {
    // Never crash the bridge because logging failed.
  }
}

function installSafeConsoleBridge() {
  const originalConsole = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  const writeConsoleSafely = (
    level: 'INFO' | 'WARN' | 'ERROR',
    fallback: (...args: unknown[]) => void,
    args: unknown[],
  ) => {
    try {
      fallback(...args);
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: string }).code === 'EPIPE'
      ) {
        writeLog(
          level,
          `Suppressed console EPIPE: ${args
            .map((value) =>
              value instanceof Error ? value.stack || value.message : String(value),
            )
            .join(' ')}`,
        );
        return;
      }

      writeLog(
        'ERROR',
        `Console write failed: ${error instanceof Error ? error.stack || error.message : String(error)}`,
      );
    }
  };

  console.log = (...args: unknown[]) => writeConsoleSafely('INFO', originalConsole.log, args);
  console.info = (...args: unknown[]) => writeConsoleSafely('INFO', originalConsole.info, args);
  console.warn = (...args: unknown[]) => writeConsoleSafely('WARN', originalConsole.warn, args);
  console.error = (...args: unknown[]) => writeConsoleSafely('ERROR', originalConsole.error, args);

  process.stdout?.on?.('error', (error: NodeJS.ErrnoException) => {
    if (error?.code === 'EPIPE') {
      writeLog('WARN', 'Suppressed stdout EPIPE in bridge.');
      return;
    }

    writeLog(
      'ERROR',
      `stdout error: ${error instanceof Error ? error.stack || error.message : String(error)}`,
    );
  });

  process.stderr?.on?.('error', (error: NodeJS.ErrnoException) => {
    if (error?.code === 'EPIPE') {
      writeLog('WARN', 'Suppressed stderr EPIPE in bridge.');
      return;
    }

    writeLog(
      'ERROR',
      `stderr error: ${error instanceof Error ? error.stack || error.message : String(error)}`,
    );
  });
}

function sanitizeFolderSegment(value: string) {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function ensureRoRoots() {
  fs.mkdirSync(ACTIVE_RO_ROOT_PATH, { recursive: true });
  fs.mkdirSync(CLOSED_RO_ROOT_PATH, { recursive: true });
}

function getFolderNameForRo(roNumber: string, customerName: string) {
  const safeCustomerName = sanitizeFolderSegment(customerName) || 'Unknown Customer';
  return `${roNumber.trim()} - ${safeCustomerName}`;
}

function findRoFolder(rootPath: string, roNumber: string) {
  if (!fs.existsSync(rootPath)) {
    return null;
  }

  const folderPrefix = `${roNumber.trim()} - `;
  const existingFolder = fs
    .readdirSync(rootPath, { withFileTypes: true })
    .find(
      (entry) =>
        entry.isDirectory() &&
        (entry.name === roNumber.trim() || entry.name.startsWith(folderPrefix)),
    );

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

function buildJobNotesText(job: BridgeJob) {
  const lines: string[] = [
    `RO: ${job.roNumber}`,
    `Customer: ${job.customerName}`,
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
      if (part.source?.trim()) {
        lines.push(`Source: ${part.source.trim()}`);
      }
      if (part.partNumber?.trim()) {
        lines.push(`Part #: ${part.partNumber.trim()}`);
      }
      if (typeof part.estimateAmount === 'number') {
        lines.push(`Estimate Amount: ${formatMoney(part.estimateAmount)}`);
      }
      if (part.requestPhoto?.url) {
        lines.push(`Request Photo: ${part.requestPhoto.url}`);
      }
      if (part.invoiceNumber?.trim()) {
        lines.push(`Invoice: ${part.invoiceNumber.trim()}`);
      }
      if (part.invoiceVendor?.trim()) {
        lines.push(`Vendor: ${part.invoiceVendor.trim()}`);
      }
      if (typeof part.invoiceListPrice === 'number') {
        lines.push(`List Price: ${formatMoney(part.invoiceListPrice)}`);
      }
      if (typeof part.invoiceNetPrice === 'number') {
        lines.push(`Net Price: ${formatMoney(part.invoiceNetPrice)}`);
      }
      if (part.invoicePhoto?.url) {
        lines.push(`Invoice Photo: ${part.invoicePhoto.url}`);
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
      lines.push(
        `[${index + 1}] ${new Date(photo.createdAt).toLocaleString()} | ${photo.width}x${photo.height} | ${photo.fileSize} bytes`,
      );
      lines.push(`URL: ${photo.url}`);
      lines.push('');
    });
  }

  return lines.join('\r\n');
}

function safeTimestampSegment(value: string) {
  const parsed = new Date(value);
  const safeDate = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return safeDate.toISOString().replace(/[:.]/g, '-');
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

function writeTextNotes(folderPath: string, job: BridgeJob) {
  const notesFolderPath = path.join(folderPath, 'Notes');
  fs.mkdirSync(notesFolderPath, { recursive: true });

  for (const note of job.textNotes) {
    if (note.type !== 'text' || !note.text?.trim()) {
      continue;
    }

    const fileName = `note-${safeTimestampSegment(note.createdAt)}.txt`;
    const filePath = path.join(notesFolderPath, fileName);
    fs.writeFileSync(filePath, note.text.trim(), 'utf8');
  }
}

function getUrlExtension(url: string, fallback: string) {
  try {
    const parsed = new URL(url);
    const pathname = decodeURIComponent(parsed.pathname);
    const extension = path.extname(pathname).replace('.', '').trim().toLowerCase();
    return extension || fallback;
  } catch {
    return fallback;
  }
}

async function downloadFile(url: string, destinationPath: string) {
  if (fs.existsSync(destinationPath)) {
    return;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed with status ${response.status}.`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destinationPath, bytes);
}

async function syncAudioNotes(folderPath: string, job: BridgeJob) {
  const audioFolderPath = path.join(folderPath, 'Audio Notes');
  fs.mkdirSync(audioFolderPath, { recursive: true });

  for (const note of job.textNotes) {
    if (note.type !== 'audio' || !note.audioUrl) {
      continue;
    }

    const extension = getUrlExtension(note.audioUrl, 'webm');
    const fileName = `audio-note-${safeTimestampSegment(note.createdAt)}.${extension}`;
    const filePath = path.join(audioFolderPath, fileName);
    await downloadFile(note.audioUrl, filePath);
  }
}

async function syncPhotos(folderPath: string, job: BridgeJob) {
  for (const photo of job.photos) {
    if (!photo.url) {
      continue;
    }

    const extension = getUrlExtension(photo.url, 'jpg');
    const fileName = `shop-keeper-photo-${safeTimestampSegment(photo.createdAt)}.${extension}`;
    const filePath = path.join(folderPath, fileName);
    await downloadFile(photo.url, filePath);
  }
}

async function syncPartInvoicePhotos(folderPath: string, job: BridgeJob) {
  const invoiceFolderPath = path.join(folderPath, 'Invoices');
  const requestFolderPath = path.join(folderPath, 'Part Requests');
  fs.mkdirSync(invoiceFolderPath, { recursive: true });
  fs.mkdirSync(requestFolderPath, { recursive: true });

  for (const part of job.partsRequests) {
    const requestPhoto = part.requestPhoto;
    if (requestPhoto?.url) {
      const extension = getUrlExtension(requestPhoto.url, 'jpg');
      const partName = (sanitizeFolderSegment(part.name) || 'part').slice(0, 60);
      const fileName = `request-${partName}-${safeTimestampSegment(requestPhoto.createdAt)}.${extension}`;
      const filePath = path.join(requestFolderPath, fileName);
      await downloadFile(requestPhoto.url, filePath);
    }

    const photo = part.invoicePhoto;
    if (photo?.url) {
      const extension = getUrlExtension(photo.url, 'jpg');
      const partName = (sanitizeFolderSegment(part.name) || 'part').slice(0, 60);
      const invoiceNumber = (sanitizeFolderSegment(part.invoiceNumber ?? '') || part.id).slice(0, 40);
      const fileName = `invoice-${partName}-${invoiceNumber}-${safeTimestampSegment(photo.createdAt)}.${extension}`;
      const filePath = path.join(invoiceFolderPath, fileName);
      await downloadFile(photo.url, filePath);
    }
  }
}

function writeJobRecord(folderPath: string, job: BridgeJob) {
  const jobJsonPath = path.join(folderPath, 'shop-keeper-job.json');
  const notesPath = path.join(folderPath, 'shop-keeper-notes.txt');
  const summaryPath = path.join(folderPath, 'shop-keeper-summary.txt');
  const notesText = buildJobNotesText(job);

  fs.writeFileSync(jobJsonPath, `${JSON.stringify(job, null, 2)}\r\n`, 'utf8');
  fs.writeFileSync(notesPath, notesText, 'utf8');
  fs.writeFileSync(summaryPath, notesText, 'utf8');
}

function normalizeJob(data: Record<string, unknown>, id: string): BridgeJob {
  return {
    id,
    vehicle: String(data.vehicle ?? ''),
    roNumber: String(data.roNumber ?? ''),
    customerName: String(data.customerName ?? ''),
    paintCode: String(data.paintCode ?? ''),
    amount: Number(data.amount ?? 0) || 0,
    amountStatus: String(data.amountStatus ?? 'notFinal'),
    status: String(data.status ?? 'notStarted'),
    done: Boolean(data.done),
    promiseDate: String(data.promiseDate ?? ''),
    partsWaiting: Boolean(data.partsWaiting),
    partsRequests: Array.isArray(data.partsRequests)
      ? (data.partsRequests as JobPartRequest[])
      : [],
    textNotes: Array.isArray(data.textNotes) ? (data.textNotes as JobNote[]) : [],
    photos: Array.isArray(data.photos) ? (data.photos as JobPhoto[]) : [],
    sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : undefined,
  };
}

async function syncJob(job: BridgeJob) {
  if (!job.roNumber.trim()) {
    return;
  }

  const signature = JSON.stringify(job);
  if (syncedJobSignatures.get(job.id) === signature) {
    return;
  }

  const folderPath = resolveRoFolderPath(job.roNumber, job.customerName, job.done);
  writeJobRecord(folderPath, job);
  writeTextNotes(folderPath, job);
  await syncAudioNotes(folderPath, job);
  await syncPhotos(folderPath, job);
  await syncPartInvoicePhotos(folderPath, job);

  syncedJobSignatures.set(job.id, signature);
  writeLog('INFO', `Synced RO ${job.roNumber} (${job.customerName}) to ${folderPath}`);
}

function startBridge() {
  installSafeConsoleBridge();
  setLogLevel('error');
  ensureRoRoots();
  writeLog('INFO', 'Shop Keeper Bridge started.');

  const q = query(jobsCollection, orderBy('createdAt', 'desc'));
  onSnapshot(
    q,
    (snapshot) => {
      snapshot.docs.forEach((snap) => {
        const job = normalizeJob(snap.data() as Record<string, unknown>, snap.id);
        void syncJob(job).catch((error) => {
          writeLog(
            'ERROR',
            `Failed to sync RO ${job.roNumber || snap.id}: ${
              error instanceof Error ? error.stack || error.message : String(error)
            }`,
          );
        });
      });
    },
    (error) => {
      writeLog(
        'ERROR',
        `Firebase subscription failed: ${error instanceof Error ? error.stack || error.message : String(error)}`,
      );
    },
  );
}

process.on('uncaughtException', (error) => {
  writeLog('ERROR', `Uncaught exception: ${error instanceof Error ? error.stack || error.message : String(error)}`);
});

process.on('unhandledRejection', (reason) => {
  writeLog('ERROR', `Unhandled rejection: ${reason instanceof Error ? reason.stack || reason.message : String(reason)}`);
});

if (require.main === module) {
  startBridge();
}

export { startBridge };
