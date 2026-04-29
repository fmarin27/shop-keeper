import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from './config';
import type {
  MaterialEmailStatus,
  MessageAudienceMode,
  MaterialRequest,
  MaterialStatus,
} from '../../features/messages/types';

const materialsCollection = collection(db, 'materials');

export function subscribeToMaterials(
  appMode: MessageAudienceMode,
  callback: (items: MaterialRequest[]) => void,
) {
  const q = query(materialsCollection, orderBy('createdAt', 'desc'));

  return onSnapshot(q, (snapshot) => {
    const items: MaterialRequest[] = snapshot.docs.map((snap) => {
      const data = snap.data() as any;

      return {
        id: snap.id,
        itemName: data.itemName ?? '',
        quantity: data.quantity ?? '',
        note: data.note ?? '',
        createdAt:
          typeof data.createdAt === 'string'
            ? data.createdAt
            : data.createdAt?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
        unread:
          appMode === 'manager'
            ? data.unreadByManager ?? data.unread ?? false
            : data.unreadByTech ?? data.unread ?? false,
        createdBy: data.createdBy ?? 'manager',
        unreadByManager: data.unreadByManager ?? data.unread ?? false,
        unreadByTech: data.unreadByTech ?? data.unread ?? false,
        emailStatus: data.emailStatus ?? undefined,
        emailSentAt:
          typeof data.emailSentAt === 'string'
            ? data.emailSentAt
            : data.emailSentAt?.toDate?.()?.toISOString?.() ?? '',
        emailConfirmedAt:
          typeof data.emailConfirmedAt === 'string'
            ? data.emailConfirmedAt
            : data.emailConfirmedAt?.toDate?.()?.toISOString?.() ?? '',
        emailReplyText: data.emailReplyText ?? '',
        status: data.status ?? 'requested',
        archived: data.archived ?? false,
      };
    });

    callback(items);
  });
}

export async function addMaterialRequest(
  itemName: string,
  quantity: string,
  note: string,
  createdBy: MessageAudienceMode,
) {
  const name = itemName.trim();
  const qty = quantity.trim();

  if (!name || !qty) return;

  const ref = await addDoc(materialsCollection, {
    itemName: name,
    quantity: qty,
    note: note.trim() || '',
    createdBy,
    unread: createdBy === 'tech',
    unreadByManager: createdBy === 'tech',
    unreadByTech: createdBy === 'manager',
    status: 'requested',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return ref.id;
}

export async function updateMaterialStatus(
  id: string,
  status: MaterialStatus,
) {
  await updateDoc(doc(db, 'materials', id), {
    status,
    unread: false,
    unreadByManager: false,
    unreadByTech: false,
    updatedAt: serverTimestamp(),
  });
}

export async function markMaterialRead(
  id: string,
  appMode: MessageAudienceMode,
) {
  await updateDoc(doc(db, 'materials', id), appMode === 'manager'
    ? {
        unread: false,
        unreadByManager: false,
        updatedAt: serverTimestamp(),
      }
    : {
        unreadByTech: false,
        updatedAt: serverTimestamp(),
      });
}

export async function setMaterialEmailStatus(
  id: string,
  status: MaterialEmailStatus,
  failureMessage?: string,
) {
  const payload: Record<string, unknown> = {
    emailStatus: status,
    emailReplyText: status === 'failed' ? failureMessage ?? '' : '',
    updatedAt: serverTimestamp(),
  };

  if (status === 'sent') {
    payload.emailSentAt = serverTimestamp();
  }

  await updateDoc(doc(db, 'materials', id), payload);
}

export async function setMaterialArchived(id: string, archived: boolean) {
  await updateDoc(doc(db, 'materials', id), {
    archived,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteMaterialRequest(id: string) {
  await deleteDoc(doc(db, 'materials', id));
}
