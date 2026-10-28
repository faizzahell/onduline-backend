import { BadRequestException } from '@nestjs/common';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageService } from './storage.service';

function createUploadedFile(
  overrides: Partial<Express.Multer.File> = {},
): Express.Multer.File {
  return {
    originalname: 'invoice.PDF',
    mimetype: 'application/pdf',
    size: 11,
    buffer: Buffer.from('hello world'),
    ...overrides,
  } as Express.Multer.File;
}

describe('StorageService', () => {
  let service: StorageService;
  let workingDirectory: string;

  beforeEach(async () => {
    workingDirectory = await mkdtemp(join(tmpdir(), 'ofda-storage-'));

    // basePath is computed from cwd at construction time, so stub it first.
    vi.spyOn(process, 'cwd').mockReturnValue(workingDirectory);

    service = new StorageService();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(workingDirectory, { recursive: true, force: true });
  });

  it('stores the file under the invoice and returns a relative storage key', async () => {
    const stored = await service.saveInvoiceFile(
      'invoice-1',
      createUploadedFile(),
    );

    expect(stored.storageKey).toMatch(/^invoices\/invoice-1\/[\w-]+\.pdf$/);
    await expect(readFile(stored.absolutePath, 'utf8')).resolves.toBe(
      'hello world',
    );
  });

  it('considers a stored file to exist, and anything else not to', async () => {
    const stored = await service.saveInvoiceFile(
      'invoice-1',
      createUploadedFile(),
    );

    await expect(service.exists(stored.storageKey)).resolves.toBe(true);
    await expect(
      service.exists('invoices/invoice-1/does-not-exist.pdf'),
    ).resolves.toBe(false);
  });

  it('deletes a file and stays safe when the file is already gone', async () => {
    const stored = await service.saveInvoiceFile(
      'invoice-1',
      createUploadedFile(),
    );

    await service.deleteFile(stored.storageKey);
    await expect(service.exists(stored.storageKey)).resolves.toBe(false);
    await expect(service.deleteFile(stored.storageKey)).resolves.toBeUndefined();
  });

  it('rejects a storage key that escapes the storage directory', () => {
    expect(() => service.getAbsolutePath('../../.env')).toThrow(
      BadRequestException,
    );
    expect(() => service.getAbsolutePath('invoices/../../../etc/passwd')).toThrow(
      BadRequestException,
    );
  });
});
