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
import type {
  GeneralMessage,
  MessageAudienceMode,
} from '../../features/messages/types';

const messagesCollection = collection(db, 'generalMessages');

type GeneralMessageWithAudio = GeneralMessage & {
  audioUrl?: string;
};

export function subscribeToGeneralMessages(
  appMode: MessageAudienceMode,
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
        closedAt:
          typeof data.closedAt === 'string'
            ? data.closedAt
            : data.closedAt?.toDate?.()?.toISOString?.() ?? '',
        important: data.important ?? false,
        unread:
          appMode === 'manager'
            ? data.unreadByManager ?? data.unread ?? false
            : data.unreadByTech ?? data.unread ?? false,
        createdBy: data.createdBy ?? 'manager',
        unreadByManager: data.unreadByManager ?? data.unread ?? false,
        unreadByTech: data.unreadByTech ?? data.unread ?? false,
      };
    });

    callback(items);
  });
}

export async function addTextGeneralMessage(
  text: string,
  createdBy: MessageAudienceMode,
) {
  const trimmed = text.trim();
  if (!trimmed) return;

  await addDoc(messagesCollection, {
    type: 'text',
    text: trimmed,
    createdBy,
    unread: createdBy === 'tech',
    unreadByManager: createdBy === 'tech',
    unreadByTech: createdBy === 'manager',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function addAudioGeneralMessage(
  file: Blob,
  createdBy: MessageAudienceMode,
) {
  const audioUrl = await uploadGeneralMessageAudio(file);

  await addDoc(messagesCollection, {
    type: 'audio',
    text: 'Audio message',
    audioUrl,
    createdBy,
    unread: createdBy === 'tech',
    unreadByManager: createdBy === 'tech',
    unreadByTech: createdBy === 'manager',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function markGeneralMessageRead(
  id: string,
  appMode: MessageAudienceMode,
) {
  await updateDoc(doc(db, 'generalMessages', id), appMode === 'manager'
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

export async function archiveGeneralMessage(id: string) {
  await updateDoc(doc(db, 'generalMessages', id), {
    closedAt: serverTimestamp(),
    unread: false,
    unreadByManager: false,
    unreadByTech: false,
    updatedAt: serverTimestamp(),
  });
}

export async function reopenGeneralMessage(id: string) {
  await updateDoc(doc(db, 'generalMessages', id), {
    closedAt: null,
    updatedAt: serverTimestamp(),
  });
}

export async function setGeneralMessageImportant(id: string, important: boolean) {
  await updateDoc(doc(db, 'generalMessages', id), {
    important,
    updatedAt: serverTimestamp(),
  });
}
