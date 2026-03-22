import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from './config';

export async function uploadJobAudioNote(jobId: string, file: Blob) {
  const extension = getAudioExtension(file.type);
  const fileName = `audio-${Date.now()}.${extension}`;
  const fileRef = ref(storage, `jobs/${jobId}/audio-notes/${fileName}`);

  await uploadBytes(fileRef, file, {
    contentType: file.type || getContentTypeFromExtension(extension),
  });

  return getDownloadURL(fileRef);
}

export async function uploadGeneralMessageAudio(file: Blob) {
  const extension = getAudioExtension(file.type);
  const fileName = `audio-${Date.now()}.${extension}`;
  const fileRef = ref(storage, `generalMessages/audio/${fileName}`);

  await uploadBytes(fileRef, file, {
    contentType: file.type || getContentTypeFromExtension(extension),
  });

  return getDownloadURL(fileRef);
}

function getAudioExtension(contentType: string) {
  const normalized = contentType.toLowerCase();

  if (normalized.includes('ogg')) return 'ogg';
  if (normalized.includes('mp4') || normalized.includes('m4a')) return 'm4a';
  if (normalized.includes('webm')) return 'webm';

  return 'webm';
}

function getContentTypeFromExtension(extension: string) {
  switch (extension) {
    case 'ogg':
      return 'audio/ogg';
    case 'm4a':
      return 'audio/mp4';
    case 'webm':
    default:
      return 'audio/webm';
  }
}