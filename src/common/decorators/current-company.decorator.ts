import {
  BadRequestException,
  createParamDecorator,
  type ExecutionContext,
} from '@nestjs/common';

import type { CompanyContext } from '../types/company-context';

function readCompany(context: ExecutionContext): CompanyContext | undefined {
  return context.switchToHttp().getRequest<{ company?: CompanyContext }>()
    .company;
}

/**
 * Reads the request's active company, as resolved by `CompanyAccessGuard`.
 *
 * Most endpoints are scoped to a company and immediately use `company.id`, so
 * this throws a clear 400 when there is no active company instead of letting
 * the handler crash on an undefined value. That happens, for example, when a
 * freshly seeded super administrator calls a company-scoped endpoint before
 * creating their first company. For the few endpoints that legitimately work
 * without a company, use `@CurrentCompanyOptional()`.
 *
 * @example
 * ```ts
 * findAll(@CurrentCompany() company: CompanyContext) {}
 * ```
 */
export const CurrentCompany = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CompanyContext => {
    const company = readCompany(context);

    if (!company) {
      throw new BadRequestException(
        'No active company selected. Create a company first, then pick it as the active company.',
      );
    }

    return company;
  },
);

/**
 * Reads the request's active company without requiring one.
 *
 * Returns `undefined` when the user has no company yet, for endpoints that must
 * keep working in that state (company creation/listing, user management by a
 * super administrator).
 */
export const CurrentCompanyOptional = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CompanyContext | undefined =>
    readCompany(context),
);
