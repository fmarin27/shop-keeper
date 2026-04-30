import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { initializeApp } from 'firebase/app';
import {
  doc,
  getDoc,
  getFirestore,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

const DEFAULT_EMS_OUTPUT_DIR =
  'C:\\Users\\ferna\\Projects\\Active\\EMS Management Platform\\samples\\out';

const firebaseConfig = {
  apiKey: 'AIzaSyDmjJDboyNhdKw5nYB3RydCND6xFphprGw',
  authDomain: 'shop-keeper-58e37.firebaseapp.com',
  projectId: 'shop-keeper-58e37',
  storageBucket: 'shop-keeper-58e37.firebasestorage.app',
  messagingSenderId: '986896386614',
  appId: '1:986896386614:web:e33a4f4c7b037f54e2e697',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function parseArgs(argv) {
  const args = {
    dir: process.env.EMS_NORMALIZED_DIR || DEFAULT_EMS_OUTPUT_DIR,
    inputs: [],
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }

    if (arg === '--dir') {
      args.dir = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--input') {
      args.inputs.push(argv[index + 1]);
      index += 1;
      continue;
    }

    args.inputs.push(arg);
  }

  return args;
}

async function findInputFiles(args) {
  if (args.inputs.length) {
    return args.inputs.map((input) => path.resolve(input));
  }

  const entries = await readdir(args.dir, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.endsWith('_normalized.json'))
    .sort()
    .map((name) => path.join(args.dir, name));
}

function slug(value) {
  const clean = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return clean || 'unknown';
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value) {
  if (value === null || value === undefined) return '';

  const clean = String(value).trim();
  return clean === 'true' || clean === 'false' ? '' : clean;
}

function firstText(...values) {
  for (const value of values) {
    const clean = text(value);
    if (clean) return clean;
  }

  return '';
}

function buildVehicleLabel(vehicle) {
  return [vehicle?.year, vehicle?.make, vehicle?.model]
    .map(text)
    .filter(Boolean)
    .join(' ');
}

function getLinePartNumber(line) {
  const raw = line?.raw_fields || {};
  const number = firstText(
    line?.part_number,
    raw.OEM_PARTNO,
    raw.ALT_PARTNO,
    raw.ALT_PARTM,
  );

  return number.toUpperCase() === 'NONE' ? '' : number;
}

function getLineDescription(line) {
  return firstText(line?.description, line?.raw_fields?.LINE_DESC);
}

function mapEstimateLines(lines) {
  return (Array.isArray(lines) ? lines : []).map((line, index) => {
    const raw = line.raw_fields || {};
    const lineNumber = firstText(line.line_number, index + 1);
    const partNumber = getLinePartNumber(line);

    return {
      id: `ems-line-${slug(lineNumber)}-${index + 1}`,
      lineNumber,
      sourceFile: text(line.source_file || 'lin'),
      operationCode: text(line.operation_code),
      operationCategory: text(line.operation_category),
      partType: text(line.part_type),
      partNumber,
      description: getLineDescription(line),
      quantity: toNumber(line.quantity),
      laborType: text(line.labor_type),
      laborHours: toNumber(line.labor_hours),
      laborRate: toNumber(line.labor_rate),
      laborAmount: toNumber(line.labor_amount),
      paintHours: toNumber(line.paint_hours),
      paintAmount: toNumber(line.paint_amount),
      partPrice: toNumber(line.part_price) || toNumber(raw.ACT_PRICE),
      totalAmount: toNumber(line.total_amount),
      lineKind: text(line.line_kind),
      operationLabel: text(line.operation_label),
      isOrderablePart: line.is_orderable_part === true,
      isSublet: line.is_sublet === true,
      rawFields: raw,
    };
  });
}

function isTruthyRawFlag(value) {
  return ['true', 'yes', '1', 'y'].includes(text(value).toLowerCase());
}

function isSubletCandidate(line) {
  if (line.isSublet) return true;

  const raw = line.rawFields || {};
  const description = text(line.description).toLowerCase();
  const partType = text(line.partType).toLowerCase();

  return (
    isTruthyRawFlag(raw.MISC_SUBLT) ||
    partType.includes('sublet') ||
    partType === 'sub' ||
    description.includes('sublet') ||
    description.includes('tow bill') ||
    description.includes('towing')
  );
}

function isRefinishOnlyOperation(line) {
  const operationLabel = text(line.operationLabel).toLowerCase();
  const operationCategory = text(line.operationCategory).toLowerCase();
  const laborType = text(line.laborType).toLowerCase();

  return [operationLabel, operationCategory, laborType].some(
    (value) => value.includes('refinish') || value.includes('paint'),
  );
}

function isPartCandidate(line) {
  if (isRefinishOnlyOperation(line)) return false;
  if (line.isOrderablePart) return true;
  if (line.lineKind) return false;

  const description = text(line.description).toLowerCase();
  const partNumber = text(line.partNumber);

  if (!line.description && !partNumber) return false;
  if (description.includes('markup')) return false;
  if (description.includes('tow bill')) return false;
  if (description.includes('scan')) return false;
  if (isSubletCandidate(line)) return false;

  return line.partPrice > 0 && Boolean(partNumber);
}

function seededPartName(line) {
  const description = text(line.description);
  const partNumber = text(line.partNumber);

  if (!partNumber) return description;
  if (!description) return partNumber;

  return `${description} (${partNumber})`;
}

function extractSeededPartNumber(name) {
  const match = text(name).match(/\(([A-Z0-9][A-Z0-9.-]{4,})\)\s*$/i);

  return match?.[1] || '';
}

function seededPartIdentity(kind, name, partNumber = '') {
  const identitySource = partNumber ? `part-number-${partNumber}` : `name-${name}`;

  return slug(`${kind || 'part'}-${identitySource}`);
}

function seededPartIdentityFromLine(line, kind) {
  return seededPartIdentity(kind, seededPartName(line), line.partNumber);
}

function seededPartIdentityFromPart(part) {
  return seededPartIdentity(
    part.kind || 'part',
    part.name,
    extractSeededPartNumber(part.name),
  );
}

function partStatusRank(status) {
  switch (status) {
    case 'received':
      return 4;
    case 'ordered':
      return 3;
    case 'reorderNeeded':
      return 2;
    case 'requested':
    default:
      return 1;
  }
}

function pickPreferredPart(current, candidate) {
  if (!current) return candidate;
  if (candidate.paidAt && !current.paidAt) return candidate;
  if (candidate.receivedAt && !current.receivedAt) return candidate;
  if (partStatusRank(candidate.status) > partStatusRank(current.status)) {
    return candidate;
  }
  if (candidate.invoiceNumber && !current.invoiceNumber) return candidate;

  return current;
}

function isEmsSeededPart(part) {
  return (
    text(part.id).startsWith('ems-part-') ||
    text(part.note).toLowerCase().startsWith('seeded from ems line')
  );
}

function seedPartsFromEstimate(estimateLines, existingParts) {
  const previousParts = Array.isArray(existingParts) ? existingParts : [];
  const manualParts = previousParts.filter((part) => !isEmsSeededPart(part));
  const previousEmsPartsById = new Map(
    previousParts.filter(isEmsSeededPart).map((part) => [part.id, part]),
  );
  const previousEmsPartsByIdentity = new Map();

  previousParts.filter(isEmsSeededPart).forEach((part) => {
    const identity = seededPartIdentityFromPart(part);
    previousEmsPartsByIdentity.set(
      identity,
      pickPreferredPart(previousEmsPartsByIdentity.get(identity), part),
    );
  });

  const seededPartsByIdentity = new Map();

  estimateLines
    .filter((line) => isPartCandidate(line) || isSubletCandidate(line))
    .forEach((line) => {
      const kind = isSubletCandidate(line) ? 'sublet' : 'part';
      const identity = seededPartIdentityFromLine(line, kind);
      const legacyId = `ems-part-${slug(line.id)}`;
      const previous =
        previousEmsPartsByIdentity.get(identity) || previousEmsPartsById.get(legacyId);
      const generatedNote = `Seeded from EMS line ${line.lineNumber}. Verify ${
        kind === 'sublet' ? 'invoice/payment' : 'order status'
      }.`;
      const seededPart = {
        id: `ems-part-${identity}`,
        kind,
        name: seededPartName(line),
        quantity: String(line.quantity || 1),
        requestedBy: previous?.requestedBy || 'manager',
        status: previous?.status || 'requested',
        invoiceNumber: previous?.invoiceNumber || '',
        note: previous?.note?.trim() ? previous.note : generatedNote,
        createdAt: previous?.createdAt || new Date().toISOString(),
        ...(previous?.receivedAt ? { receivedAt: previous.receivedAt } : {}),
        ...(previous?.paidAt ? { paidAt: previous.paidAt } : {}),
      };

      seededPartsByIdentity.set(
        identity,
        pickPreferredPart(seededPartsByIdentity.get(identity), seededPart),
      );
    });

  return [...manualParts, ...seededPartsByIdentity.values()];
}

function buildJobPayload(normalized, existing, sourceFile) {
  const sourceSystem = text(normalized.source_system || 'EMS').toUpperCase();
  const externalEstimateId = firstText(
    normalized.external_estimate_id,
    normalized.ro_number,
    path.basename(sourceFile, '.json'),
  );
  const jobId = `ems-${slug(sourceSystem)}-${slug(externalEstimateId)}`;
  const customer = normalized.customer || {};
  const vehicle = normalized.vehicle || {};
  const claim = normalized.claim || {};
  const totals = normalized.totals || {};
  const estimateLines = mapEstimateLines(normalized.line_items);
  const seededParts = seedPartsFromEstimate(estimateLines, existing?.partsRequests);
  const customerPhone = text(customer.phone);
  const nowIso = new Date().toISOString();

  const payload = {
    sourceSystem,
    externalEstimateId,
    roNumber: firstText(normalized.ro_number, externalEstimateId),
    customerName: firstText(
      customer.full_name,
      [customer.first_name, customer.last_name].map(text).filter(Boolean).join(' '),
    ),
    phoneNumber: firstText(existing?.phoneNumber, customerPhone),
    customerPhone: firstText(existing?.customerPhone, existing?.phoneNumber, customerPhone),
    customerEmail: text(customer.email),
    vehicle: buildVehicleLabel(vehicle),
    vehicleYear: text(vehicle.year),
    vehicleMake: text(vehicle.make),
    vehicleModel: text(vehicle.model),
    vehicleVin: text(vehicle.vin),
    vehicleColor: text(vehicle.color),
    paintCode: existing?.paintCode ?? text(vehicle.paint_code || vehicle.color),
    insuranceCompany: text(claim.insurance_company),
    claimNumber: text(claim.claim_number),
    policyNumber: text(claim.policy_number),
    sourceEstimateId: externalEstimateId,
    amount: toNumber(totals.grand_total),
    amountStatus: existing?.amountStatus ?? 'notFinal',
    status: existing?.status ?? 'notStarted',
    done: existing?.done ?? false,
    promiseDate: existing?.promiseDate ?? '',
    partsWaiting: seededParts.some(
      (part) => (part.kind || 'part') === 'part' && part.status !== 'received',
    ),
    partsRequests: seededParts,
    laborCompletions: existing?.laborCompletions ?? [],
    textNotes: existing?.textNotes ?? [],
    photos: existing?.photos ?? [],
    ...(typeof existing?.sortOrder === 'number'
      ? { sortOrder: existing.sortOrder }
      : { sortOrder: Date.now() * -1 }),
    estimateTotals: {
      bodyLaborHours: toNumber(totals.body_labor_hours),
      refinishLaborHours: toNumber(totals.refinish_labor_hours),
      mechanicalLaborHours: toNumber(totals.mechanical_labor_hours),
      paintMaterials: toNumber(totals.paint_materials),
      partsTotal: toNumber(totals.parts_total),
      grandTotal: toNumber(totals.grand_total),
    },
    estimateLines,
    emsLineItemCount: estimateLines.length,
    emsSourceFile: sourceFile,
    lastEmsSyncAt: nowIso,
    updatedAt: serverTimestamp(),
  };

  if (!existing) {
    payload.createdAt = serverTimestamp();
  }

  return { jobId, payload };
}

async function syncFile(file, dryRun) {
  const normalized = JSON.parse(await readFile(file, 'utf8'));
  const previewId = `ems-${slug(normalized.source_system)}-${slug(
    normalized.external_estimate_id || normalized.ro_number,
  )}`;
  const ref = doc(db, 'jobs', previewId);
  const existingSnapshot = dryRun ? null : await getDoc(ref);
  const existing = existingSnapshot?.exists() ? existingSnapshot.data() : null;
  const { jobId, payload } = buildJobPayload(normalized, existing, file);

  if (jobId !== previewId) {
    throw new Error(`Internal id mismatch for ${file}: ${previewId} vs ${jobId}`);
  }

  const openParts = (payload.partsRequests || []).filter(
    (part) => part.status !== 'received',
  ).length;

  if (!dryRun) {
    await setDoc(ref, payload, { merge: true });
  }

  return {
    action: existing ? 'updated' : dryRun ? 'would upsert' : 'created',
    jobId,
    roNumber: payload.roNumber,
    customerName: payload.customerName,
    vehicle: payload.vehicle,
    amount: payload.amount,
    estimateLines: payload.estimateLines.length,
    openParts,
    file,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const files = await findInputFiles(args);

  if (!files.length) {
    throw new Error(`No *_normalized.json files found in ${args.dir}`);
  }

  const results = [];
  for (const file of files) {
    results.push(await syncFile(file, args.dryRun));
  }

  for (const result of results) {
    console.log(
      `${result.action}: ${result.jobId} | RO ${result.roNumber} | ${result.customerName} | ` +
        `${result.vehicle} | $${result.amount.toFixed(2)} | ` +
        `${result.estimateLines} estimate lines | ${result.openParts} open parts`,
    );
  }

  console.log(
    `${args.dryRun ? 'Dry run checked' : 'Synced'} ${results.length} EMS job${
      results.length === 1 ? '' : 's'
    }.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
