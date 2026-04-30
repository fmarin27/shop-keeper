import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from './config';
import {
  deleteStorageFile,
  getJobAudioExtension,
  uploadJobAudioNote,
  uploadJobPhoto,
} from './storage';
import { appBridge } from '../platform/appBridge';
import {
  belongsToActiveShop,
  getActiveShopId,
  shopScopedDocumentId,
  withActiveShopFields,
} from './shopProfile';
import type {
  AppMode,
  CreateJobInput,
  EmsNormalizedLineItem,
  EmsNormalizedRepairOrder,
  Job,
  JobNote,
  JobPhoto,
  JobPartRequest,
  JobStatus,
  UpdateJobDetailsInput,
  MitchellJobsSnapshot,
} from '../../types/app';

const jobsCollection = collection(db, 'jobs');
const FIRESTORE_WRITE_TIMEOUT_MS = 15000;

type FirestoreJobInput = Omit<Job, 'id'>;

function jobDoc(jobId: string) {
  return doc(db, 'jobs', jobId);
}

function isSoftDeletedJob(data: Record<string, any>) {
  return Boolean(data.deletedAt) || data.deleted === true;
}

function shouldIncludeJob(data: Record<string, any>) {
  return belongsToActiveShop(data) && !isSoftDeletedJob(data);
}

function toFirestorePartRequest(part: JobPartRequest) {
  return {
    id: part.id,
    name: part.name,
    quantity: part.quantity,
    kind: part.kind ?? 'part',
    requestedBy: part.requestedBy,
    status: part.status,
    note: part.note ?? '',
    invoiceNumber: part.invoiceNumber ?? '',
    createdAt: part.createdAt,
    ...(part.receivedAt ? { receivedAt: part.receivedAt } : {}),
    ...(part.paidAt ? { paidAt: part.paidAt } : {}),
  };
}

export function subscribeToJobs(callback: (jobs: Job[]) => void) {
  const q = query(jobsCollection, orderBy('createdAt', 'desc'));

  return onSnapshot(q, (snapshot) => {
    const jobsWithIndex: Array<{ job: Job; index: number }> = snapshot.docs.flatMap(
      (snap, index) => {
        const data = snap.data() as any;

        if (!shouldIncludeJob(data)) {
          return [];
        }

        const estimateLines = Array.isArray(data.estimateLines)
          ? (data.estimateLines as Job['estimateLines'])
          : [];
        const sourceSystem = data.sourceSystem ?? '';
        const partsRequests = sanitizeEmsSeededParts(
          Array.isArray(data.partsRequests)
            ? (data.partsRequests as JobPartRequest[])
            : [],
          estimateLines,
        );

        return {
          index,
          job: {
            id: snap.id,
            shopId: data.shopId ?? getActiveShopId(),
            shopName: data.shopName ?? '',
            deletedAt: data.deletedAt ?? '',
            vehicle: data.vehicle ?? '',
            roNumber: data.roNumber ?? '',
            customerName: data.customerName ?? '',
            phoneNumber: data.phoneNumber ?? data.customerPhone ?? '',
            customerPhone: data.customerPhone ?? data.phoneNumber ?? '',
            customerEmail: data.customerEmail ?? '',
            paintCode: data.paintCode ?? '',
            amount: data.amount ?? 0,
            amountStatus: data.amountStatus ?? 'notFinal',
            status: data.status ?? 'notStarted',
            done: data.done ?? false,
            promiseDate: data.promiseDate ?? '',
            partsWaiting: sourceSystem ? hasOpenParts(partsRequests) : data.partsWaiting ?? false,
            partsRequests,
            textNotes: (data.textNotes ?? []) as JobNote[],
            photos: (data.photos ?? []) as JobPhoto[],
            sortOrder:
              typeof data.sortOrder === 'number' ? data.sortOrder : undefined,
            sourceSystem,
            externalEstimateId: data.externalEstimateId ?? '',
            insuranceCompany: data.insuranceCompany ?? data.mitchellInsuranceCompany ?? '',
            claimNumber: data.claimNumber ?? data.mitchellClaimNumber ?? '',
            policyNumber: data.policyNumber ?? '',
            vehicleYear: data.vehicleYear ?? '',
            vehicleMake: data.vehicleMake ?? '',
            vehicleModel: data.vehicleModel ?? '',
            vehicleVin: data.vehicleVin ?? '',
            vehicleColor: data.vehicleColor ?? '',
            estimateTotals: data.estimateTotals,
            estimateLines,
            emsLineItemCount:
              typeof data.emsLineItemCount === 'number'
                ? data.emsLineItemCount
                : undefined,
            emsFamilyId: data.emsFamilyId ?? '',
            emsSourceFile: data.emsSourceFile ?? '',
            emsSourceSystem: data.emsSourceSystem ?? '',
            lastEmsSyncAt: data.lastEmsSyncAt ?? '',
            lastEmsSourceModifiedAt: data.lastEmsSourceModifiedAt ?? '',
            sourceJobUid: data.sourceJobUid ?? '',
            sourceEstimateId: data.sourceEstimateId ?? '',
            sourceOpportunityNumber: data.sourceOpportunityNumber ?? '',
            mitchellEstimatorName: data.mitchellEstimatorName ?? '',
            mitchellInsuranceCompany: data.mitchellInsuranceCompany ?? data.insuranceCompany ?? '',
            mitchellClaimNumber: data.mitchellClaimNumber ?? data.claimNumber ?? '',
            mitchellDepartmentName: data.mitchellDepartmentName ?? '',
            mitchellLeadTechName: data.mitchellLeadTechName ?? '',
            mitchellProductionStatus: data.mitchellProductionStatus ?? '',
            mitchellLastSourceModifiedAt: data.mitchellLastSourceModifiedAt ?? '',
          },
        };
      },
    );

    jobsWithIndex.sort((a, b) => {
      const aJob = a.job;
      const bJob = b.job;

      const aSortable = !aJob.done;
      const bSortable = !bJob.done;

      if (aSortable && bSortable) {
        const aOrder =
          typeof aJob.sortOrder === 'number' ? aJob.sortOrder : Number.MAX_SAFE_INTEGER;
        const bOrder =
          typeof bJob.sortOrder === 'number' ? bJob.sortOrder : Number.MAX_SAFE_INTEGER;

        if (aOrder !== bOrder) {
          return aOrder - bOrder;
        }
      }

      return a.index - b.index;
    });

    callback(jobsWithIndex.map((entry) => entry.job));
  });
}

