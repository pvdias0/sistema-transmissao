import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const runtimeDir = join(process.cwd(), 'runtime');
const mediaDir = join(runtimeDir, 'media');
const mediaRouteBase = '/runtime/media';

function getExtensionFromMimeType(mimeType) {
  if (mimeType === 'image/jpeg') return '.jpg';
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'image/webp') return '.webp';
  if (mimeType === 'image/gif') return '.gif';
  if (mimeType === 'audio/ogg' || mimeType.startsWith('audio/ogg;')) return '.ogg';
  if (mimeType === 'audio/mpeg') return '.mp3';
  if (mimeType === 'audio/mp4' || mimeType === 'audio/x-m4a') return '.m4a';
  if (mimeType === 'audio/aac') return '.aac';
  if (mimeType === 'audio/wav' || mimeType === 'audio/x-wav') return '.wav';
  if (mimeType === 'audio/opus') return '.opus';
  if (mimeType === 'video/mp4') return '.mp4';
  if (mimeType === 'video/quicktime') return '.mov';
  if (mimeType === 'video/webm') return '.webm';
  if (mimeType === 'video/x-matroska') return '.mkv';
  if (mimeType === 'video/3gpp') return '.3gp';
  return '.bin';
}

export function getMediaRouteBase() {
  return mediaRouteBase;
}

export function getMediaDirectory() {
  return mediaDir;
}

export function createMediaStorage() {
  return {
    async saveBase64Media({ mimeType, base64Data }) {
      await mkdir(mediaDir, { recursive: true });

      const extension = getExtensionFromMimeType(mimeType);
      const filename = `${Date.now()}-${randomUUID()}${extension}`;
      const absolutePath = join(mediaDir, filename);

      await writeFile(absolutePath, Buffer.from(base64Data, 'base64'));

      return {
        mimeType,
        filename,
        absolutePath,
        publicPath: `${mediaRouteBase}/${filename}`
      };
    }
  };
}
