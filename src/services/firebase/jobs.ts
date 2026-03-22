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
import { uploadJobAudioNote } from './storage';
import type { CreateJobInput, Job, JobNote, JobStatus } from '../../types/app';

const jobsCollection = collection(db, 'jobs');

type FirestoreJobInput = Omit<Job, 'id'>;

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
            amount: data.amount ?? 0,
            amountStatus: data.amountStatus ?? 'notFinal',
            status: data.status ?? 'notStarted',
            done: data.done ?? false,
            promiseDate: data.promiseDate ?? '',
            partsWaiting: data.partsWaiting ?? false,
            textNotes: (data.textNotes ?? []) as JobNote[],
            sortOrder:
              typeof data.sortOrder === 'number' ? data.sortOrder : undefined,
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

  await addDoc(jobsCollection, {
    vehicle: input.vehicle.trim(),
    roNumber: input.roNumber.trim(),
    customerName: input.customerName.trim(),
    amount: Number.isFinite(input.amount) ? input.amount : 0,
    amountStatus: input.amountStatus,
    status: input.status,
    done: false,
    promiseDate: input.promiseDate,
    partsWaiting: input.partsWaiting,
    textNotes: notes,
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

  const normalizedJobs = [...activeJobs]
    .sort((a, b) => {
      const aOrder =
        typeof a.sortOrder === 'number' ? a.sortOrder : Number.MAX_SAFE_INTEGER;
      const bOrder =
        typeof b.sortOrder === 'number' ? b.sortOrder : Number.MAX_SAFE_INTEGER;

      if (aOrder !== bOrder) return aOrder - bOrder;
      return 0;
    })
    .map((job, index) => ({
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

export async function updateJobStatus(jobId: string, status: JobStatus) {
  await updateDoc(doc(db, 'jobs', jobId), {
    status,
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