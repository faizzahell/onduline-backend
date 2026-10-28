import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { CompanyContext } from '../types/company-context';

/**
 * Reads the request's active company, as resolved by `CompanyAccessGuard`.
 *
 * @example
 * ```ts
 * findAll(@CurrentCompany() company: CompanyContext) {}
 * ```
 */
export const CurrentCompany = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CompanyContext | undefined => {
    const request = context
      .switchToHttp()
      .getRequest<{ company?: CompanyContext }>();

    return request.company;
  },
);
