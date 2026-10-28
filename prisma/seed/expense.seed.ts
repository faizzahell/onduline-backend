import { prisma } from '../../src/common/prisma/prisma.client';
import type { SeededUser } from './rbac.seed';

/**
 * GL account numbers taken from the finance team's General Journal worksheet.
 * Categories whose account is not known yet are intentionally left empty, so
 * that posting fails with a clear message instead of landing on the wrong
 * account.
 */
const GL = {
  AIR_TICKET_DOMESTIC: { no: '60005001', name: 'Air ticket _Domestic' },
  BUSINESS_TRAVEL_LOCAL: { no: '60005012', name: 'Business Travel Local' },
  GASOLINE: { no: '60005051', name: 'Gasoline/Petrol' },
  TOLL_PARKING: { no: '60005053', name: 'Toll/Parking' },
  TRAVEL_OTHERS: { no: '60005900', name: 'Travel Others' },
  HOTEL_DOMESTIC: { no: '60005101', name: 'Hotel_Domestic' },
  HOTEL_OVERSEAS: { no: '60005102', name: 'Hotel_Overseas' },
  CAR_OUTSTATION_RENTAL: { no: '60005103', name: 'Car Outstation Rental' },
  COURIER_POSTAGE: { no: '63000002', name: 'Courier & Postage' },
  OFFICE_SUNDRIES: { no: '63000012', name: 'Office Suppliers/Sundries' },
  STAMP_DUTY: { no: '63000018', name: 'Stamp Duty' },
  UTILITIES: { no: '63000025', name: 'Utilities (Elect/tlp/eth)' },
} as const;

interface CategorySeed {
  code: string;
  name: string;
  gl?: { no: string; name: string };
  pettyCashCode?: string;
  requiresProof?: boolean;
  requiresDestination?: boolean;
  requiresMarketingCode?: boolean;
  isFixedRate?: boolean;
  isEntertainment?: boolean;
  isMealAllowance?: boolean;
  unitOfMeasure?: string;
  perTransactionApprovalThreshold?: number;
  availableForExpense?: boolean;
  availableForPettyCash?: boolean;
}

/** Categories follow the columns on the EXPENSE CLAIM REPORT form. */
const expenseCategories: CategorySeed[] = [
  {
    code: 'GASOLINE',
    name: 'Gasoline / Petrol',
    gl: GL.GASOLINE,
    requiresDestination: true,
  },
  {
    code: 'TOLL',
    name: 'Toll',
    gl: GL.TOLL_PARKING,
    requiresDestination: true,
  },
  { code: 'PARKING', name: 'Parking', gl: GL.TOLL_PARKING },
  {
    code: 'MEAL_ALLOWANCE',
    name: 'Meal Allowance',
    // The only category that does not require a receipt; a Talenta screenshot
    // takes its place. The rate is fixed and comes from the rate master.
    requiresProof: false,
    requiresDestination: true,
    isFixedRate: true,
    isMealAllowance: true,
    unitOfMeasure: 'DAY',
  },
  { code: 'TAXI', name: 'Taxi / Grab', requiresDestination: true },
  {
    code: 'RENTAL_CAR',
    name: 'Rental Car',
    gl: GL.CAR_OUTSTATION_RENTAL,
    requiresDestination: true,
    unitOfMeasure: 'DAY',
  },
  {
    code: 'ENTERTAINMENT',
    name: 'Entertainment',
    requiresMarketingCode: true,
    isEntertainment: true,
    // Anything above IDR 500,000 needs per-transaction approval.
    perTransactionApprovalThreshold: 500_000,
  },
  { code: 'PULSA', name: 'Phone Credit / Phone Allowance' },
  { code: 'ATK', name: 'Office Supplies / Stationery', gl: GL.OFFICE_SUNDRIES },
  { code: 'LAUNDRY', name: 'Laundry', gl: GL.OFFICE_SUNDRIES },
  { code: 'COURIER', name: 'Courier', gl: GL.COURIER_POSTAGE },
  {
    code: 'HOTEL',
    name: 'Hotel',
    gl: GL.HOTEL_DOMESTIC,
    requiresDestination: true,
  },
  {
    code: 'HOTEL_OVERSEAS',
    name: 'Hotel Overseas',
    gl: GL.HOTEL_OVERSEAS,
    requiresDestination: true,
  },
  {
    code: 'AIR_TICKET',
    name: 'Air Ticket',
    gl: GL.AIR_TICKET_DOMESTIC,
    requiresDestination: true,
  },
  {
    code: 'TRAIN',
    name: 'Train / Business Travel Local',
    gl: GL.BUSINESS_TRAVEL_LOCAL,
    requiresDestination: true,
  },
  { code: 'OTHERS', name: 'Others' },
];

