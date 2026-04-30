import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  doc,
} from 'firebase/firestore';
import { db } from './config';
import { deleteStorageFile, uploadLeadPhoto } from './storage';
import type { CreateLeadInput, Lead, LeadPhoto, LeadStatus, LeadUpdate } from '../../types/app';

const leadsCollection = collection(db, 'leads');

export function subscribeToLeads(callback: (leads: Lead[]) => void) {
  const q = query(leadsCollection, orderBy('createdAt', 'desc'));

  return onSnapshot(q, (snapshot) => {
    callback(
      snapshot.docs.map((snap) => {
        const data = snap.data() as any;

        return {
          id: snap.id,
          customerName: data.customerName ?? '',
          phoneNumber: data.phoneNumber ?? '',
          vehicle: data.vehicle ?? '',
          insuranceCompany: data.insuranceCompany ?? '',
          source: data.source ?? '',
          estimatedValue: data.estimatedValue ?? 0,
          followUpDate: data.followUpDate ?? '',
          status: data.status ?? 'new',
          notes: data.notes ?? '',
          updates: Array.isArray(data.updates) ? (data.updates as LeadUpdate[]) : [],
          photos: Array.isArray(data.photos) ? (data.photos as LeadPhoto[]) : [],
          createdAt: data.createdAt?.toDate
            ? data.createdAt.toDate().toISOString()
            : data.createdAt ?? new Date().toISOString(),
          updatedAt: data.updatedAt?.toDate
            ? data.updatedAt.toDate().toISOString()
            : data.updatedAt,
        } satisfies Lead;
      }),
    );
  });
}

export async function createLead(input: CreateLeadInput) {
  const leadRef = await addDoc(leadsCollection, {
    customerName: input.customerName.trim(),
    phoneNumber: input.phoneNumber.trim(),
    vehicle: input.vehicle.trim(),
    insuranceCompany: input.insuranceCompany.trim(),
    source: input.source.trim(),
    estimatedValue: Number.isFinite(input.estimatedValue) ? input.estimatedValue : 0,
    followUpDate: input.followUpDate,
    status: input.status,
    notes: input.notes.trim(),
    updates: [],
    photos: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return leadRef.id;
}

export async function updateLeadStatus(leadId: string, status: LeadStatus) {
  await updateDoc(doc(db, 'leads', leadId), {
    status,
    updatedAt: serverTimestamp(),
  });
}

export async function updateLeadDetails(
  leadId: string,
  input: CreateLeadInput,
) {
  await updateDoc(doc(db, 'leads', leadId), {
    customerName: input.customerName.trim(),
    phoneNumber: input.phoneNumber.trim(),
    vehicle: input.vehicle.trim(),
    insuranceCompany: input.insuranceCompany.trim(),
    source: input.source.trim(),
    estimatedValue: Number.isFinite(input.estimatedValue) ? input.estimatedValue : 0,
    followUpDate: input.followUpDate,
    status: input.status,
    notes: input.notes.trim(),
    updatedAt: serverTimestamp(),
  });
}

export async function addLeadUpdate(lead: Lead, text: string) {
  const trimmed = text.trim();
  if (!trimmed) return;

  const nextUpdates: LeadUpdate[] = [
    {
      id: `lead-update-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      text: trimmed,
      createdAt: new Date().toISOString(),
    },
    ...(lead.updates ?? []),
  ];

  await updateDoc(doc(db, 'leads', lead.id), {
    updates: nextUpdates,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteLeadUpdate(lead: Lead, updateId: string) {
  const nextUpdates = (lead.updates ?? []).filter((update) => update.id !== updateId);

  await updateDoc(doc(db, 'leads', lead.id), {
    updates: nextUpdates,
    updatedAt: serverTimestamp(),
  });
}

export async function addPhotoToLead(
  lead: Pick<Lead, 'id' | 'photos'>,
  input: {
    blob: Blob;
    width: number;
    height: number;
    fileSize: number;
    timestampIncluded: boolean;
  },
) {
  const url = await uploadLeadPhoto(lead.id, input.blob);

  const nextPhotos: LeadPhoto[] = [
    {
      id: `lead-photo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      url,
      createdAt: new Date().toISOString(),
      fileSize: input.fileSize,
      width: input.width,
      height: input.height,
      timestampIncluded: input.timestampIncluded,
    },
    ...(lead.photos ?? []),
  ];

  await updateDoc(doc(db, 'leads', lead.id), {
    photos: nextPhotos,
    updatedAt: serverTimestamp(),
  });
}

export async function deletePhotoFromLead(lead: Pick<Lead, 'id' | 'photos'>, photoId: string) {
  const targetPhoto = (lead.photos ?? []).find((photo) => photo.id === photoId);
  if (!targetPhoto) return;

  await deleteStorageFile(targetPhoto.url);

  const nextPhotos = (lead.photos ?? []).filter((photo) => photo.id !== photoId);

  await updateDoc(doc(db, 'leads', lead.id), {
    photos: nextPhotos,
    updatedAt: serverTimestamp(),
  });
}
