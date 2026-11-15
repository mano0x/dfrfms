/**
 * Checks for uploaded photos. The file type is decided from the first bytes
 * of the content ("magic numbers"), not from the file name or the type the
 * browser claims, because both of those are chosen by the sender.
 */
export type ImageType = { mime: "image/jpeg" | "image/png" | "image/webp"; extension: "jpg" | "png" | "webp" };

/**
 * Largest photo the server accepts. Photos are resized in the browser before
 * upload, so this is comfortably above a normal upload and below the hosting
 * platform's request limit.
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  bytes.length >= offset + signature.length && signature.every((b, i) => bytes[offset + i] === b);

/** The image type of the content, or null when it is not a JPEG, PNG or WebP image. */
export function detectImageType(bytes: Uint8Array): ImageType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { mime: "image/jpeg", extension: "jpg" };
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: "image/png", extension: "png" };
  // WebP: "RIFF" <4 bytes size> "WEBP"
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return { mime: "image/webp", extension: "webp" };
  }
  return null;
}

/** An error message, or null when the upload is acceptable. */
export function validateUpload(bytes: Uint8Array): string | null {
  if (bytes.length === 0) return "The photo is empty.";
  if (bytes.length > MAX_UPLOAD_BYTES) return "The photo is too large. It must be 4 MB or smaller after resizing.";
  if (!detectImageType(bytes)) return "The photo must be a JPG, PNG or WebP image.";
  return null;
}

/** Stored file name: the uploader's ID is part of it, so ownership can be checked later. */
export const photoFileName = (uploaderId: string, extension: string, now: number = Date.now()) =>
  `${uploaderId}__${now}.${extension}`;

export const photoBelongsTo = (fileName: string, uploaderId: string) => fileName.startsWith(`${uploaderId}__`);