/** Petty cash groups together with the COA mapping from Ms. Resia's worksheet. */
const pettyCashCategories: CategorySeed[] = [
  {
    code: 'PC2',
    name: 'Office Suppliers / Sundries',
    gl: GL.OFFICE_SUNDRIES,
    pettyCashCode: 'PC2',
  },
  {
    code: 'PC3',
    name: 'Courier & Postage',
    gl: GL.COURIER_POSTAGE,
    pettyCashCode: 'PC3',
  },
  {
    code: 'PC5',
    name: 'Gasoline / Petrol',
    gl: GL.GASOLINE,
    pettyCashCode: 'PC5',
  },
  {
    code: 'PC6',
    name: 'Stamp Duty',
    gl: GL.STAMP_DUTY,
    pettyCashCode: 'PC6',
  },
  {
    code: 'PC8',
    name: 'Utilities (Elect/tlp/eth)',
    gl: GL.UTILITIES,
    pettyCashCode: 'PC8',
  },
  {
    code: 'PC9',
    name: 'Travel Others',
    gl: GL.TRAVEL_OTHERS,
    pettyCashCode: 'PC9',
  },
  {
    code: 'PCB',
    name: 'Toll / Parking',
    gl: GL.TOLL_PARKING,
    pettyCashCode: 'PCB',
  },
];

/** Dimensions read from the AREA CODE and DEPARTMENT CODE columns of the worksheet. */
const areaCodes = [
  { code: 'HO', name: 'Head Office' },
  { code: 'RM01', name: 'Regional Marketing 01' },
  { code: 'RM02', name: 'Regional Marketing 02' },
  { code: 'RM03', name: 'Regional Marketing 03' },
  { code: 'CM01', name: 'Commercial 01' },
  { code: 'OTHR', name: 'Others' },
];

const departments = [
  { code: 'COMMERCIAL', name: 'Commercial' },
  { code: 'TECHNICALS', name: 'Technicals' },
  { code: 'FINANCE', name: 'Finance & Accounting' },
  { code: 'HR_LEGAL_GA', name: 'HR / Legal / GA' },
  { code: 'MARKETING', name: 'Marketing' },
  { code: 'PRODUCT', name: 'Product' },
];

const salesAreas = [
  { code: 'RM01', name: 'Regional 01' },
  { code: 'RM02', name: 'Regional 02' },
  { code: 'RM03', name: 'Regional 03' },
];

const marketingCodes = [
  { code: 'MK-ENT', name: 'Business Relations Entertainment' },
  { code: 'MK-PROMO', name: 'Promotion' },
];

const MEAL_ALLOWANCE_RATE = 150_000;

export async function seedCompanies() {
  const oi = await prisma.company.upsert({
    where: { code: 'OI' },
    update: { name: 'PT Onduline Indonesia' },
    create: {
      code: 'OI',
      name: 'PT Onduline Indonesia',
      currency: 'IDR',
      journalInitials: 'IS',
      pettyCashJournalInitials: 'RE',
      // OI was already using invoice OCR before this switch existed, so it is
      // enabled from the start to keep the flow unchanged. OCR for expense
      // receipts stays off until the super administrator turns it on.
      ocrInvoiceEnabled: true,
    },
  });

  const omi = await prisma.company.upsert({
    where: { code: 'OMI' },
    update: { name: 'PT Onduline Material Indonesia' },
    create: {
      code: 'OMI',
      name: 'PT Onduline Material Indonesia',
      currency: 'IDR',
      journalInitials: 'IS',
      pettyCashJournalInitials: 'RE',
    },
  });

  return { oi, omi };
}

/**
 * Sets exactly which companies an account may reach.
 *
 * Access to anything outside the list is revoked, so the seed stays the single
 * source of truth: a company granted by an earlier run does not linger.
 */
