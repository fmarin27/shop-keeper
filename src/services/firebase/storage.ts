import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { ensureFirebaseSession, storage } from './config';
import { appBridge } from '../platform/appBridge';
import { scopedStoragePath } from './shopProfile';

const DESKTOP_FOLDER_WRITE_TIMEOUT_MS = 15000;
const DESKTOP_STORAGE_UPLOAD_TIMEOUT_MS = 20000;
const MOBILE_STORAGE_UPLOAD_TIMEOUT_MS = 60000;
const DESKTOP_DOWNLOAD_URL_TIMEOUT_MS = 15000;
const MOBILE_DOWNLOAD_URL_TIMEOUT_MS = 30000;

export async function uploadJobAudioNote(jobId: string, file: Blob) {
  await ensureFirebaseSession();
  const extension = getAudioExtension(file.type);
  const fileName = `audio-${Date.now()}.${extension}`;
  const fileRef = ref(storage, scopedStoragePath(`jobs/${jobId}/audio-notes/${fileName}`));

  await retryWithTimeout(
    () =>
      uploadBytes(fileRef, file, {
        contentType: file.type || getContentTypeFromExtension(extension),
      }),
    getStorageUploadTimeoutMs(),
    'Audio upload timed out. Please try again.',
  );

  return retryWithTimeout(
    () => getDownloadURL(fileRef),
    getDownloadUrlTimeoutMs(),
    'Audio upload finished, but getting the file link took too long. Please try again.',
  );
}

export async function uploadGeneralMessageAudio(file: Blob) {
  await ensureFirebaseSession();
  const extension = getAudioExtension(file.type);
  const fileName = `audio-${Date.now()}.${extension}`;
  const fileRef = ref(storage, scopedStoragePath(`generalMessages/audio/${fileName}`));

  await retryWithTimeout(
    () =>
      uploadBytes(fileRef, file, {
        contentType: file.type || getContentTypeFromExtension(extension),
      }),
    getStorageUploadTimeoutMs(),
    'Audio upload timed out. Please try again.',
  );

  return retryWithTimeout(
    () => getDownloadURL(fileRef),
    getDownloadUrlTimeoutMs(),
    'Audio upload finished, but getting the file link took too long. Please try again.',
  );
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
  await ensureFirebaseSession();
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
  const fileRef = ref(storage, scopedStoragePath(`jobs/${jobId}/photos/${fileName}`));

  await retryWithTimeout(
    () =>
      uploadBytes(fileRef, file, {
        contentType: 'image/jpeg',
      }),
    getStorageUploadTimeoutMs(),
    'Photo upload timed out. Please try again.',
  );

  return retryWithTimeout(
    () => getDownloadURL(fileRef),
    getDownloadUrlTimeoutMs(),
    'Photo upload finished, but getting the photo link took too long. Please try again.',
  );
}

export async function uploadJobPartInvoicePhoto(
  jobId: string,
  partId: string,
  file: Blob,
) {
  await ensureFirebaseSession();
  const fileName = `invoice-${Date.now()}.jpg`;
  const fileRef = ref(
    storage,
    scopedStoragePath(`jobs/${jobId}/parts/${partId}/invoice-photos/${fileName}`),
  );

  await retryWithTimeout(
    () =>
      uploadBytes(fileRef, file, {
        contentType: 'image/jpeg',
      }),
    getStorageUploadTimeoutMs(),
    'Invoice photo upload timed out. Please try again.',
  );

  return retryWithTimeout(
    () => getDownloadURL(fileRef),
    getDownloadUrlTimeoutMs(),
    'Invoice photo upload finished, but getting the photo link took too long. Please try again.',
  );
}

export async function uploadLeadPhoto(leadId: string, file: Blob) {
  await ensureFirebaseSession();
  const fileName = `photo-${Date.now()}.jpg`;
  const fileRef = ref(storage, scopedStoragePath(`leads/${leadId}/photos/${fileName}`));

  await retryWithTimeout(
    () =>
      uploadBytes(fileRef, file, {
        contentType: 'image/jpeg',
      }),
    getStorageUploadTimeoutMs(),
    'Photo upload timed out. Please try again.',
  );

  return retryWithTimeout(
    () => getDownloadURL(fileRef),
    getDownloadUrlTimeoutMs(),
    'Photo upload finished, but getting the photo link took too long. Please try again.',
  );
}

export async function deleteStorageFile(fileUrl: string) {
  const trimmedUrl = fileUrl.trim();
  if (!trimmedUrl) {
    return;
  }

  await ensureFirebaseSession();
  await retryWithTimeout(
    () => deleteObject(ref(storage, trimmedUrl)),
    getStorageUploadTimeoutMs(),
    'Deleting the file took too long. Please try again.',
  );
}

function withTimeout<T>(
  promiseFactory: () => Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    promiseFactory().then(
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

async function retryWithTimeout<T>(
  promiseFactory: () => Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
  attempts = 2,
) {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await withTimeout(promiseFactory, timeoutMs, timeoutMessage);
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await wait(1200);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(timeoutMessage);
}

function wait(timeoutMs: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, timeoutMs);
  });
}

function isLikelyMobileDevice() {
  if (typeof navigator === 'undefined') {
    return false;
  }

  return /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}

function getStorageUploadTimeoutMs() {
  return isLikelyMobileDevice()
    ? MOBILE_STORAGE_UPLOAD_TIMEOUT_MS
    : DESKTOP_STORAGE_UPLOAD_TIMEOUT_MS;
}

function getDownloadUrlTimeoutMs() {
  return isLikelyMobileDevice()
    ? MOBILE_DOWNLOAD_URL_TIMEOUT_MS
    : DESKTOP_DOWNLOAD_URL_TIMEOUT_MS;
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
