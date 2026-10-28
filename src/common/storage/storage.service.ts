import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createReadStream, type ReadStream } from 'node:fs';
import { access, mkdir, unlink, writeFile } from 'node:fs/promises';
import { extname, isAbsolute, join, normalize, relative } from 'node:path';

export interface StoredFile {
  /** Path relative to the storage directory, stored in a database column. */
  storageKey: string;
  absolutePath: string;
}

/**
 * Stores invoice files on the local disk, under `<cwd>/storage`.
 *
 * This directory is deliberately **not** published as a static asset. Invoice
 * files may only be reached through the guarded download endpoint, see
 * `OcrInvoiceController.downloadFile()`.
 */
@Injectable()
export class StorageService {
  private readonly basePath = join(process.cwd(), 'storage');

  /**
   * Stores a file under the `scope` folder.
   *
   * `scope` decides the directory structure, for example `invoices/<invoiceId>`
   * or `expense/<employeeId>`. The filename is always replaced with a UUID so
   * the original name from the client never touches the filesystem.
   */
  async saveFile(
    scope: string,
    file: Express.Multer.File,
  ): Promise<StoredFile> {
    const relativeDirectory = this.normalizeScope(scope);
    const directory = this.resolveStorageKey(relativeDirectory);

    await mkdir(directory, { recursive: true });

    const filename = `${randomUUID()}${extname(file.originalname).toLowerCase()}`;
    const absolutePath = join(directory, filename);

    try {
      await writeFile(absolutePath, file.buffer);
    } catch {
      throw new InternalServerErrorException('Failed to save the file');
    }

    return {
      storageKey: `${relativeDirectory}/${filename}`,
      absolutePath,
    };
  }

  async saveInvoiceFile(
    invoiceId: string,
    file: Express.Multer.File,
  ): Promise<StoredFile> {
    return this.saveFile(`invoices/${invoiceId}`, file);
  }

  /** Sanitises the scope so it cannot be used to escape the storage directory. */
  private normalizeScope(scope: string): string {
    const segments = scope
      .split('/')
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0 && segment !== '.' && segment !== '..');

    if (segments.length === 0) {
      throw new BadRequestException('Invalid storage scope');
    }

    return segments.join('/');
  }

  /** Deletes a file. Safe to call for a file that is already gone. */
  async deleteFile(storageKey: string): Promise<void> {
    const absolutePath = this.resolveStorageKey(storageKey);

    try {
      await unlink(absolutePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async exists(storageKey: string): Promise<boolean> {
    try {
      await access(this.resolveStorageKey(storageKey));
      return true;
    } catch {
      return false;
    }
  }

  getAbsolutePath(storageKey: string): string {
    return this.resolveStorageKey(storageKey);
  }

  createReadStream(storageKey: string): ReadStream {
    return createReadStream(this.resolveStorageKey(storageKey));
  }

  /**
   * Turns a storage key into an absolute path, rejecting any key that escapes
   * the storage directory (for example `../../.env`).
   */
  private resolveStorageKey(storageKey: string): string {
    const absolutePath = normalize(join(this.basePath, storageKey));
    const relativePath = relative(this.basePath, absolutePath);

    if (
      relativePath.length === 0 ||
      relativePath.startsWith('..') ||
      isAbsolute(relativePath)
    ) {
      throw new BadRequestException('Invalid storage key');
    }

    return absolutePath;
  }
}
