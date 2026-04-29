import { Capacitor } from '@capacitor/core';
import {
  Camera,
  CameraSource,
} from '@capacitor/camera';

export type MobilePhotoSource = 'camera' | 'gallery';

const MOBILE_CAMERA_QUALITY = 32;
const MOBILE_CAMERA_MAX_DIMENSION = 960;

export function canUseNativeMobileCamera() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export async function getNativeMobilePhoto(
  source: MobilePhotoSource,
): Promise<File | null> {
  const photo = await Camera.getPhoto({
    quality: MOBILE_CAMERA_QUALITY,
    allowEditing: false,
    source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
    width: MOBILE_CAMERA_MAX_DIMENSION,
    height: MOBILE_CAMERA_MAX_DIMENSION,
    correctOrientation: true,
  });

  if (photo.webPath) {
    return createFileFromWebPath(photo.webPath, source, photo.format);
  }

  if (photo.base64String) {
    const extension = getPhotoExtension(photo.format);
    const fileName = `shop-keeper-${source}-${Date.now()}.${extension}`;
    const bytes = base64ToUint8Array(photo.base64String);
    const mimeType = getMimeType(extension);

    return new File([bytes], fileName, {
      type: mimeType,
      lastModified: Date.now(),
    });
  }

  return null;
}

function getPhotoExtension(format?: string) {
  const normalized = String(format ?? '').trim().toLowerCase();
  if (normalized === 'png') return 'png';
  if (normalized === 'webp') return 'webp';
  return 'jpg';
}

function getMimeType(extension: string) {
  switch (extension) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'jpg':
    default:
      return 'image/jpeg';
  }
}

async function createFileFromWebPath(
  webPath: string,
  source: MobilePhotoSource,
  format?: string,
) {
  const response = await fetch(webPath);
  if (!response.ok) {
    throw new Error('Could not read the selected mobile photo.');
  }

  const blob = await response.blob();
  const extension = getPhotoExtension(format);
  const mimeType = blob.type || getMimeType(extension);

  return new File([blob], `shop-keeper-${source}-${Date.now()}.${extension}`, {
    type: mimeType,
    lastModified: Date.now(),
  });
}

function base64ToUint8Array(base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);

  for (let index = 0; index < binaryString.length; index += 1) {
    bytes[index] = binaryString.charCodeAt(index);
  }

  return bytes;
}
