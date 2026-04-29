export type ProcessJobImageOptions = {
  addTimestamp: boolean;
  maxDimension?: number;
  quality?: number;
  targetMaxBytes?: number;
  minDimension?: number;
};

export type ProcessedJobImage = {
  blob: Blob;
  width: number;
  height: number;
  fileSize: number;
  timestampIncluded: boolean;
};

const DEFAULT_MAX_DIMENSION = 1280;
const DEFAULT_QUALITY = 0.68;
const MIN_QUALITY = 0.24;
const TARGET_MAX_BYTES = 300 * 1024;
const MIN_DIMENSION = 640;
const MAX_COMPRESSION_ATTEMPTS = 12;
const PROCESS_TIMEOUT_MS = 15000;

export async function processJobImage(
  file: File,
  options: ProcessJobImageOptions,
): Promise<ProcessedJobImage> {
  return withTimeout(processJobImageInternal(file, options), PROCESS_TIMEOUT_MS);
}

async function processJobImageInternal(
  file: File,
  options: ProcessJobImageOptions,
): Promise<ProcessedJobImage> {
  const source = await loadImage(file);
  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const quality = options.quality ?? DEFAULT_QUALITY;
  const targetMaxBytes = options.targetMaxBytes ?? TARGET_MAX_BYTES;
  const minDimension = options.minDimension ?? MIN_DIMENSION;
  const scaled = getScaledSize(source.width, source.height, maxDimension);

  const canvas = document.createElement('canvas');
  canvas.width = scaled.width;
  canvas.height = scaled.height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Image processing is not available on this device.');
  }

  context.fillStyle = '#0b1421';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);

  if (options.addTimestamp) {
    drawTimestamp(context, canvas.width, canvas.height);
  }

  await nextFrame();

  let currentQuality = quality;
  let currentWidth = canvas.width;
  let currentHeight = canvas.height;
  let blob = await canvasToJpegBlob(canvas, currentQuality);

  let attempts = 0;
  while (blob.size > targetMaxBytes && attempts < MAX_COMPRESSION_ATTEMPTS) {
    attempts += 1;

    if (currentQuality > MIN_QUALITY) {
      currentQuality = Math.max(MIN_QUALITY, currentQuality - 0.08);
      await nextFrame();
      blob = await canvasToJpegBlob(canvas, currentQuality);
      continue;
    }

    currentWidth = Math.max(minDimension, Math.round(currentWidth * 0.84));
    currentHeight = Math.max(minDimension, Math.round(currentHeight * 0.84));

    canvas.width = currentWidth;
    canvas.height = currentHeight;
    context.fillStyle = '#0b1421';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, 0, 0, canvas.width, canvas.height);

    if (options.addTimestamp) {
      drawTimestamp(context, canvas.width, canvas.height);
    }

    await nextFrame();
    blob = await canvasToJpegBlob(canvas, currentQuality);
  }

  return {
    blob,
    width: canvas.width,
    height: canvas.height,
    fileSize: blob.size,
    timestampIncluded: options.addTimestamp,
  };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read the selected photo.'));
    };

    image.src = url;
  });
}

function getScaledSize(width: number, height: number, maxDimension: number) {
  if (width <= maxDimension && height <= maxDimension) {
    return { width, height };
  }

  const scale = Math.min(maxDimension / width, maxDimension / height);

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Could not compress the photo.'));
          return;
        }

        resolve(blob);
      },
      'image/jpeg',
      quality,
    );
  });
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error('Photo processing took too long. Try again with timestamp off or a smaller image.'));
    }, timeoutMs);

    promise.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

function drawTimestamp(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  const timestamp = new Intl.DateTimeFormat('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date());

  const fontSize = Math.max(18, Math.round(width * 0.022));
  const paddingX = Math.round(fontSize * 0.7);
  const paddingY = Math.round(fontSize * 0.45);
  const x = width - Math.round(width * 0.03);
  const y = height - Math.round(height * 0.04);

  context.font = `700 ${fontSize}px "Segoe UI", sans-serif`;
  context.textAlign = 'right';
  context.textBaseline = 'bottom';

  const metrics = context.measureText(timestamp);
  const boxWidth = Math.ceil(metrics.width + paddingX * 2);
  const boxHeight = Math.ceil(fontSize + paddingY * 2);

  context.fillStyle = 'rgba(8, 18, 32, 0.68)';
  roundRect(context, x - boxWidth, y - boxHeight, boxWidth, boxHeight, Math.round(fontSize * 0.45));
  context.fill();

  context.strokeStyle = 'rgba(189, 224, 255, 0.42)';
  context.lineWidth = 2;
  roundRect(context, x - boxWidth, y - boxHeight, boxWidth, boxHeight, Math.round(fontSize * 0.45));
  context.stroke();

  context.fillStyle = '#f8fbff';
  context.fillText(timestamp, x - paddingX, y - paddingY + 2);
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}
