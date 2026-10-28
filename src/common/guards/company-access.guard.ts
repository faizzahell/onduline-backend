import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { CompanyContextService } from '../company/company-context.service';
import type { AuthenticatedUser } from '../types/authenticated-user';
import { COMPANY_HEADER, type CompanyContext } from '../types/company-context';

interface CompanyScopedRequest {
  user?: AuthenticatedUser;
  headers: Record<string, string | string[] | undefined>;
  company?: CompanyContext;
}

/**
 * Sets the request's active company and makes sure the user may access it.
 *
 * Applied after `JwtAuthGuard`. The result is read through `@CurrentCompany()`.
 *
 * A user with no company yet (a freshly seeded super administrator before
 * their first company exists) is let through with `company` left undefined, so
 * the company-management screens still work. Endpoints that genuinely need a
 * company read `company.id` and surface a clear error on their own.
 */
@Injectable()
export class CompanyAccessGuard implements CanActivate {
  constructor(private readonly companyContext: CompanyContextService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<CompanyScopedRequest>();

    if (!request.user?.id) {
      throw new UnauthorizedException('User is not authenticated');
    }

    const header = request.headers[COMPANY_HEADER];
    const requestedCompanyId = Array.isArray(header) ? header[0] : header;

    const company = await this.companyContext.resolveActiveCompanyOrNull(
      request.user.id,
      requestedCompanyId,
    );

    request.company = company ?? undefined;

    return true;
  }
}
