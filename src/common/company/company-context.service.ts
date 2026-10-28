import { ForbiddenException, Injectable } from '@nestjs/common';

import { RbacService } from '../../modules/rbac/rbac.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CompanyContext } from '../types/company-context';

/**
 * Moving the active company from one legal entity to another is a super
 * administrator action. The permission is seeded but granted to no role, so
 * only the bypass in `RbacService` satisfies it.
 */
export const COMPANY_SWITCH_PERMISSION = 'company:switch';

type GrantedCompany = CompanyContext & { isDefault: boolean };

@Injectable()
export class CompanyContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbacService: RbacService,
  ) {}

  /** Whether the user is allowed to move between companies at all. */
  async canSwitchCompany(userId: string): Promise<boolean> {
    return this.rbacService.hasAnyPermission(userId, [
      COMPANY_SWITCH_PERMISSION,
    ]);
  }

  /** Every company the user has been granted, default first. */
  async listGrantedCompanies(userId: string): Promise<GrantedCompany[]> {
    const access = await this.prisma.userCompanyAccess.findMany({
      where: { userId, company: { isActive: true } },
      include: {
        company: {
          select: {
            id: true,
            code: true,
            name: true,
            currency: true,
            ocrInvoiceEnabled: true,
            ocrExpenseEnabled: true,
          },
        },
      },
      orderBy: [{ isDefault: 'desc' }, { company: { code: 'asc' } }],
    });

    return access.map((entry) => ({
      ...entry.company,
      isDefault: entry.isDefault,
    }));
  }

  /**
   * The companies the company switcher may offer.
   *
   * A user who cannot switch only ever sees their own company, so the
   * switcher has nothing to offer and hides itself.
   */
  async listSelectableCompanies(userId: string): Promise<GrantedCompany[]> {
    const companies = await this.listGrantedCompanies(userId);

    if (companies.length <= 1 || (await this.canSwitchCompany(userId))) {
      return companies;
    }

    return [this.pickDefault(companies)];
  }

  /**
   * Determines the active company for a request.
   *
   * A user who may switch gets the company they asked for, once their access
   * to it is verified. Everyone else is pinned to their default company: a
   * stale `x-company-id` left in the browser by another session must not move
   * them to a company they are not allowed to steer.
   */
  async resolveActiveCompany(
    userId: string,
    requestedCompanyId?: string,
  ): Promise<CompanyContext> {
    const company = await this.resolveActiveCompanyOrNull(
      userId,
      requestedCompanyId,
    );

    if (!company) {
      throw new ForbiddenException(
        'User has not been granted access to any company',
      );
    }

    return company;
  }

  /**
   * Like `resolveActiveCompany`, but returns `null` instead of throwing when
   * the user has no company yet.
   *
   * This is the state a freshly seeded super administrator is in before they
   * create their first company: the request should still go through so the
   * settings and company-management screens work.
   */
  async resolveActiveCompanyOrNull(
    userId: string,
    requestedCompanyId?: string,
  ): Promise<CompanyContext | null> {
    const companies = await this.listGrantedCompanies(userId);

    if (companies.length === 0) {
      return null;
    }

    const fallback = this.pickDefault(companies);

    if (!requestedCompanyId || requestedCompanyId === fallback.id) {
      return this.toContext(fallback);
    }

    if (!(await this.canSwitchCompany(userId))) {
      return this.toContext(fallback);
    }

    const match = companies.find(
      (company) => company.id === requestedCompanyId,
    );

    if (!match) {
      throw new ForbiddenException('You do not have access to this company');
    }

    return this.toContext(match);
  }

  /** Makes a company the user's default choice. */
  async setDefaultCompany(userId: string, companyId: string): Promise<void> {
    const access = await this.prisma.userCompanyAccess.findUnique({
      where: { userId_companyId: { userId, companyId } },
    });

    if (!access) {
      throw new ForbiddenException('You do not have access to this company');
    }

    await this.prisma.$transaction([
      this.prisma.userCompanyAccess.updateMany({
        where: { userId },
        data: { isDefault: false },
      }),
      this.prisma.userCompanyAccess.update({
        where: { userId_companyId: { userId, companyId } },
        data: { isDefault: true },
      }),
    ]);
  }

  private pickDefault(companies: GrantedCompany[]): GrantedCompany {
    return companies.find((company) => company.isDefault) ?? companies[0];
  }

  private toContext(company: GrantedCompany): CompanyContext {
    const { isDefault: _isDefault, ...context } = company;
    return context;
  }
}
