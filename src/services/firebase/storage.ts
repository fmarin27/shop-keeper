import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from './config';
import { appBridge } from '../platform/appBridge';

const DESKTOP_FOLDER_WRITE_TIMEOUT_MS = 15000;
const STORAGE_UPLOAD_TIMEOUT_MS = 20000;

export async function uploadJobAudioNote(jobId: string, file: Blob) {
  const extension = getAudioExtension(file.type);
  const fileName = `audio-${Date.now()}.${extension}`;
  const fileRef = ref(storage, `jobs/${jobId}/audio-notes/${fileName}`);

  await withTimeout(
    uploadBytes(fileRef, file, {
      contentType: file.type || getContentTypeFromExtension(extension),
    }),
    STORAGE_UPLOAD_TIMEOUT_MS,
    'Audio upload timed out. Please try again.',
  );

  return getDownloadURL(fileRef);
}

export async function uploadGeneralMessageAudio(file: Blob) {
  const extension = getAudioExtension(file.type);
  const fileName = `audio-${Date.now()}.${extension}`;
  const fileRef = ref(storage, `generalMessages/audio/${fileName}`);

  await withTimeout(
    uploadBytes(fileRef, file, {
      contentType: file.type || getContentTypeFromExtension(extension),
    }),
    STORAGE_UPLOAD_TIMEOUT_MS,
    'Audio upload timed out. Please try again.',
  );

  return getDownloadURL(fileRef);
}

export function getJobAudioExtension(file: Blob) {
  return getAudioExtension(file.type);
}

export async function uploadJobPhoto(
  jobId: string,
  file: Blob,
  options?: {
    roNumber?: string;
    customerName?: string;
    done?: boolean;
  },
) {
  if (appBridge.isDesktop() && options?.roNumber) {
    const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
    await withTimeout(
      appBridge.saveJobPhotoToRoFolder({
        roNumber: options.roNumber,
        customerName: options.customerName ?? '',
        done: options.done ?? false,
        bytes,
      }),
      DESKTOP_FOLDER_WRITE_TIMEOUT_MS,
      'Saving the photo into the RO folder took too long.',
    );
  }

  const fileName = `photo-${Date.now()}.jpg`;
  const fileRef = ref(storage, `jobs/${jobId}/photos/${fileName}`);

  await withTimeout(
    uploadBytes(fileRef, file, {
      contentType: 'image/jpeg',
    }),
    STORAGE_UPLOAD_TIMEOUT_MS,
    'Photo upload timed out. Please try again.',
  );

  return getDownloadURL(fileRef);
}

export async function uploadLeadPhoto(leadId: string, file: Blob) {
  const fileName = `photo-${Date.now()}.jpg`;
  const fileRef = ref(storage, `leads/${leadId}/photos/${fileName}`);

  await withTimeout(
    uploadBytes(fileRef, file, {
      contentType: 'image/jpeg',
    }),
    STORAGE_UPLOAD_TIMEOUT_MS,
    'Photo upload timed out. Please try again.',
  );

  return getDownloadURL(fileRef);
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
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