export async function grantCompanyAccess(
  userId: string,
  companies: { id: string }[],
  defaultCompanyId: string,
) {
  for (const company of companies) {
    await prisma.userCompanyAccess.upsert({
      where: { userId_companyId: { userId, companyId: company.id } },
      update: { isDefault: company.id === defaultCompanyId },
      create: {
        userId,
        companyId: company.id,
        isDefault: company.id === defaultCompanyId,
      },
    });
  }

  await prisma.userCompanyAccess.deleteMany({
    where: {
      userId,
      companyId: { notIn: companies.map((company) => company.id) },
    },
  });
}

export async function seedDimensions(companyId: string): Promise<void> {
  for (const area of areaCodes) {
    await prisma.areaCode.upsert({
      where: { companyId_code: { companyId, code: area.code } },
      update: { name: area.name },
      create: { companyId, ...area },
    });
  }

  for (const department of departments) {
    await prisma.department.upsert({
      where: { companyId_code: { companyId, code: department.code } },
      update: { name: department.name },
      create: { companyId, ...department },
    });
  }

  for (const salesArea of salesAreas) {
    await prisma.salesArea.upsert({
      where: { companyId_code: { companyId, code: salesArea.code } },
      update: { name: salesArea.name },
      create: { companyId, ...salesArea },
    });
  }

  for (const marketingCode of marketingCodes) {
    await prisma.marketingCode.upsert({
      where: { companyId_code: { companyId, code: marketingCode.code } },
      update: { name: marketingCode.name },
      create: { companyId, ...marketingCode },
    });
  }
}

export async function seedCategories(companyId: string): Promise<void> {
  const all = [
    ...expenseCategories.map((category) => ({
      ...category,
      availableForExpense: true,
      availableForPettyCash: false,
    })),
    ...pettyCashCategories.map((category) => ({
      ...category,
      availableForExpense: false,
      availableForPettyCash: true,
    })),
  ];

  for (const category of all) {
    const data = {
      name: category.name,
      glAccountNo: category.gl?.no ?? null,
      glAccountName: category.gl?.name ?? null,
      pettyCashCode: category.pettyCashCode ?? null,
      requiresProof: category.requiresProof ?? true,
      requiresDestination: category.requiresDestination ?? false,
      requiresMarketingCode: category.requiresMarketingCode ?? false,
      isFixedRate: category.isFixedRate ?? false,
      isEntertainment: category.isEntertainment ?? false,
      isMealAllowance: category.isMealAllowance ?? false,
      unitOfMeasure: category.unitOfMeasure ?? null,
      perTransactionApprovalThreshold:
        category.perTransactionApprovalThreshold ?? null,
      availableForExpense: category.availableForExpense,
      availableForPettyCash: category.availableForPettyCash,
    };

    await prisma.expenseCategory.upsert({
      where: { companyId_code: { companyId, code: category.code } },
      update: data,
      create: { companyId, code: category.code, ...data },
    });
  }

  // Meal allowance rate; the amount can be changed through the rate master.
  const mealAllowance = await prisma.expenseCategory.findUniqueOrThrow({
    where: { companyId_code: { companyId, code: 'MEAL_ALLOWANCE' } },
  });

  const existingRate = await prisma.expenseRate.findFirst({
    where: { categoryId: mealAllowance.id },
  });

  if (!existingRate) {
    await prisma.expenseRate.create({
      data: {
        categoryId: mealAllowance.id,
        amount: MEAL_ALLOWANCE_RATE,
        effectiveFrom: new Date(Date.UTC(2026, 0, 1)),
      },
    });
  }
}

/**
 * Initial approval matrix.
 *
 * Approval steps use a **role** as the approver rather than a person's name,
 * so the seed does not have to invent employee records. Once the real employee
 * data is loaded, switch the relevant steps to SPECIFIC_EMPLOYEE so they match
 * the matrix in the document exactly (Mr. Teddy, Ms. Esther, and so on).
 */
