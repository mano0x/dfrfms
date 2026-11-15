/**
 * Prepares a photo in the browser before upload: it is redrawn at a sensible
 * size and saved as JPEG. This keeps uploads small and, because only the
 * pixels are redrawn, removes hidden data stored in the original file, such
 * as the GPS position where the photo was taken.
 */
const MAX_SIDE = 1920;
const QUALITY = 0.85;

export async function prepareImage(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no 2d context");
    // White background, so transparent PNGs do not turn black as JPEG.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
    if (blob) return blob;
  } catch {
    // Fall through: the server still checks the original file's type and size.
  }
  return file;
}
