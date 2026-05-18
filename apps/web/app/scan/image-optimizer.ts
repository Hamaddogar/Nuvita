const TARGET_MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const TARGET_MAX_DIMENSION = 1600;
const JPEG_QUALITY_STEPS = [0.86, 0.78, 0.7, 0.62, 0.55];

function shouldOptimize(file: File): boolean {
  if (!file.type.startsWith("image/")) {
    return false;
  }
  return file.size > TARGET_MAX_UPLOAD_BYTES || file.type === "image/heic" || file.type === "image/heif";
}

function createImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to load selected image."));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Image compression failed."));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality
    );
  });
}

function buildCanvas(image: HTMLImageElement): HTMLCanvasElement {
  const longestSide = Math.max(image.width, image.height);
  const scale = longestSide > TARGET_MAX_DIMENSION ? TARGET_MAX_DIMENSION / longestSide : 1;
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas context unavailable.");
  }
  context.drawImage(image, 0, 0, width, height);
  return canvas;
}

export async function optimizeImageForUpload(file: File): Promise<File> {
  if (!shouldOptimize(file)) {
    return file;
  }

  try {
    const image = await createImageFromFile(file);
    const canvas = buildCanvas(image);
    const basename = file.name.replace(/\.[^/.]+$/, "") || "meal-image";

    const isPng = file.type === "image/png";
    if (isPng && file.size <= TARGET_MAX_UPLOAD_BYTES) {
      const pngBlob = await canvasToBlob(canvas, "image/png");
      return new File([pngBlob], `${basename}.png`, { type: "image/png" });
    }

    let bestBlob: Blob | null = null;
    for (const quality of JPEG_QUALITY_STEPS) {
      const jpegBlob = await canvasToBlob(canvas, "image/jpeg", quality);
      bestBlob = jpegBlob;
      if (jpegBlob.size <= TARGET_MAX_UPLOAD_BYTES) {
        break;
      }
    }

    if (!bestBlob) {
      return file;
    }

    if (bestBlob.size >= file.size && file.size <= TARGET_MAX_UPLOAD_BYTES) {
      return file;
    }

    return new File([bestBlob], `${basename}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

