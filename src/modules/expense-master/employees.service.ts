import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';
import type { ApprovalClaimant } from '../approval/approval.types';
import type { UpsertEmployeeDto } from './dto/master-data.dto';

const employeeInclude = {
  department: { select: { id: true, code: true, name: true } },
  areaCode: { select: { id: true, code: true, name: true } },
  salesArea: { select: { id: true, code: true, name: true } },
  user: { select: { id: true, email: true, name: true } },
} as const;

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(companyId: string, includeInactive = false) {
    return this.prisma.employee.findMany({
      where: { companyId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: { name: 'asc' },
      include: employeeInclude,
    });
  }

  async findOne(companyId: string, id: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, companyId },
      include: employeeInclude,
    });

    if (!employee) {
      throw new NotFoundException('Employee record not found');
    }

    return employee;
  }

  async create(companyId: string, dto: UpsertEmployeeDto) {
    await this.assertCodeAvailable(companyId, dto.employeeCode);

    if (dto.userId) {
      await this.assertUserNotLinked(dto.userId);
    }

    return this.prisma.employee.create({
      data: { companyId, ...dto },
      include: employeeInclude,
    });
  }

  async update(companyId: string, id: string, dto: UpsertEmployeeDto) {
    const employee = await this.findOne(companyId, id);

    if (dto.employeeCode !== employee.employeeCode) {
      await this.assertCodeAvailable(companyId, dto.employeeCode);
    }

    if (dto.userId && dto.userId !== employee.userId) {
      await this.assertUserNotLinked(dto.userId);
    }

    return this.prisma.employee.update({
      where: { id },
      data: dto,
      include: employeeInclude,
    });
  }

  /**
   * The employee record of the active login account, creating one on first use
   * if the account has access to the company but no employee yet.
   *
   * Employees are no longer seeded, and user creation only guarantees a record
   * in the user's home company. So the first time an account records an expense
   * in a company it has access to, the matching employee record is provisioned
   * with safe defaults. A record that was set up explicitly through the master
   * data is always used as-is.
   */
  async findByUser(companyId: string, userId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { companyId, userId, isActive: true },
      include: employeeInclude,
    });

    if (employee) {
      return employee;
    }

    return this.provisionForUser(companyId, userId);
  }

  /**
   * Creates an employee record for a login account in a company.
   *
   * The account must actually have access to the company. The generated
   * employee code is derived from the account and made unique within the
   * company, and the BC dimensions are left empty for the master data to fill
   * in later.
   */
  async provisionForUser(companyId: string, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        companyAccess: { some: { companyId } },
      },
      select: { id: true, name: true, email: true },
    });

    if (!user) {
      throw new NotFoundException(
        'Your account does not have access to this company. Contact an administrator.',
      );
    }

    // A user is linked to at most one employee record (the relation is unique
    // on userId), so if one exists in another company, reuse it here without a
    // second link; otherwise create and link.
    const linkedElsewhere = await this.prisma.employee.findUnique({
      where: { userId },
      select: { id: true, companyId: true },
    });

    const employeeCode = await this.nextEmployeeCode(companyId, user);

    const created = await this.prisma.employee.create({
      data: {
        companyId,
        employeeCode,
        name: user.name,
        level: 'STAFF',
        division: 'NON_SALES',
        userId: linkedElsewhere ? undefined : userId,
      },
      include: employeeInclude,
    });

    return created;
  }

  /**
   * A short employee code unique within the company, derived from the name or
   * the email, with a numeric suffix when the base is taken.
   */
  private async nextEmployeeCode(
    companyId: string,
    user: { name: string; email: string },
  ): Promise<string> {
    const source = user.name || user.email.split('@')[0] || 'EMP';
    const base =
      source
        .replace(/[^A-Za-z0-9]/g, '')
        .toUpperCase()
        .slice(0, 6) || 'EMP';

    for (let suffix = 0; suffix < 1000; suffix += 1) {
      const candidate = suffix === 0 ? base : `${base}${suffix}`;

      const taken = await this.prisma.employee.findFirst({
        where: { companyId, employeeCode: candidate },
        select: { id: true },
      });

      if (!taken) {
        return candidate;
      }
    }

    // Extremely unlikely fallback: a random suffix.
    return `${base}${Date.now().toString().slice(-4)}`;
  }

  /** Condensed profile used to match approval rules. */
  async findClaimant(
    companyId: string,
    userId: string,
  ): Promise<ApprovalClaimant> {
    const employee = await this.findByUser(companyId, userId);

    return {
      employeeId: employee.id,
      level: employee.level as ApprovalClaimant['level'],
      division: employee.division as ApprovalClaimant['division'],
      departmentId: employee.departmentId,
      salesAreaId: employee.salesAreaId,
    };
  }

  private async assertCodeAvailable(companyId: string, employeeCode: string) {
    const existing = await this.prisma.employee.findFirst({
      where: { companyId, employeeCode },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException(
        `Employee code ${employeeCode} is already in use in this company`,
      );
    }
  }

  private async assertUserNotLinked(userId: string) {
    const existing = await this.prisma.employee.findUnique({
      where: { userId },
      select: { id: true, companyId: true },
    });

    if (existing) {
      throw new ConflictException(
        'This login account is already linked to another employee record',
      );
    }
  }
}
