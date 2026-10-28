import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Marks a handler with the permissions it requires.
 *
 * The semantics are **any-of**: the user only needs one of the listed
 * permissions. That lets a single endpoint serve several roles with different
 * permissions, for example PURCHASER (`ocr:upload`) and FINANCE
 * (`ocr:review`), both of which may correct extraction results.
 *
 * The `ADMINISTRATOR` role always passes, see
 * `RbacService.hasAnyPermission()`.
 *
 * @example
 * ```ts
 * @Patch(':id')
 * @Permissions('ocr:upload', 'ocr:review')
 * update() {}
 * ```
 */
export const Permissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
