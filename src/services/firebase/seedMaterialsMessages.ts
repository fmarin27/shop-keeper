import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from './config';
import { mockGeneralMessages, mockMaterials } from '../../features/messages/mockMessages';

export async function seedInitialMaterialsAndMessages() {
  for (const item of mockMaterials) {
    const { id: _id, ...rest } = item;
    await addDoc(collection(db, 'materials'), {
      ...rest,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  for (const msg of mockGeneralMessages) {
    const { id: _id, ...rest } = msg;
    await addDoc(collection(db, 'generalMessages'), {
      ...rest,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}