export async function seedApprovalRules(companyId: string): Promise<void> {
  const rules = [
    {
      name: 'Expense Claim - Board of Directors',
      documentType: 'EXPENSE_CLAIM' as const,
      claimantLevel: 'DIRECTOR' as const,
      claimantDivision: null,
      priority: 40,
      steps: [
        {
          stepType: 'ACCRUE' as const,
          approverType: 'ROLE' as const,
          approverRoleName: 'FINANCE',
          label: 'Accrual by Finance',
        },
        {
          stepType: 'APPROVE' as const,
          approverType: 'ROLE' as const,
          approverRoleName: 'EXPENSE_APPROVER',
          label: 'Cross-approval between directors',
        },
        {
          stepType: 'POST' as const,
          approverType: 'ROLE' as const,
          approverRoleName: 'FINANCE',
          label: 'Posting by Finance',
        },
      ],
    },
    {
      name: 'Expense Claim - Sales Manager',
      documentType: 'EXPENSE_CLAIM' as const,
      claimantLevel: 'MANAGER' as const,
      claimantDivision: 'SALES' as const,
      priority: 30,
      steps: [
        {
          stepType: 'ACCRUE' as const,
          approverType: 'ROLE' as const,
          approverRoleName: 'FINANCE',
          label: 'Accrual by Finance',
        },
        {
          stepType: 'APPROVE' as const,
          approverType: 'ROLE' as const,
          approverRoleName: 'EXPENSE_APPROVER',
          label: 'Director approval',
        },
        {
          stepType: 'POST' as const,
          approverType: 'ROLE' as const,
          approverRoleName: 'FINANCE',
          label: 'Posting by Finance',
        },
      ],
    },
    {
      name: 'Expense Claim - Sales Non Manager',
      documentType: 'EXPENSE_CLAIM' as const,
      claimantLevel: 'STAFF' as const,
      claimantDivision: 'SALES' as const,
      priority: 30,
      steps: [
        {
          stepType: 'ACCRUE' as const,
          approverType: 'ROLE' as const,
          approverRoleName: 'FINANCE',
          label: 'Accrual by Finance',
        },
        {
          stepType: 'REVIEW' as const,
          approverType: 'REGIONAL_MANAGER' as const,
          label: 'Review Regional Manager',
        },
        {
          stepType: 'APPROVE' as const,
          approverType: 'ROLE' as const,
          approverRoleName: 'EXPENSE_APPROVER',
          label: 'Director approval',
        },
        {
          stepType: 'POST' as const,
          approverType: 'ROLE' as const,
          approverRoleName: 'FINANCE',
          label: 'Posting by Finance',
        },
      ],
    },
    {
      name: 'Expense Claim - Non Sales / Back Office',
      documentType: 'EXPENSE_CLAIM' as const,
      claimantLevel: null,
      claimantDivision: 'NON_SALES' as const,
      priority: 20,
      steps: [
        {
          stepType: 'ACCRUE' as const,
          approverType: 'ROLE' as const,
          approverRoleName: 'FINANCE',
          label: 'Accrual by Finance',
        },
        {
          stepType: 'REVIEW' as const,
          approverType: 'DEPARTMENT_HEAD' as const,
          label: 'Review HOD',
        },
        {
          stepType: 'APPROVE' as const,
          approverType: 'ROLE' as const,
          approverRoleName: 'EXPENSE_APPROVER',
          label: 'Director approval',
        },
        {
          stepType: 'POST' as const,
          approverType: 'ROLE' as const,
          approverRoleName: 'FINANCE',
          label: 'Posting by Finance',
        },
      ],
    },
    {
      name: 'Expense Claim - Default',
      documentType: 'EXPENSE_CLAIM' as const,
      claimantLevel: null,
      claimantDivision: null,
      priority: 0,
      steps: [
        {
          stepType: 'ACCRUE' as const,
          approverType: 'ROLE' as const,
          approverRoleName: 'FINANCE',
          label: 'Accrual by Finance',
        },
        {
          stepType: 'APPROVE' as const,
          approverType: 'ROLE' as const,
          approverRoleName: 'EXPENSE_APPROVER',
          label: 'Director approval',
        },
        {
          stepType: 'POST' as const,
          approverType: 'ROLE' as const,
          approverRoleName: 'FINANCE',
          label: 'Posting by Finance',
        },
      ],
    },
    {
      name: 'Petty Cash - Default',
      documentType: 'PETTY_CASH_BATCH' as const,
      claimantLevel: null,
      claimantDivision: null,
      priority: 0,
      steps: [
        {
          stepType: 'APPROVE' as const,
          approverType: 'ROLE' as const,
          approverRoleName: 'EXPENSE_APPROVER',
          label: 'Director approval',
        },
        {
          stepType: 'POST' as const,
          approverType: 'ROLE' as const,
          approverRoleName: 'FINANCE',
          label: 'Submit & post to BC',
        },
      ],
    },
    {
      name: 'Cash Advance - Default',
      documentType: 'CASH_ADVANCE' as const,
      claimantLevel: null,
      claimantDivision: null,
      priority: 0,
      steps: [
        {
          stepType: 'REVIEW' as const,
          approverType: 'ROLE' as const,
          approverRoleName: 'EXPENSE_APPROVER',
          label: 'Supervisor review',
        },
        {
          stepType: 'APPROVE' as const,
          approverType: 'ROLE' as const,
          approverRoleName: 'EXPENSE_APPROVER',
          label: 'Director approval',
        },
        {
          stepType: 'POST' as const,
          approverType: 'ROLE' as const,
          approverRoleName: 'FINANCE',
          label: 'Posting by Finance',
        },
      ],
    },
  ];

  for (const rule of rules) {
    const existing = await prisma.approvalRule.findFirst({
      where: { companyId, name: rule.name },
      select: { id: true },
    });

    if (existing) {
      await prisma.approvalRuleStep.deleteMany({
        where: { ruleId: existing.id },
      });

      await prisma.approvalRule.delete({ where: { id: existing.id } });
    }

    await prisma.approvalRule.create({
      data: {
        companyId,
        name: rule.name,
        documentType: rule.documentType,
        claimantLevel: rule.claimantLevel,
        claimantDivision: rule.claimantDivision,
        priority: rule.priority,
        steps: {
          create: rule.steps.map((step, index) => ({
            sequence: (index + 1) * 10,
            stepType: step.stepType,
            approverType: step.approverType,
            approverRoleName:
              'approverRoleName' in step ? step.approverRoleName : null,
            label: step.label,
          })),
        },
      },
    });
  }
}

