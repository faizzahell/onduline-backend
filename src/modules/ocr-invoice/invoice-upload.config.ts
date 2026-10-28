import { BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

export const MAX_INVOICE_FILE_BYTES = 10 * 1024 * 1024;

export const ALLOWED_INVOICE_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
] as const;

type AllowedMimeType = (typeof ALLOWED_INVOICE_MIME_TYPES)[number];

/**
 * Derived from the `FileInterceptor` signature because
 * `@nestjs/platform-express` does not publicly export its multer options type.
 */
type MulterOptions = NonNullable<Parameters<typeof FileInterceptor>[1]>;

/**
 * Files are buffered in memory because `StorageService` decides their final
 * name and location, so no temporary file is left behind when the database
 * write fails.
 */
export const invoiceFileUploadOptions: MulterOptions = {
  storage: memoryStorage(),
  limits: { fileSize: MAX_INVOICE_FILE_BYTES, files: 1 },
  fileFilter: (_request, file, callback) => {
    const isAllowed = ALLOWED_INVOICE_MIME_TYPES.includes(
      file.mimetype as AllowedMimeType,
    );

    if (!isAllowed) {
      callback(
        new BadRequestException(
          `Unsupported file format. Use ${ALLOWED_INVOICE_MIME_TYPES.join(', ')}.`,
        ),
        false,
      );
      return;
    }

    callback(null, true);
  },
};
