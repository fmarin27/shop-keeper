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
import type { CreateLeadInput, Lead, LeadStatus, LeadUpdate } from '../../types/app';

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
  await addDoc(leadsCollection, {
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
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
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
