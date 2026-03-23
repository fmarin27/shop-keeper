import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from './config';
import type {
  MaterialRequest,
  MaterialStatus,
} from '../../features/messages/types';

const materialsCollection = collection(db, 'materials');

export function subscribeToMaterials(
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
        unread: data.unread ?? false,
        status: data.status ?? 'requested',
      };
    });

    callback(items);
  });
}

export async function addMaterialRequest(
  itemName: string,
  quantity: string,
  note: string,
) {
  const name = itemName.trim();
  const qty = quantity.trim();

  if (!name || !qty) return;

  await addDoc(materialsCollection, {
    itemName: name,
    quantity: qty,
    note: note.trim() || '',
    unread: true,
    status: 'requested',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateMaterialStatus(
  id: string,
  status: MaterialStatus,
) {
  await updateDoc(doc(db, 'materials', id), {
    status,
    unread: false,
    updatedAt: serverTimestamp(),
  });
}

export async function markMaterialRead(id: string) {
  await updateDoc(doc(db, 'materials', id), {
    unread: false,
    updatedAt: serverTimestamp(),
  });
}
