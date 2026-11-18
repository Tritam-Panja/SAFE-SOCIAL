import { fileTypeFromBuffer } from 'file-type';

export interface ValidatedFileMetadata {
  isValid: boolean;
  detectedMime: string;
  detectedExt: string;
  mediaType: 'IMAGE' | 'VIDEO' | 'THUMBNAIL';
  error?: string;
}

const ALLOWED_IMAGES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const ALLOWED_VIDEOS: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

/**
 * Validates actual binary magic bytes using file-type.
 */
export async function inspectFileBytes(buffer: Buffer): Promise<ValidatedFileMetadata> {
  const type = await fileTypeFromBuffer(buffer);

  if (!type) {
    return {
      isValid: false,
      detectedMime: 'application/octet-stream',
      detectedExt: 'bin',
      mediaType: 'IMAGE',
      error: 'Unrecognized file format or corrupted file signature.',
    };
  }

  if (ALLOWED_IMAGES[type.mime]) {
    return {
      isValid: true,
      detectedMime: type.mime,
      detectedExt: ALLOWED_IMAGES[type.mime],
      mediaType: 'IMAGE',
    };
  }

  if (ALLOWED_VIDEOS[type.mime]) {
    return {
      isValid: true,
      detectedMime: type.mime,
      detectedExt: ALLOWED_VIDEOS[type.mime],
      mediaType: 'VIDEO',
    };
  }

  return {
    isValid: false,
    detectedMime: type.mime,
    detectedExt: type.ext,
    mediaType: 'IMAGE',
    error: `File type ${type.mime} is not permitted on this platform. Only kid-safe images (JPEG, PNG, WEBP) and videos (MP4, WEBM, MOV) are allowed.`,
  };
}
