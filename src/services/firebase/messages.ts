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
import { uploadGeneralMessageAudio } from './storage';
import type { GeneralMessage } from '../../features/messages/mockMessages';

const messagesCollection = collection(db, 'generalMessages');

type GeneralMessageWithAudio = GeneralMessage & {
  audioUrl?: string;
};

export function subscribeToGeneralMessages(
  callback: (items: GeneralMessageWithAudio[]) => void,
) {
  const q = query(messagesCollection, orderBy('createdAt', 'desc'));

  return onSnapshot(q, (snapshot) => {
    const items: GeneralMessageWithAudio[] = snapshot.docs.map((snap) => {
      const data = snap.data() as any;

      return {
        id: snap.id,
        type: data.type ?? 'text',
        text: data.text ?? '',
        audioUrl: data.audioUrl ?? '',
        createdAt:
          typeof data.createdAt === 'string'
            ? data.createdAt
            : data.createdAt?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
        unread: data.unread ?? false,
      };
    });

    callback(items);
  });
}

export async function addTextGeneralMessage(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return;

  await addDoc(messagesCollection, {
    type: 'text',
    text: trimmed,
    unread: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function addAudioGeneralMessage(file: Blob) {
  const audioUrl = await uploadGeneralMessageAudio(file);

  await addDoc(messagesCollection, {
    type: 'audio',
    text: 'Audio message',
    audioUrl,
    unread: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function markGeneralMessageRead(id: string) {
  await updateDoc(doc(db, 'generalMessages', id), {
    unread: false,
    updatedAt: serverTimestamp(),
  });
}