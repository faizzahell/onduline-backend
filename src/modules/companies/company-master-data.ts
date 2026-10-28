import type { PrismaTransactionClient } from '../../common/prisma/prisma-transaction';

/**
 * The master data every company starts with: expense/petty-cash categories,
 * BC dimensions, and the approval matrix. Extracted here so a company created
 * at runtime gets exactly what the seed used to hand-build, keeping the two in
 * sync from one definition.
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
}

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
  { code: 'PC6', name: 'Stamp Duty', gl: GL.STAMP_DUTY, pettyCashCode: 'PC6' },
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

interface ApprovalRuleSeed {
  name: string;
  documentType: 'EXPENSE_CLAIM' | 'PETTY_CASH_BATCH' | 'CASH_ADVANCE';
  claimantLevel: 'STAFF' | 'MANAGER' | 'DIRECTOR' | null;
  claimantDivision: 'SALES' | 'NON_SALES' | null;
  priority: number;
  steps: {
    stepType: 'ACCRUE' | 'REVIEW' | 'APPROVE' | 'POST';
    approverType: 'ROLE' | 'DEPARTMENT_HEAD' | 'REGIONAL_MANAGER';
    approverRoleName?: string;
    label: string;
  }[];
}

const approvalRules: ApprovalRuleSeed[] = [
  {
    name: 'Expense Claim - Board of Directors',
    documentType: 'EXPENSE_CLAIM',
    claimantLevel: 'DIRECTOR',
    claimantDivision: null,
    priority: 40,
    steps: [
      {
        stepType: 'ACCRUE',
        approverType: 'ROLE',
        approverRoleName: 'FINANCE',
        label: 'Accrual by Finance',
      },
      {
        stepType: 'APPROVE',
        approverType: 'ROLE',
        approverRoleName: 'EXPENSE_APPROVER',
        label: 'Cross-approval between directors',
      },
      {
        stepType: 'POST',
        approverType: 'ROLE',
        approverRoleName: 'FINANCE',
        label: 'Posting by Finance',
      },
    ],
  },
  {
    name: 'Expense Claim - Sales Manager',
    documentType: 'EXPENSE_CLAIM',
    claimantLevel: 'MANAGER',
    claimantDivision: 'SALES',
    priority: 30,
    steps: [
      {
        stepType: 'ACCRUE',
        approverType: 'ROLE',
        approverRoleName: 'FINANCE',
        label: 'Accrual by Finance',
      },
      {
        stepType: 'APPROVE',
        approverType: 'ROLE',
        approverRoleName: 'EXPENSE_APPROVER',
        label: 'Director approval',
      },
      {
        stepType: 'POST',
        approverType: 'ROLE',
        approverRoleName: 'FINANCE',
        label: 'Posting by Finance',
      },
    ],
  },
  {
    name: 'Expense Claim - Sales Non Manager',
    documentType: 'EXPENSE_CLAIM',
    claimantLevel: 'STAFF',
    claimantDivision: 'SALES',
    priority: 30,
    steps: [
      {
        stepType: 'ACCRUE',
        approverType: 'ROLE',
        approverRoleName: 'FINANCE',
        label: 'Accrual by Finance',
      },
      {
        stepType: 'REVIEW',
        approverType: 'REGIONAL_MANAGER',
        label: 'Review Regional Manager',
      },
      {
        stepType: 'APPROVE',
        approverType: 'ROLE',
        approverRoleName: 'EXPENSE_APPROVER',
        label: 'Director approval',
      },
      {
        stepType: 'POST',
        approverType: 'ROLE',
        approverRoleName: 'FINANCE',
        label: 'Posting by Finance',
      },
    ],
  },
  {
    name: 'Expense Claim - Non Sales / Back Office',
    documentType: 'EXPENSE_CLAIM',
    claimantLevel: null,
    claimantDivision: 'NON_SALES',
    priority: 20,
    steps: [
      {
        stepType: 'ACCRUE',
        approverType: 'ROLE',
        approverRoleName: 'FINANCE',
        label: 'Accrual by Finance',
      },
      {
        stepType: 'REVIEW',
        approverType: 'DEPARTMENT_HEAD',
        label: 'Review HOD',
      },
      {
        stepType: 'APPROVE',
        approverType: 'ROLE',
        approverRoleName: 'EXPENSE_APPROVER',
        label: 'Director approval',
      },
      {
        stepType: 'POST',
        approverType: 'ROLE',
        approverRoleName: 'FINANCE',
        label: 'Posting by Finance',
      },
    ],
  },
  {
    name: 'Expense Claim - Default',
    documentType: 'EXPENSE_CLAIM',
    claimantLevel: null,
    claimantDivision: null,
    priority: 0,
    steps: [
      {
        stepType: 'ACCRUE',
        approverType: 'ROLE',
        approverRoleName: 'FINANCE',
        label: 'Accrual by Finance',
      },
      {
        stepType: 'APPROVE',
        approverType: 'ROLE',
        approverRoleName: 'EXPENSE_APPROVER',
        label: 'Director approval',
      },
      {
        stepType: 'POST',
        approverType: 'ROLE',
        approverRoleName: 'FINANCE',
        label: 'Posting by Finance',
      },
    ],
  },
  {
    name: 'Petty Cash - Default',
    documentType: 'PETTY_CASH_BATCH',
    claimantLevel: null,
    claimantDivision: null,
    priority: 0,
    steps: [
      {
        stepType: 'APPROVE',
        approverType: 'ROLE',
        approverRoleName: 'EXPENSE_APPROVER',
        label: 'Director approval',
      },
      {
        stepType: 'POST',
        approverType: 'ROLE',
        approverRoleName: 'FINANCE',
        label: 'Submit & post to BC',
      },
    ],
  },
  {
    name: 'Cash Advance - Default',
    documentType: 'CASH_ADVANCE',
    claimantLevel: null,
    claimantDivision: null,
    priority: 0,
    steps: [
      {
        stepType: 'REVIEW',
        approverType: 'ROLE',
        approverRoleName: 'EXPENSE_APPROVER',
        label: 'Supervisor review',
      },
      {
        stepType: 'APPROVE',
        approverType: 'ROLE',
        approverRoleName: 'EXPENSE_APPROVER',
        label: 'Director approval',
      },
      {
        stepType: 'POST',
        approverType: 'ROLE',
        approverRoleName: 'FINANCE',
        label: 'Posting by Finance',
      },
    ],
  },
];

/**
 * Fills a freshly created company with its starting master data.
 *
 * Idempotent: every write is an upsert or a replace keyed on the company, so
 * re-running it (e.g. the seed) never duplicates anything.
 */