export async function seedJob(job: FirestoreJobInput) {
  await addDoc(jobsCollection, withActiveShopFields({
    ...job,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));
}

export async function createJob(input: CreateJobInput) {
  const initialNote = input.initialNote?.trim() ?? '';
  const initialPartName = input.initialPartName?.trim() ?? '';
  const initialPartQuantity = input.initialPartQuantity?.trim() ?? '';
  const initialPartNote = input.initialPartNote?.trim() ?? '';

  const notes: JobNote[] = initialNote
    ? [
        {
          id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          type: 'text',
          text: initialNote,
          createdAt: new Date().toISOString(),
          read: false,
        },
      ]
    : [];

  const partsRequests: JobPartRequest[] =
    initialPartName && initialPartQuantity
      ? [
          {
            id: `part-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            name: initialPartName,
            quantity: initialPartQuantity,
            requestedBy: 'manager',
            status: input.initialPartStatus ?? 'requested',
            note: initialPartNote,
            createdAt: new Date().toISOString(),
          },
        ]
      : [];

  await addDoc(jobsCollection, withActiveShopFields({
    vehicle: input.vehicle.trim(),
    roNumber: input.roNumber.trim(),
    customerName: input.customerName.trim(),
    phoneNumber: input.phoneNumber.trim(),
    paintCode: input.paintCode.trim(),
    amount: Number.isFinite(input.amount) ? input.amount : 0,
    amountStatus: input.amountStatus,
    status: input.status,
    done: false,
    promiseDate: input.promiseDate,
    partsWaiting:
      input.partsWaiting ||
      partsRequests.some((part) => part.status !== 'received'),
    partsRequests: partsRequests.map(toFirestorePartRequest),
    textNotes: notes,
    photos: [],
    sortOrder: Date.now() * -1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));

  if (appBridge.isDesktop()) {
    await appBridge.ensureRoFolderForJob({
      roNumber: input.roNumber.trim(),
      customerName: input.customerName.trim(),
      done: false,
    });
  }
}

function slug(value: unknown) {
  const clean = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return clean || 'unknown';
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown) {
  if (value === null || value === undefined) return '';

  const clean = String(value).trim();
  return clean === 'true' || clean === 'false' ? '' : clean;
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const clean = text(value);
    if (clean) return clean;
  }

  return '';
}

function buildVehicleLabel(vehicle: EmsNormalizedRepairOrder['vehicle']) {
  return [vehicle?.year, vehicle?.make, vehicle?.model]
    .map(text)
    .filter(Boolean)
    .join(' ');
}

function getLinePartNumber(line: EmsNormalizedLineItem) {
  const raw = line.raw_fields ?? {};
  const number = firstText(
    line.part_number,
    raw.OEM_PARTNO,
    raw.ALT_PARTNO,
    raw.ALT_PARTM,
  );

  return number.toUpperCase() === 'NONE' ? '' : number;
}

function getLineDescription(line: EmsNormalizedLineItem) {
  return firstText(line.description, line.raw_fields?.LINE_DESC);
}

function mapEstimateLines(lines: EmsNormalizedRepairOrder['line_items']) {
  return (Array.isArray(lines) ? lines : []).map((line, index) => {
    const lineNumber = firstText(line.line_number, index + 1);
    const partNumber = getLinePartNumber(line);
    const raw = line.raw_fields ?? {};

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

function isPartCandidate(line: ReturnType<typeof mapEstimateLines>[number]) {
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

function isTruthyRawFlag(value: unknown) {
  return ['true', 'yes', '1', 'y'].includes(text(value).toLowerCase());
}

function isSubletCandidate(line: ReturnType<typeof mapEstimateLines>[number]) {
  if (line.isSublet) return true;

  const raw = (line.rawFields ?? {}) as Record<string, unknown>;
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

function isRefinishOnlyOperation(line: ReturnType<typeof mapEstimateLines>[number]) {
  const operationLabel = text(line.operationLabel).toLowerCase();
  const operationCategory = text(line.operationCategory).toLowerCase();
  const laborType = text(line.laborType).toLowerCase();

  return [operationLabel, operationCategory, laborType].some(
    (value) => value.includes('refinish') || value.includes('paint'),
  );
}

function seededPartName(line: ReturnType<typeof mapEstimateLines>[number]) {
  const description = text(line.description);
  const partNumber = text(line.partNumber);

  if (!partNumber) return description;
  if (!description) return partNumber;

  return `${description} (${partNumber})`;
}

function seededPartIdentity(
  kind: JobPartRequest['kind'],
  name: string,
  partNumber = '',
) {
  const identitySource = partNumber ? `part-number-${partNumber}` : `name-${name}`;

  return slug(`${kind ?? 'part'}-${identitySource}`);
}

function seededPartIdentityFromLine(
  line: ReturnType<typeof mapEstimateLines>[number],
  kind: JobPartRequest['kind'],
) {
  return seededPartIdentity(kind, seededPartName(line), line.partNumber);
}

function seededPartIdentityFromPart(part: JobPartRequest) {
  return seededPartIdentity(
    part.kind ?? 'part',
    part.name,
    extractSeededPartNumber(part.name),
  );
}

function extractSeededPartNumber(name: string) {
  const match = text(name).match(/\(([A-Z0-9][A-Z0-9.-]{4,})\)\s*$/i);

  return match?.[1] ?? '';
}

function partStatusRank(status: JobPartRequest['status']) {
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

function pickPreferredPart(
  current: JobPartRequest | undefined,
  candidate: JobPartRequest,
) {
  if (!current) return candidate;
  if (candidate.paidAt && !current.paidAt) return candidate;
  if (candidate.receivedAt && !current.receivedAt) return candidate;
  if (partStatusRank(candidate.status) > partStatusRank(current.status)) {
    return candidate;
  }
  if (candidate.invoiceNumber && !current.invoiceNumber) return candidate;

  return current;
}

function dedupeEmsSeededParts(parts: JobPartRequest[]) {
  const manualParts: JobPartRequest[] = [];
  const seededPartsByIdentity = new Map<string, JobPartRequest>();

  parts.forEach((part) => {
    if (!isEmsSeededPart(part)) {
      manualParts.push(part);
      return;
    }

    const identity = seededPartIdentityFromPart(part);
    seededPartsByIdentity.set(
      identity,
      pickPreferredPart(seededPartsByIdentity.get(identity), part),
    );
  });

  return [...manualParts, ...seededPartsByIdentity.values()];
}

function seedPartsFromEstimate(
  estimateLines: ReturnType<typeof mapEstimateLines>,
  existingParts: JobPartRequest[] | undefined,
) {
  const previousParts = Array.isArray(existingParts) ? existingParts : [];
  const manualParts = previousParts.filter((part) => !isEmsSeededPart(part));
  const previousEmsPartsById = new Map(
    previousParts.filter(isEmsSeededPart).map((part) => [part.id, part]),
  );
  const previousEmsPartsByIdentity = new Map<string, JobPartRequest>();
  previousParts.filter(isEmsSeededPart).forEach((part) => {
    const identity = seededPartIdentityFromPart(part);
    previousEmsPartsByIdentity.set(
      identity,
      pickPreferredPart(previousEmsPartsByIdentity.get(identity), part),
    );
  });

  const seededPartsByIdentity = new Map<string, JobPartRequest>();
  estimateLines
    .filter((line) => isPartCandidate(line) || isSubletCandidate(line))
    .forEach((line) => {
      const kind = isSubletCandidate(line) ? 'sublet' as const : 'part' as const;
      const identity = seededPartIdentityFromLine(line, kind);
      const legacyId = `ems-part-${slug(line.id)}`;
      const id = `ems-part-${identity}`;
      const previous =
        previousEmsPartsByIdentity.get(identity) ?? previousEmsPartsById.get(legacyId);
      const generatedNote = `Seeded from EMS line ${line.lineNumber}. Verify ${
        kind === 'sublet' ? 'invoice/payment' : 'order status'
      }.`;
      const seededPart: JobPartRequest = {
        id,
        kind,
        name: seededPartName(line),
        quantity: String(line.quantity || 1),
        requestedBy: previous?.requestedBy ?? ('manager' as const),
        status: previous?.status ?? ('requested' as const),
        invoiceNumber: previous?.invoiceNumber ?? '',
        note: previous?.note?.trim() ? previous.note : generatedNote,
        createdAt: previous?.createdAt ?? new Date().toISOString(),
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

function isEmsSeededPart(part: JobPartRequest) {
  return (
    part.id.startsWith('ems-part-') ||
    text(part.note).toLowerCase().startsWith('seeded from ems line')
  );
}

function emsPartLineKey(part: JobPartRequest) {
  if (!part.id.startsWith('ems-part-')) {
    return '';
  }

  return part.id.slice('ems-part-'.length);
}

function sanitizeEmsSeededParts(
  parts: JobPartRequest[],
  estimateLines: Job['estimateLines'],
) {
  if (!parts.some(isEmsSeededPart)) {
    return parts;
  }

  if (!estimateLines?.length) {
    return dedupeEmsSeededParts(parts);
  }

  const validSeededLineKeys = new Set<string>();
  const validSeededIdentities = new Set<string>();

  estimateLines.forEach((line) => {
    if (!isPartCandidate(line) && !isSubletCandidate(line)) {
      return;
    }

    const kind = isSubletCandidate(line) ? 'sublet' as const : 'part' as const;
    validSeededLineKeys.add(slug(line.id));
    validSeededIdentities.add(seededPartIdentityFromLine(line, kind));
  });

  const filteredParts = parts.filter((part) => {
    if (!isEmsSeededPart(part)) {
      return true;
    }

    if (validSeededIdentities.has(seededPartIdentityFromPart(part))) {
      return true;
    }

    const legacyLineKey = emsPartLineKey(part);

    return legacyLineKey ? validSeededLineKeys.has(legacyLineKey) : true;
  });

  return dedupeEmsSeededParts(filteredParts);
}

function hasOpenParts(parts: JobPartRequest[]) {
  return parts.some(
    (part) => (part.kind ?? 'part') === 'part' && part.status !== 'received',
  );
}

export async function convertEmsRepairOrderToJob(
  normalized: EmsNormalizedRepairOrder,
  sourceFile: string,
  options: { sourceModifiedAt?: string } = {},
) {
  const sourceSystem = text(normalized.source_system || 'EMS').toUpperCase();
  const externalEstimateId = firstText(
    normalized.external_estimate_id,
    normalized.ro_number,
    sourceFile,
  );
  const jobId = shopScopedDocumentId(`ems-${slug(sourceSystem)}-${slug(externalEstimateId)}`);
  const ref = jobDoc(jobId);
  const existingSnapshot = await getDoc(ref);
  const existing = existingSnapshot.exists()
    ? (existingSnapshot.data() as Partial<Job>)
    : null;
  const customer = normalized.customer ?? {};
  const vehicle = normalized.vehicle ?? {};
  const claim = normalized.claim ?? {};
  const totals = normalized.totals ?? {};
  const estimateLines = mapEstimateLines(normalized.line_items);
  const seededParts = seedPartsFromEstimate(estimateLines, existing?.partsRequests);
  const customerPhone = text(customer.phone);
  const nowIso = new Date().toISOString();

  const payload = withActiveShopFields({
    sourceSystem,
    externalEstimateId,
    sourceEstimateId: externalEstimateId,
    roNumber: firstText(normalized.ro_number, externalEstimateId),
    customerName: firstText(
      customer.full_name,
      [customer.first_name, customer.last_name].map(text).filter(Boolean).join(' '),
    ),
    phoneNumber: existing?.phoneNumber ?? customerPhone,
    customerPhone,
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
    amount: toNumber(totals.grand_total),
    amountStatus: existing?.amountStatus ?? 'notFinal',
    status: existing?.status ?? 'notStarted',
    done: existing?.done ?? false,
    promiseDate: existing?.promiseDate ?? '',
    partsWaiting: hasOpenParts(seededParts),
    partsRequests: seededParts.map(toFirestorePartRequest),
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
    emsFamilyId: externalEstimateId,
    emsSourceFile: sourceFile,
    emsSourceSystem: sourceSystem,
    lastEmsSyncAt: nowIso,
    lastEmsSourceModifiedAt: options.sourceModifiedAt ?? nowIso,
    ...(!existing ? { createdAt: serverTimestamp() } : {}),
    updatedAt: serverTimestamp(),
  });

  await setDoc(ref, payload, { merge: true });

  if (appBridge.isDesktop()) {
    await appBridge.ensureRoFolderForJob({
      roNumber: payload.roNumber,
      customerName: payload.customerName,
      done: payload.done,
    });
  }

  return {
    jobId,
    roNumber: payload.roNumber,
    customerName: payload.customerName,
    vehicle: payload.vehicle,
    amount: payload.amount,
    lineCount: estimateLines.length,
    partCount: seededParts.length,
  };
}

export async function updateJobFromEmsRepairOrder(
  job: Job,
  normalized: EmsNormalizedRepairOrder,
  sourceFile: string,
  options: { sourceModifiedAt?: string } = {},
) {
  const sourceSystem = text(normalized.source_system || 'EMS').toUpperCase();
  const externalEstimateId = firstText(
    normalized.external_estimate_id,
    normalized.ro_number,
    sourceFile,
  );
  const customer = normalized.customer ?? {};
  const vehicle = normalized.vehicle ?? {};
  const claim = normalized.claim ?? {};
  const totals = normalized.totals ?? {};
  const estimateLines = mapEstimateLines(normalized.line_items);
  const shouldReplaceEstimateLines = estimateLines.length > 0;
  const nextEstimateLines = shouldReplaceEstimateLines
    ? estimateLines
    : job.estimateLines ?? [];
  const seededParts = shouldReplaceEstimateLines
    ? seedPartsFromEstimate(estimateLines, job.partsRequests)
    : job.partsRequests ?? [];
  const customerPhone = text(customer.phone);
  const customerName = firstText(
    customer.full_name,
    [customer.first_name, customer.last_name].map(text).filter(Boolean).join(' '),
  );
  const vehicleLabel = buildVehicleLabel(vehicle);
  const grandTotal = toNumber(totals.grand_total);
  const nowIso = new Date().toISOString();

  const payload = withActiveShopFields({
    sourceSystem: job.sourceSystem || sourceSystem,
    externalEstimateId: job.externalEstimateId || externalEstimateId,
    sourceEstimateId: job.sourceEstimateId || externalEstimateId,
    emsFamilyId: externalEstimateId,
    emsSourceFile: sourceFile,
    emsSourceSystem: sourceSystem,
    roNumber: firstText(job.roNumber, normalized.ro_number, externalEstimateId),
    customerName: firstText(job.customerName, customerName),
    phoneNumber: firstText(job.phoneNumber, customerPhone),
    customerPhone: firstText(job.customerPhone, job.phoneNumber, customerPhone),
    customerEmail: firstText(job.customerEmail, customer.email),
    vehicle: firstText(job.vehicle, vehicleLabel),
    vehicleYear: firstText(vehicle.year, job.vehicleYear),
    vehicleMake: firstText(vehicle.make, job.vehicleMake),
    vehicleModel: firstText(vehicle.model, job.vehicleModel),
    vehicleVin: firstText(vehicle.vin, job.vehicleVin),
    vehicleColor: firstText(vehicle.color, job.vehicleColor),
    paintCode: firstText(job.paintCode, vehicle.paint_code, vehicle.color),
    insuranceCompany: firstText(claim.insurance_company, job.insuranceCompany),
    claimNumber: firstText(claim.claim_number, job.claimNumber),
    policyNumber: firstText(claim.policy_number, job.policyNumber),
    amount: grandTotal > 0 ? grandTotal : job.amount,
    amountStatus: job.amountStatus,
    status: job.status,
    done: job.done,
    promiseDate: job.promiseDate,
    partsWaiting: hasOpenParts(seededParts),
    partsRequests: seededParts.map(toFirestorePartRequest),
    estimateTotals: {
      bodyLaborHours: toNumber(totals.body_labor_hours),
      refinishLaborHours: toNumber(totals.refinish_labor_hours),
      mechanicalLaborHours: toNumber(totals.mechanical_labor_hours),
      paintMaterials: toNumber(totals.paint_materials),
      partsTotal: toNumber(totals.parts_total),
      grandTotal: grandTotal > 0 ? grandTotal : job.estimateTotals?.grandTotal ?? job.amount,
    },
    estimateLines: nextEstimateLines,
    emsLineItemCount: nextEstimateLines.length,
    lastEmsSyncAt: nowIso,
    lastEmsSourceModifiedAt: options.sourceModifiedAt ?? nowIso,
    updatedAt: serverTimestamp(),
  });

  await updateDoc(jobDoc(job.id), payload);

  if (appBridge.isDesktop()) {
    await appBridge.ensureRoFolderForJob({
      roNumber: String(payload.roNumber ?? job.roNumber),
      customerName: String(payload.customerName ?? job.customerName),
      done: Boolean(payload.done ?? job.done),
    });
  }

  return {
    jobId: job.id,
    roNumber: String(payload.roNumber ?? job.roNumber),
    customerName: String(payload.customerName ?? job.customerName),
    vehicle: String(payload.vehicle ?? job.vehicle),
    amount: Number(payload.amount ?? job.amount),
    lineCount: nextEstimateLines.length,
    partCount: seededParts.length,
  };
}

export async function reorderActiveJobs(
  activeJobs: Job[],
  jobId: string,
  direction: 'up' | 'down',
) {
  if (activeJobs.length < 2) return;

  const normalizedJobs = [...activeJobs].map((job, index) => ({
    ...job,
    sortOrder: index + 1,
  }));

  const currentIndex = normalizedJobs.findIndex((job) => job.id === jobId);
  if (currentIndex === -1) return;

  const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= normalizedJobs.length) return;

  const reordered = [...normalizedJobs];
  const [movedJob] = reordered.splice(currentIndex, 1);
  reordered.splice(targetIndex, 0, movedJob);

  const batch = writeBatch(db);

  reordered.forEach((job, index) => {
    batch.update(jobDoc(job.id), withActiveShopFields({
      sortOrder: index + 1,
      updatedAt: serverTimestamp(),
    }));
  });

  await batch.commit();
}

function normalizeText(value: string) {
  return value.trim();
}

function normalizePromiseDate(value: string) {
  return value.trim();
}

function normalizeAmount(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function selectMitchellJobMatch(
  existingJobs: Array<{ id: string; data: Record<string, any> }>,
  mitchellJob: MitchellJobsSnapshot['jobs'][number],
) {
  const normalizedRo = mitchellJob.roNumber.trim();
  const normalizedVehicle = normalizeText(mitchellJob.vehicle);
  const normalizedCustomer = normalizeText(mitchellJob.customerName);

  const exactSourceUidMatch = existingJobs.find(
    (entry) => String(entry.data.sourceJobUid ?? '').trim() === mitchellJob.jobUid,
  );
  if (exactSourceUidMatch) {
    return exactSourceUidMatch;
  }

  const sameRoJobs = existingJobs.filter(
    (entry) => String(entry.data.roNumber ?? '').trim() === normalizedRo,
  );
  if (!sameRoJobs.length) {
    return null;
  }

  const activeSameRoJob = sameRoJobs.find((entry) => !Boolean(entry.data.done));
  if (activeSameRoJob) {
    return activeSameRoJob;
  }

  const exactVehicleAndCustomerMatch = sameRoJobs.find(
    (entry) =>
      normalizeText(String(entry.data.vehicle ?? '')) === normalizedVehicle &&
      normalizeText(String(entry.data.customerName ?? '')) === normalizedCustomer,
  );
  if (exactVehicleAndCustomerMatch) {
    return exactVehicleAndCustomerMatch;
  }

  return sameRoJobs[0];
}

function isMitchellManagedJob(data: Record<string, any>) {
  if (String(data.sourceSystem ?? '').trim() === 'mitchell') {
    return true;
  }

  if (String(data.sourceJobUid ?? '').trim()) {
    return true;
  }

  if (String(data.sourceEstimateId ?? '').trim()) {
    return true;
  }

  if (String(data.mitchellLastSourceModifiedAt ?? '').trim()) {
    return true;
  }

  if (String(data.mitchellSourcePath ?? '').trim()) {
    return true;
  }

  if (data.lastMitchellSyncAt) {
    return true;
  }

  return false;
}

export async function syncJobsFromMitchell(snapshot: MitchellJobsSnapshot) {
  const existingSnapshot = await getDocs(jobsCollection);
  const existingJobs = existingSnapshot.docs.map((snap) => ({
    id: snap.id,
    data: snap.data() as Record<string, any>,
  })).filter((entry) => belongsToActiveShop(entry.data));
  const matchedExistingJobIds = new Set<string>();

  let maxSortOrder = existingJobs.reduce((highest, entry) => {
    if (isSoftDeletedJob(entry.data)) {
      return highest;
    }

    const sortOrder = entry.data.sortOrder;
    return typeof sortOrder === 'number' ? Math.max(highest, sortOrder) : highest;
  }, 0);

  const operations: Promise<unknown>[] = [];

  snapshot.jobs.forEach((mitchellJob) => {
    const existing = selectMitchellJobMatch(existingJobs, mitchellJob);

    if (existing) {
      matchedExistingJobIds.add(existing.id);
      if (isSoftDeletedJob(existing.data)) {
        return;
      }

      const reopeningClosedJob = Boolean(existing.data.done);
      if (reopeningClosedJob) {
        maxSortOrder += 1;
      }

      const nextData: Record<string, unknown> = withActiveShopFields({
        vehicle: mitchellJob.vehicle,
        roNumber: mitchellJob.roNumber,
        customerName: mitchellJob.customerName,
        phoneNumber: mitchellJob.phoneNumber,
        amount: mitchellJob.amount,
        promiseDate: mitchellJob.promiseDate,
        partsWaiting: mitchellJob.partsWaiting,
        status: mitchellJob.status,
        insuranceCompany: mitchellJob.insuranceCompany,
        claimNumber: mitchellJob.claimNumber,
        sourceSystem: 'mitchell',
        externalEstimateId: mitchellJob.estimateId,
        sourceJobUid: mitchellJob.jobUid,
        sourceEstimateId: mitchellJob.estimateId,
        sourceOpportunityNumber: mitchellJob.opportunityNumber,
        mitchellEstimatorName: mitchellJob.estimatorName,
        mitchellInsuranceCompany: mitchellJob.insuranceCompany,
        mitchellClaimNumber: mitchellJob.claimNumber,
        mitchellDepartmentName: mitchellJob.departmentName,
        mitchellLeadTechName: mitchellJob.leadTechName,
        mitchellProductionStatus: mitchellJob.productionStatus,
        mitchellLastSourceModifiedAt: mitchellJob.lastModifiedAt,
        mitchellSourcePath: snapshot.sourcePath,
        lastMitchellSyncAt: serverTimestamp(),
        done: false,
        ...(reopeningClosedJob ? { sortOrder: maxSortOrder } : {}),
      });

      const changed = (
        normalizeText(String(existing.data.vehicle ?? '')) !== normalizeText(mitchellJob.vehicle) ||
        normalizeText(String(existing.data.customerName ?? '')) !== normalizeText(mitchellJob.customerName) ||
        normalizeAmount(Number(existing.data.amount ?? 0)) !== normalizeAmount(mitchellJob.amount) ||
        normalizePromiseDate(String(existing.data.promiseDate ?? '')) !==
          normalizePromiseDate(mitchellJob.promiseDate) ||
        normalizeText(String(existing.data.insuranceCompany ?? existing.data.mitchellInsuranceCompany ?? '')) !==
          normalizeText(mitchellJob.insuranceCompany) ||
        normalizeText(String(existing.data.claimNumber ?? existing.data.mitchellClaimNumber ?? '')) !==
          normalizeText(mitchellJob.claimNumber) ||
        Boolean(existing.data.partsWaiting) !== mitchellJob.partsWaiting ||
        String(existing.data.status ?? 'notStarted') !== mitchellJob.status ||
        String(existing.data.sourceJobUid ?? '') !== mitchellJob.jobUid ||
        String(existing.data.sourceEstimateId ?? '') !== mitchellJob.estimateId ||
        String(existing.data.mitchellLastSourceModifiedAt ?? '') !== mitchellJob.lastModifiedAt ||
        Boolean(existing.data.done)
      );

      if (!changed) {
        return;
      }

      if (reopeningClosedJob && appBridge.isDesktop()) {
        operations.push(
          appBridge.moveRoFolderForJob({
            roNumber: mitchellJob.roNumber,
            customerName: mitchellJob.customerName,
            done: false,
          }),
        );
      } else if (appBridge.isDesktop()) {
        operations.push(
          appBridge.ensureRoFolderForJob({
            roNumber: mitchellJob.roNumber,
            customerName: mitchellJob.customerName,
            done: false,
          }),
        );
      }

      operations.push(
        updateDoc(jobDoc(existing.id), {
          ...nextData,
          updatedAt: serverTimestamp(),
        }),
      );
      return;
    }

    maxSortOrder += 1;
    if (appBridge.isDesktop()) {
      operations.push(
        appBridge.ensureRoFolderForJob({
          roNumber: mitchellJob.roNumber,
          customerName: mitchellJob.customerName,
          done: false,
        }),
      );
    }
    operations.push(
      addDoc(jobsCollection, withActiveShopFields({
        vehicle: mitchellJob.vehicle,
        roNumber: mitchellJob.roNumber,
        customerName: mitchellJob.customerName,
        phoneNumber: mitchellJob.phoneNumber,
        paintCode: '',
        amount: mitchellJob.amount,
        amountStatus: 'notFinal',
        status: mitchellJob.status,
        done: false,
        promiseDate: mitchellJob.promiseDate,
        partsWaiting: mitchellJob.partsWaiting,
        partsRequests: [],
        textNotes: [],
        photos: [],
        sortOrder: maxSortOrder,
        insuranceCompany: mitchellJob.insuranceCompany,
        claimNumber: mitchellJob.claimNumber,
        sourceSystem: 'mitchell',
        externalEstimateId: mitchellJob.estimateId,
        sourceJobUid: mitchellJob.jobUid,
        sourceEstimateId: mitchellJob.estimateId,
        sourceOpportunityNumber: mitchellJob.opportunityNumber,
        mitchellEstimatorName: mitchellJob.estimatorName,
        mitchellInsuranceCompany: mitchellJob.insuranceCompany,
        mitchellClaimNumber: mitchellJob.claimNumber,
        mitchellDepartmentName: mitchellJob.departmentName,
        mitchellLeadTechName: mitchellJob.leadTechName,
        mitchellProductionStatus: mitchellJob.productionStatus,
        mitchellLastSourceModifiedAt: mitchellJob.lastModifiedAt,
        mitchellSourcePath: snapshot.sourcePath,
        lastMitchellSyncAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })),
    );
  });

  const mitchellJobsToClose = existingJobs.filter((entry) => {
    if (isSoftDeletedJob(entry.data)) {
      return false;
    }

    if (Boolean(entry.data.done)) {
      return false;
    }

    if (!isMitchellManagedJob(entry.data)) {
      return false;
    }

    return !matchedExistingJobIds.has(entry.id);
  });

  mitchellJobsToClose.forEach((entry) => {
    if (appBridge.isDesktop()) {
      operations.push(
        appBridge.moveRoFolderForJob({
          roNumber: String(entry.data.roNumber ?? ''),
          customerName: String(entry.data.customerName ?? ''),
          done: true,
        }),
      );
    }

    operations.push(
      updateDoc(jobDoc(entry.id), withActiveShopFields({
        done: true,
        status: 'done',
        lastMitchellSyncAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })),
    );
  });

  await Promise.all(operations);
}

export async function setActiveJobPriority(
  activeJobs: Job[],
  jobId: string,
  position: 'top' | 'bottom',
) {
  if (activeJobs.length < 2) return;

  const normalizedJobs = [...activeJobs].map((job, index) => ({
    ...job,
    sortOrder: index + 1,
  }));

  const currentIndex = normalizedJobs.findIndex((job) => job.id === jobId);
  if (currentIndex === -1) return;

  const reordered = [...normalizedJobs];
  const [movedJob] = reordered.splice(currentIndex, 1);

  if (position === 'top') {
    reordered.unshift(movedJob);
  } else {
    reordered.push(movedJob);
  }

  const batch = writeBatch(db);

  reordered.forEach((job, index) => {
    batch.update(jobDoc(job.id), withActiveShopFields({
      sortOrder: index + 1,
      updatedAt: serverTimestamp(),
    }));
  });

  await batch.commit();
}

export async function setActiveJobPosition(
  activeJobs: Job[],
  jobId: string,
  targetPosition: number,
) {
  if (activeJobs.length < 2) return;

  const normalizedJobs = [...activeJobs].map((job, index) => ({
    ...job,
    sortOrder: index + 1,
  }));

  const currentIndex = normalizedJobs.findIndex((job) => job.id === jobId);
  if (currentIndex === -1) return;

  const nextIndex = Math.max(0, Math.min(targetPosition - 1, normalizedJobs.length - 1));
  if (currentIndex === nextIndex) return;

  const reordered = [...normalizedJobs];
  const [movedJob] = reordered.splice(currentIndex, 1);
  reordered.splice(nextIndex, 0, movedJob);

  const batch = writeBatch(db);

  reordered.forEach((job, index) => {
    batch.update(jobDoc(job.id), withActiveShopFields({
      sortOrder: index + 1,
      updatedAt: serverTimestamp(),
    }));
  });

  await batch.commit();
}

export async function updateJobStatus(jobId: string, status: JobStatus) {
  await updateDoc(jobDoc(jobId), withActiveShopFields({
    status,
    updatedAt: serverTimestamp(),
  }));
}

export async function updateJobDetails(
  jobId: string,
  input: UpdateJobDetailsInput,
) {
  const payload: Record<string, unknown> = withActiveShopFields({
    updatedAt: serverTimestamp(),
  });

  if (input.roNumber !== undefined) payload.roNumber = input.roNumber.trim();
  if (input.customerName !== undefined) payload.customerName = input.customerName.trim();
  if (input.vehicle !== undefined) payload.vehicle = input.vehicle.trim();
  if (input.phoneNumber !== undefined) {
    const phoneNumber = input.phoneNumber.trim();
    payload.phoneNumber = phoneNumber;
    payload.customerPhone = phoneNumber;
  }
  if (input.customerEmail !== undefined) payload.customerEmail = input.customerEmail.trim();
  if (input.status !== undefined) payload.status = input.status;
  if (input.paintCode !== undefined) payload.paintCode = input.paintCode.trim();
  if (input.amount !== undefined) payload.amount = input.amount;
  if (input.amountStatus !== undefined) payload.amountStatus = input.amountStatus;
  if (input.promiseDate !== undefined) payload.promiseDate = input.promiseDate;
  if (input.insuranceCompany !== undefined) {
    const insuranceCompany = input.insuranceCompany.trim();
    payload.insuranceCompany = insuranceCompany;
    payload.mitchellInsuranceCompany = insuranceCompany;
  }
  if (input.claimNumber !== undefined) {
    const claimNumber = input.claimNumber.trim();
    payload.claimNumber = claimNumber;
    payload.mitchellClaimNumber = claimNumber;
  }
  if (input.policyNumber !== undefined) payload.policyNumber = input.policyNumber.trim();

  await updateDoc(jobDoc(jobId), payload);
}

export async function markJobDone(jobId: string) {
  const jobSnapshot = await getDoc(jobDoc(jobId));
  const jobData = jobSnapshot.data() as Record<string, any> | undefined;

  if (appBridge.isDesktop() && jobData?.roNumber) {
    await appBridge.moveRoFolderForJob({
      roNumber: String(jobData.roNumber ?? ''),
      customerName: String(jobData.customerName ?? ''),
      done: true,
    });
  }

  await updateDoc(jobDoc(jobId), withActiveShopFields({
    done: true,
    status: 'done',
    updatedAt: serverTimestamp(),
  }));
}

export async function undoJobDone(jobId: string) {
  const jobSnapshot = await getDoc(jobDoc(jobId));
  const jobData = jobSnapshot.data() as Record<string, any> | undefined;

  if (appBridge.isDesktop() && jobData?.roNumber) {
    await appBridge.moveRoFolderForJob({
      roNumber: String(jobData.roNumber ?? ''),
      customerName: String(jobData.customerName ?? ''),
      done: false,
    });
  }

  await updateDoc(jobDoc(jobId), withActiveShopFields({
    done: false,
    status: 'inProgress',
    updatedAt: serverTimestamp(),
  }));
}

export async function deleteJob(jobId: string) {
  const jobSnapshot = await getDoc(jobDoc(jobId));
  const jobData = jobSnapshot.data() as Record<string, any> | undefined;

  if (appBridge.isDesktop() && jobData?.roNumber) {
    await appBridge.moveRoFolderForJob({
      roNumber: String(jobData.roNumber ?? ''),
      customerName: String(jobData.customerName ?? ''),
      done: true,
    });
  }

  await updateDoc(jobDoc(jobId), {
    done: true,
    status: 'done',
    deletedAt: new Date().toISOString(),
    ...withActiveShopFields({}),
    updatedAt: serverTimestamp(),
  });
}

export async function addTextNoteToJob(job: Job, text: string) {
  const trimmed = text.trim();
  if (!trimmed) return;

  const createdAt = new Date().toISOString();

  if (appBridge.isDesktop() && job.roNumber) {
    await appBridge.saveJobTextNoteToRoFolder({
      roNumber: job.roNumber,
      customerName: job.customerName,
      done: job.done,
      text: trimmed,
      createdAt,
    });
  }

  const nextNotes: JobNote[] = [
    {
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: 'text',
      text: trimmed,
      createdAt,
      read: false,
    },
    ...job.textNotes,
  ];

  await updateDoc(jobDoc(job.id), withActiveShopFields({
    textNotes: nextNotes,
    updatedAt: serverTimestamp(),
  }));
}

export async function addAudioNoteToJob(job: Job, file: Blob) {
  const createdAt = new Date().toISOString();

  if (appBridge.isDesktop() && job.roNumber) {
    const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
    await appBridge.saveJobAudioToRoFolder({
      roNumber: job.roNumber,
      customerName: job.customerName,
      done: job.done,
      bytes,
      extension: getJobAudioExtension(file),
    });
  }

  const audioUrl = await uploadJobAudioNote(job.id, file);

  const nextNotes: JobNote[] = [
    {
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: 'audio',
      audioUrl,
      createdAt,
      read: false,
    },
    ...job.textNotes,
  ];

  await updateDoc(jobDoc(job.id), withActiveShopFields({
    textNotes: nextNotes,
    updatedAt: serverTimestamp(),
  }));
}

export async function markJobNotesRead(job: Job) {
  const hasUnread = job.textNotes.some((note) => !note.read);
  if (!hasUnread) return;

  const nextNotes: JobNote[] = job.textNotes.map((note) => ({
    ...note,
    read: true,
  }));

  await updateDoc(jobDoc(job.id), withActiveShopFields({
    textNotes: nextNotes,
    updatedAt: serverTimestamp(),
  }));
}

export async function deleteJobNote(job: Job, noteId: string) {
  const targetNote = job.textNotes.find((note) => note.id === noteId);
  if (!targetNote) return;

  if (targetNote.type === 'audio' && targetNote.audioUrl) {
    await deleteStorageFile(targetNote.audioUrl);
  }

  const nextNotes = job.textNotes.filter((note) => note.id !== noteId);

  await updateDoc(jobDoc(job.id), withActiveShopFields({
    textNotes: nextNotes,
    updatedAt: serverTimestamp(),
  }));
}

export async function addPhotoToJob(
  job: Job,
  input: {
    file: Blob;
    width: number;
    height: number;
    fileSize: number;
    timestampIncluded: boolean;
  },
) {
  const url = await uploadJobPhoto(job.id, input.file, {
    roNumber: job.roNumber,
    customerName: job.customerName,
    done: job.done,
  });

  const nextPhotos: JobPhoto[] = [
    {
      id: `photo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      url,
      createdAt: new Date().toISOString(),
      fileSize: input.fileSize,
      width: input.width,
      height: input.height,
      timestampIncluded: input.timestampIncluded,
    },
    ...(job.photos ?? []),
  ];

  await withTimeout(
    updateDoc(jobDoc(job.id), withActiveShopFields({
      photos: nextPhotos,
      updatedAt: serverTimestamp(),
    })),
    FIRESTORE_WRITE_TIMEOUT_MS,
    'Saving the photo in Shop Keeper took too long. Please try again.',
  );
}

export async function deletePhotoFromJob(job: Job, photoId: string) {
  const targetPhoto = (job.photos ?? []).find((photo) => photo.id === photoId);
  if (!targetPhoto) return;

  await deleteStorageFile(targetPhoto.url);

  const nextPhotos = (job.photos ?? []).filter((photo) => photo.id !== photoId);

  await updateDoc(jobDoc(job.id), withActiveShopFields({
    photos: nextPhotos,
    updatedAt: serverTimestamp(),
  }));
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
) {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    promise.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

export async function requestPartForJob(
  job: Job,
  input: {
    name: string;
    quantity: string;
    note?: string;
    requestedBy: AppMode;
    status?: Exclude<JobPartRequest['status'], 'received'>;
  },
) {
  const name = input.name.trim();
  const quantity = input.quantity.trim();
  const note = input.note?.trim() ?? '';

  if (!name || !quantity) return;

  const nextPartsRequests: JobPartRequest[] = [
    {
      id: `part-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      quantity,
      kind: 'part',
      requestedBy: input.requestedBy,
      status: input.status ?? 'requested',
      note,
      createdAt: new Date().toISOString(),
    },
    ...(job.partsRequests ?? []),
  ];

  await updateDoc(jobDoc(job.id), withActiveShopFields({
    partsWaiting: true,
    partsRequests: nextPartsRequests.map(toFirestorePartRequest),
    updatedAt: serverTimestamp(),
  }));
}

export async function clearLegacyPartsWaiting(jobId: string) {
  await updateDoc(jobDoc(jobId), withActiveShopFields({
    partsWaiting: false,
    updatedAt: serverTimestamp(),
  }));
}

export async function markJobPartReceived(job: Job, partId: string) {
  await updateJobPartStatus(job, partId, 'received');
}

export async function updateJobPartStatus(
  job: Job,
  partId: string,
  status: JobPartRequest['status'],
) {
  const nextPartsRequests = (job.partsRequests ?? []).map((part) =>
    part.id === partId
      ? {
          ...part,
          status,
          ...(status === 'received'
            ? { receivedAt: new Date().toISOString() }
            : {}),
        }
      : part,
  );

  const stillWaiting = hasOpenParts(nextPartsRequests);

  await updateDoc(jobDoc(job.id), withActiveShopFields({
    partsWaiting: stillWaiting,
    partsRequests: nextPartsRequests.map(toFirestorePartRequest),
    updatedAt: serverTimestamp(),
  }));
}

export async function saveJobPartNote(
  job: Job,
  partId: string,
  note: string,
) {
  const trimmed = note.trim();

  const nextPartsRequests = (job.partsRequests ?? []).map((part) =>
    part.id === partId
      ? {
          ...part,
          note: trimmed,
        }
      : part,
  );

  await updateDoc(jobDoc(job.id), withActiveShopFields({
    partsRequests: nextPartsRequests.map(toFirestorePartRequest),
    updatedAt: serverTimestamp(),
  }));
}

export async function saveJobPartInvoice(
  job: Job,
  partId: string,
  invoiceNumber: string,
) {
  const trimmed = invoiceNumber.trim();
  const nextPartsRequests = (job.partsRequests ?? []).map((part) =>
    part.id === partId
      ? {
          ...part,
          invoiceNumber: trimmed,
        }
      : part,
  );

  await updateDoc(jobDoc(job.id), withActiveShopFields({
    partsRequests: nextPartsRequests.map(toFirestorePartRequest),
    updatedAt: serverTimestamp(),
  }));
}

export async function markJobPartPaid(
  job: Job,
  partId: string,
  invoiceNumber?: string,
) {
  const nextPartsRequests = (job.partsRequests ?? []).map((part) =>
    part.id === partId
      ? {
          ...part,
          invoiceNumber:
            invoiceNumber !== undefined
              ? invoiceNumber.trim()
              : part.invoiceNumber ?? '',
          paidAt: new Date().toISOString(),
        }
      : part,
  );

  await updateDoc(jobDoc(job.id), withActiveShopFields({
    partsRequests: nextPartsRequests.map(toFirestorePartRequest),
    updatedAt: serverTimestamp(),
  }));
}

export async function deleteJobPart(job: Job, partId: string) {
  const nextPartsRequests = (job.partsRequests ?? []).filter((part) => part.id !== partId);
  const stillWaiting = hasOpenParts(nextPartsRequests);

  await updateDoc(jobDoc(job.id), withActiveShopFields({
    partsWaiting: stillWaiting,
    partsRequests: nextPartsRequests.map(toFirestorePartRequest),
    updatedAt: serverTimestamp(),
  }));
}
