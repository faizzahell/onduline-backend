import { BadRequestException } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
export const MAX_RECEIPT_FILES = 10;

export const ALLOWED_RECEIPT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
] as const;

type AllowedMimeType = (typeof ALLOWED_RECEIPT_MIME_TYPES)[number];

type MulterOptions = NonNullable<Parameters<typeof FilesInterceptor>[2]>;

/**
 * Receipt attachments are buffered in memory and written by `StorageService`,
 * so no temporary files are left behind when a transaction fails.
 *
 * HEIC is allowed because users capture receipts with their phones.
 */
export const receiptUploadOptions: MulterOptions = {
  storage: memoryStorage(),
  limits: { fileSize: MAX_RECEIPT_BYTES, files: MAX_RECEIPT_FILES },
  fileFilter: (_request, file, callback) => {
    const isAllowed = ALLOWED_RECEIPT_MIME_TYPES.includes(
      file.mimetype as AllowedMimeType,
    );

    if (!isAllowed) {
      callback(
        new BadRequestException(
          `Unsupported attachment format. Use ${ALLOWED_RECEIPT_MIME_TYPES.join(', ')}.`,
        ),
        false,
      );
      return;
    }

    callback(null, true);
  },
};