/**
 * Gives every seeded account an employee record in this company, so each role
 * can walk the expense flow without master data being set up by hand first.
 *
 * The expense approver doubles as department head and regional manager. Those
 * two positions are what the REVIEW steps of the approval matrix resolve to,
 * and leaving them empty would stop a claim from being submitted at all.
 */
export async function seedEmployees(
  companyId: string,
  users: SeededUser[],
): Promise<void> {
  const headOffice = await prisma.areaCode.findUniqueOrThrow({
    where: { companyId_code: { companyId, code: 'HO' } },
  });

  const regional = await prisma.salesArea.findUniqueOrThrow({
    where: { companyId_code: { companyId, code: 'RM01' } },
  });

  const employeeIdsByCode = new Map<string, string>();

  for (const user of users) {
    const department = await prisma.department.findUnique({
      where: { companyId_code: { companyId, code: user.departmentCode } },
      select: { id: true },
    });

    const data = {
      name: user.name,
      position: user.position,
      level: user.level,
      division: user.division,
      homeBase: 'Jakarta',
      departmentId: department?.id ?? null,
      areaCodeId: headOffice.id,
      salesAreaId: user.division === 'SALES' ? regional.id : null,
      isActive: true,
    };

    const existing = await prisma.employee.findFirst({
      where: { companyId, employeeCode: user.employeeCode },
      select: { id: true },
    });

    if (existing) {
      await prisma.employee.update({ where: { id: existing.id }, data });
      employeeIdsByCode.set(user.employeeCode, existing.id);
      continue;
    }

    // A single login account may only be linked to one employee record, so
    // the link is skipped when the account already has one elsewhere.
    const alreadyLinked = await prisma.employee.findUnique({
      where: { userId: user.userId },
      select: { id: true },
    });

    const created = await prisma.employee.create({
      data: {
        companyId,
        employeeCode: user.employeeCode,
        ...data,
        userId: alreadyLinked ? undefined : user.userId,
      },
      select: { id: true },
    });

    employeeIdsByCode.set(user.employeeCode, created.id);
  }

  const approverId = employeeIdsByCode.get('APR');

  if (!approverId) {
    return;
  }

  // Only departments without a head yet are filled in, so a head picked by
  // hand later survives a re-seed. The approver is a DIRECTOR and therefore
  // follows the board rule, which has no review step, so heading their own
  // department never turns into reviewing their own claim.
  await prisma.department.updateMany({
    where: { companyId, headEmployeeId: null },
    data: { headEmployeeId: approverId },
  });

  await prisma.salesArea.update({
    where: { id: regional.id },
    data: { managerEmployeeId: approverId },
  });
}