export async function provisionCompanyMasterData(
  tx: PrismaTransactionClient,
  companyId: string,
): Promise<void> {
  for (const area of areaCodes) {
    await tx.areaCode.upsert({
      where: { companyId_code: { companyId, code: area.code } },
      update: { name: area.name },
      create: { companyId, ...area },
    });
  }

  for (const department of departments) {
    await tx.department.upsert({
      where: { companyId_code: { companyId, code: department.code } },
      update: { name: department.name },
      create: { companyId, ...department },
    });
  }

  for (const salesArea of salesAreas) {
    await tx.salesArea.upsert({
      where: { companyId_code: { companyId, code: salesArea.code } },
      update: { name: salesArea.name },
      create: { companyId, ...salesArea },
    });
  }

  for (const marketingCode of marketingCodes) {
    await tx.marketingCode.upsert({
      where: { companyId_code: { companyId, code: marketingCode.code } },
      update: { name: marketingCode.name },
      create: { companyId, ...marketingCode },
    });
  }

  const categories = [
    ...expenseCategories.map((c) => ({
      ...c,
      availableForExpense: true,
      availableForPettyCash: false,
    })),
    ...pettyCashCategories.map((c) => ({
      ...c,
      availableForExpense: false,
      availableForPettyCash: true,
    })),
  ];

  for (const category of categories) {
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

    await tx.expenseCategory.upsert({
      where: { companyId_code: { companyId, code: category.code } },
      update: data,
      create: { companyId, code: category.code, ...data },
    });
  }

  const mealAllowance = await tx.expenseCategory.findUniqueOrThrow({
    where: { companyId_code: { companyId, code: 'MEAL_ALLOWANCE' } },
  });

  const existingRate = await tx.expenseRate.findFirst({
    where: { categoryId: mealAllowance.id },
  });

  if (!existingRate) {
    await tx.expenseRate.create({
      data: {
        categoryId: mealAllowance.id,
        amount: MEAL_ALLOWANCE_RATE,
        effectiveFrom: new Date(Date.UTC(2026, 0, 1)),
      },
    });
  }

  for (const rule of approvalRules) {
    const existing = await tx.approvalRule.findFirst({
      where: { companyId, name: rule.name },
      select: { id: true },
    });

    if (existing) {
      await tx.approvalRuleStep.deleteMany({ where: { ruleId: existing.id } });
      await tx.approvalRule.delete({ where: { id: existing.id } });
    }

    await tx.approvalRule.create({
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
            approverRoleName: step.approverRoleName ?? null,
            label: step.label,
          })),
        },
      },
    });
  }
}
