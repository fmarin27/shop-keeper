import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from './config';
import { uploadJobAudioNote, uploadJobPhoto } from './storage';
import type {
  AppMode,
  CreateJobInput,
  Job,
  JobNote,
  JobPhoto,
  JobPartRequest,
  JobStatus,
  UpdateJobDetailsInput,
} from '../../types/app';

const jobsCollection = collection(db, 'jobs');

type FirestoreJobInput = Omit<Job, 'id'>;

function toFirestorePartRequest(part: JobPartRequest) {
  return {
    id: part.id,
    name: part.name,
    quantity: part.quantity,
    requestedBy: part.requestedBy,
    status: part.status,
    note: part.note ?? '',
    createdAt: part.createdAt,
    ...(part.receivedAt ? { receivedAt: part.receivedAt } : {}),
  };
}

export function subscribeToJobs(callback: (jobs: Job[]) => void) {
  const q = query(jobsCollection, orderBy('createdAt', 'desc'));

  return onSnapshot(q, (snapshot) => {
    const jobsWithIndex: Array<{ job: Job; index: number }> = snapshot.docs.map(
      (snap, index) => {
        const data = snap.data() as any;

        return {
          index,
          job: {
            id: snap.id,
            vehicle: data.vehicle ?? '',
            roNumber: data.roNumber ?? '',
            customerName: data.customerName ?? '',
            customerPhone: data.customerPhone ?? '',
            customerEmail: data.customerEmail ?? '',
            paintCode: data.paintCode ?? '',
            amount: data.amount ?? 0,
            amountStatus: data.amountStatus ?? 'notFinal',
            status: data.status ?? 'notStarted',
            done: data.done ?? false,
            promiseDate: data.promiseDate ?? '',
            partsWaiting: data.partsWaiting ?? false,
            partsRequests: Array.isArray(data.partsRequests)
              ? (data.partsRequests as JobPartRequest[])
              : [],
            textNotes: (data.textNotes ?? []) as JobNote[],
            photos: (data.photos ?? []) as JobPhoto[],
            sortOrder:
              typeof data.sortOrder === 'number' ? data.sortOrder : undefined,
            sourceSystem: data.sourceSystem ?? '',
            externalEstimateId: data.externalEstimateId ?? '',
            insuranceCompany: data.insuranceCompany ?? '',
            claimNumber: data.claimNumber ?? '',
            policyNumber: data.policyNumber ?? '',
            vehicleYear: data.vehicleYear ?? '',
            vehicleMake: data.vehicleMake ?? '',
            vehicleModel: data.vehicleModel ?? '',
            vehicleVin: data.vehicleVin ?? '',
            vehicleColor: data.vehicleColor ?? '',
            estimateTotals: data.estimateTotals,
            estimateLines: Array.isArray(data.estimateLines)
              ? data.estimateLines
              : [],
            emsLineItemCount:
              typeof data.emsLineItemCount === 'number'
                ? data.emsLineItemCount
                : undefined,
            lastEmsSyncAt: data.lastEmsSyncAt ?? '',
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
  await addDoc(jobsCollection, {
    ...job,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
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

  await addDoc(jobsCollection, {
    vehicle: input.vehicle.trim(),
    roNumber: input.roNumber.trim(),
    customerName: input.customerName.trim(),
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
  });
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
    batch.update(doc(db, 'jobs', job.id), {
      sortOrder: index + 1,
      updatedAt: serverTimestamp(),
    });
  });

  await batch.commit();
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
    batch.update(doc(db, 'jobs', job.id), {
      sortOrder: index + 1,
      updatedAt: serverTimestamp(),
    });
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
    batch.update(doc(db, 'jobs', job.id), {
      sortOrder: index + 1,
      updatedAt: serverTimestamp(),
    });
  });

  await batch.commit();
}

export async function updateJobStatus(jobId: string, status: JobStatus) {
  await updateDoc(doc(db, 'jobs', jobId), {
    status,
    updatedAt: serverTimestamp(),
  });
}

export async function updateJobDetails(
  jobId: string,
  input: UpdateJobDetailsInput,
) {
  await updateDoc(doc(db, 'jobs', jobId), {
    paintCode: input.paintCode.trim(),
    amount: input.amount,
    amountStatus: input.amountStatus,
    promiseDate: input.promiseDate,
    updatedAt: serverTimestamp(),
  });
}

export async function markJobDone(jobId: string) {
  await updateDoc(doc(db, 'jobs', jobId), {
    done: true,
    status: 'done',
    updatedAt: serverTimestamp(),
  });
}

export async function undoJobDone(jobId: string) {
  await updateDoc(doc(db, 'jobs', jobId), {
    done: false,
    status: 'inProgress',
    updatedAt: serverTimestamp(),
  });
}

export async function addTextNoteToJob(job: Job, text: string) {
  const trimmed = text.trim();
  if (!trimmed) return;

  const nextNotes: JobNote[] = [
    {
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: 'text',
      text: trimmed,
      createdAt: new Date().toISOString(),
      read: false,
    },
    ...job.textNotes,
  ];

  await updateDoc(doc(db, 'jobs', job.id), {
    textNotes: nextNotes,
    updatedAt: serverTimestamp(),
  });
}

export async function addAudioNoteToJob(job: Job, file: Blob) {
  const audioUrl = await uploadJobAudioNote(job.id, file);

  const nextNotes: JobNote[] = [
    {
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: 'audio',
      audioUrl,
      createdAt: new Date().toISOString(),
      read: false,
    },
    ...job.textNotes,
  ];

  await updateDoc(doc(db, 'jobs', job.id), {
    textNotes: nextNotes,
    updatedAt: serverTimestamp(),
  });
}

export async function markJobNotesRead(job: Job) {
  const hasUnread = job.textNotes.some((note) => !note.read);
  if (!hasUnread) return;

  const nextNotes: JobNote[] = job.textNotes.map((note) => ({
    ...note,
    read: true,
  }));

  await updateDoc(doc(db, 'jobs', job.id), {
    textNotes: nextNotes,
    updatedAt: serverTimestamp(),
  });
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
  const url = await uploadJobPhoto(job.id, input.file);

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

  await updateDoc(doc(db, 'jobs', job.id), {
    photos: nextPhotos,
    updatedAt: serverTimestamp(),
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
      requestedBy: input.requestedBy,
      status: input.status ?? 'requested',
      note,
      createdAt: new Date().toISOString(),
    },
    ...(job.partsRequests ?? []),
  ];

  await updateDoc(doc(db, 'jobs', job.id), {
    partsWaiting: true,
    partsRequests: nextPartsRequests.map(toFirestorePartRequest),
    updatedAt: serverTimestamp(),
  });
}

export async function clearLegacyPartsWaiting(jobId: string) {
  await updateDoc(doc(db, 'jobs', jobId), {
    partsWaiting: false,
    updatedAt: serverTimestamp(),
  });
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

  const stillWaiting = nextPartsRequests.some((part) => part.status !== 'received');

  await updateDoc(doc(db, 'jobs', job.id), {
    partsWaiting: stillWaiting,
    partsRequests: nextPartsRequests.map(toFirestorePartRequest),
    updatedAt: serverTimestamp(),
  });
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

  await updateDoc(doc(db, 'jobs', job.id), {
    partsRequests: nextPartsRequests.map(toFirestorePartRequest),
    updatedAt: serverTimestamp(),
  });
}
