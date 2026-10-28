import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Marks a handler with the roles allowed to reach it.
 *
 * The semantics are **any-of**: the user only needs to hold one of the listed
 * roles. SUPER_ADMINISTRATOR always passes, see `RolesGuard`.
 *
 * Use this for actions that are tied to a role rather than a functional
 * permission, such as the administrator-only deletion of expense data.
 *
 * @example
 * ```ts
 * @Delete(':id')
 * @Roles('ADMINISTRATOR')
 * remove() {}
 * ```
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
