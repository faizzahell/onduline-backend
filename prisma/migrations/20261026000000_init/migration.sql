-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('UPLOADED', 'PROCESSING', 'EXTRACTED', 'VALIDATION_REQUIRED', 'VALIDATED', 'MATCHED', 'SUBMITTED', 'POSTED', 'FAILED');

-- CreateEnum
CREATE TYPE "OCRJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "InvoiceSource" AS ENUM ('MANUAL', 'OCR');

-- CreateEnum
CREATE TYPE "ExpenseOcrStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "EmployeeLevel" AS ENUM ('STAFF', 'MANAGER', 'DIRECTOR');

-- CreateEnum
CREATE TYPE "EmployeeDivision" AS ENUM ('SALES', 'NON_SALES');

-- CreateEnum
CREATE TYPE "ExpenseSource" AS ENUM ('MANUAL', 'OCR', 'TIKET_IMPORT');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'ACCRUED', 'UNDER_REVIEW', 'REVISION_REQUESTED', 'APPROVED', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApprovalDocumentType" AS ENUM ('EXPENSE_CLAIM', 'PETTY_CASH_BATCH', 'CASH_ADVANCE');

-- CreateEnum
CREATE TYPE "ApprovalStepType" AS ENUM ('ACCRUE', 'REVIEW', 'APPROVE', 'POST');

-- CreateEnum
CREATE TYPE "ApproverType" AS ENUM ('SPECIFIC_EMPLOYEE', 'DEPARTMENT_HEAD', 'REGIONAL_MANAGER', 'ROLE');

-- CreateEnum
CREATE TYPE "ApprovalStepStatus" AS ENUM ('PENDING', 'APPROVED', 'REVISION_REQUESTED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "PettyCashBatchStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REVISION_REQUESTED', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CashAdvanceType" AS ENUM ('CASE_BY_CASE', 'YEARLY');

-- CreateEnum
CREATE TYPE "CashAdvanceStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'REVISION_REQUESTED', 'APPROVED', 'POSTED', 'SETTLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EntertainmentKind" AS ENUM ('LUNCH', 'DINNER', 'COFFEE_BREAK', 'GIFT', 'FLOWER_ARRANGEMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "BusinessRelationType" AS ENUM ('DISTRIBUTOR', 'CUSTOMER', 'CONSULTANT', 'INTERNAL', 'OTHER');

-- CreateEnum
CREATE TYPE "BcJournalType" AS ENUM ('ACCRUAL', 'REVERSAL_PAYMENT', 'PETTY_CASH', 'CASH_ADVANCE');

-- CreateEnum
CREATE TYPE "BcJournalStatus" AS ENUM ('PENDING', 'POSTED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "source" "InvoiceSource" NOT NULL DEFAULT 'MANUAL',
    "invoiceNumber" TEXT,
    "vendorName" TEXT,
    "vendorTaxId" TEXT,
    "invoiceDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "poNumber" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "subtotal" DECIMAL(18,2),
    "taxAmount" DECIMAL(18,2),
    "totalAmount" DECIMAL(18,2),
    "status" "InvoiceStatus" NOT NULL DEFAULT 'UPLOADED',
    "createdById" TEXT NOT NULL,
    "validatedById" TEXT,
    "validatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceFile" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OCRJob" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "status" "OCRJobStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT,
    "model" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OCRJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OCRResult" (
    "id" TEXT NOT NULL,
    "ocrJobId" TEXT NOT NULL,
    "rawText" TEXT,
    "rawJson" JSONB,
    "confidence" DECIMAL(5,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OCRResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(18,4),
    "unit" TEXT,
    "unitPrice" DECIMAL(18,2),
    "taxAmount" DECIMAL(18,2),
    "lineTotal" DECIMAL(18,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "accruedAccountNo" TEXT NOT NULL DEFAULT '32001900',
    "accruedAccountName" TEXT NOT NULL DEFAULT 'Accrued Others',
    "bankAccountNo" TEXT,
    "bankAccountName" TEXT,
    "journalInitials" TEXT NOT NULL DEFAULT 'IS',
    "pettyCashJournalInitials" TEXT NOT NULL DEFAULT 'RE',
    "accrualAreaCode" TEXT NOT NULL DEFAULT 'HO',
    "ocrInvoiceEnabled" BOOLEAN NOT NULL DEFAULT false,
    "ocrExpenseEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCompanyAccess" (
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserCompanyAccess_pkey" PRIMARY KEY ("userId","companyId")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "headEmployeeId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AreaCode" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AreaCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesArea" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "managerEmployeeId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingCode" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "employeeCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" TEXT,
    "level" "EmployeeLevel" NOT NULL DEFAULT 'STAFF',
    "division" "EmployeeDivision" NOT NULL DEFAULT 'NON_SALES',
    "homeBase" TEXT,
    "departmentId" TEXT,
    "areaCodeId" TEXT,
    "salesAreaId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "glAccountNo" TEXT,
    "glAccountName" TEXT,
    "pettyCashCode" TEXT,
    "requiresProof" BOOLEAN NOT NULL DEFAULT true,
    "requiresMarketingCode" BOOLEAN NOT NULL DEFAULT false,
    "requiresDestination" BOOLEAN NOT NULL DEFAULT false,
    "isFixedRate" BOOLEAN NOT NULL DEFAULT false,
    "perTransactionApprovalThreshold" DECIMAL(18,2),
    "isEntertainment" BOOLEAN NOT NULL DEFAULT false,
    "isMealAllowance" BOOLEAN NOT NULL DEFAULT false,
    "unitOfMeasure" TEXT,
    "availableForExpense" BOOLEAN NOT NULL DEFAULT true,
    "availableForPettyCash" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseRate" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRule" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "documentType" "ApprovalDocumentType" NOT NULL,
    "claimantLevel" "EmployeeLevel",
    "claimantDivision" "EmployeeDivision",
    "minAmount" DECIMAL(18,2),
    "maxAmount" DECIMAL(18,2),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRuleStep" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "stepType" "ApprovalStepType" NOT NULL,
    "approverType" "ApproverType" NOT NULL,
    "approverEmployeeId" TEXT,
    "approverRoleName" TEXT,
    "minAmount" DECIMAL(18,2),
    "label" TEXT,

    CONSTRAINT "ApprovalRuleStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseEntry" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "expenseDate" DATE NOT NULL,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quantity" DECIMAL(18,4) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "approvedAmount" DECIMAL(18,2),
    "description" TEXT,
    "destination" TEXT,
    "remark" TEXT,
    "marketingCodeId" TEXT,
    "source" "ExpenseSource" NOT NULL DEFAULT 'MANUAL',
    "ocrJobId" TEXT,
    "externalReference" TEXT,
    "claimId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseAttachment" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "isPaymentProof" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntertainmentDetail" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "merchantName" TEXT NOT NULL,
    "merchantAddress" TEXT,
    "kind" "EntertainmentKind" NOT NULL DEFAULT 'LUNCH',
    "relationName" TEXT NOT NULL,
    "relationPosition" TEXT,
    "relationPhone" TEXT,
    "relationCompany" TEXT,
    "relationBusinessType" "BusinessRelationType" NOT NULL DEFAULT 'CUSTOMER',
    "notes" TEXT,
    "approvalRequired" BOOLEAN NOT NULL DEFAULT false,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvalRemark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntertainmentDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealAllowanceDetail" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "days" INTEGER NOT NULL,
    "destination" TEXT NOT NULL,
    "oneWayDistanceKm" DECIMAL(10,2),
    "attendanceProofKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealAllowanceDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseRevision" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "previousAmount" DECIMAL(18,2) NOT NULL,
    "newAmount" DECIMAL(18,2) NOT NULL,
    "remark" TEXT NOT NULL,
    "revisedById" TEXT NOT NULL,
    "revisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseClaim" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "claimNumber" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "approvedAmount" DECIMAL(18,2),
    "submittedAt" TIMESTAMP(3),
    "accruedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimApprovalStep" (
    "id" TEXT NOT NULL,
    "documentType" "ApprovalDocumentType" NOT NULL,
    "claimId" TEXT,
    "pettyCashBatchId" TEXT,
    "cashAdvanceId" TEXT,
    "sequence" INTEGER NOT NULL,
    "stepType" "ApprovalStepType" NOT NULL,
    "label" TEXT,
    "assignedEmployeeId" TEXT,
    "assignedRoleName" TEXT,
    "status" "ApprovalStepStatus" NOT NULL DEFAULT 'PENDING',
    "actedByUserId" TEXT,
    "actedAt" TIMESTAMP(3),
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClaimApprovalStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PettyCashBatch" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "status" "PettyCashBatchStatus" NOT NULL DEFAULT 'DRAFT',
    "totalAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdByUserId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PettyCashBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PettyCashEntry" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "expenseDate" DATE NOT NULL,
    "categoryId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "areaCode" TEXT,
    "employeeCode" TEXT,
    "departmentCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PettyCashEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PettyCashAttachment" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PettyCashAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashAdvance" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "advanceNumber" TEXT NOT NULL,
    "type" "CashAdvanceType" NOT NULL,
    "employeeId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "periodYear" INTEGER,
    "purpose" TEXT,
    "status" "CashAdvanceStatus" NOT NULL DEFAULT 'DRAFT',
    "requestedByUserId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "settlementAmount" DECIMAL(18,2),
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashAdvance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentSequence" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "initials" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DocumentSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BcJournalBatch" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "documentNo" TEXT NOT NULL,
    "type" "BcJournalType" NOT NULL,
    "postingDate" DATE NOT NULL,
    "claimId" TEXT,
    "pettyCashBatchId" TEXT,
    "cashAdvanceId" TEXT,
    "status" "BcJournalStatus" NOT NULL DEFAULT 'PENDING',
    "postedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "bcDocumentNo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BcJournalBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BcJournalLine" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "accountType" TEXT NOT NULL DEFAULT 'G/L Account',
    "accountNo" TEXT NOT NULL,
    "accountName" TEXT,
    "description" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'IDR',
    "amount" DECIMAL(18,2) NOT NULL,
    "areaCode" TEXT,
    "employeeCode" TEXT,
    "departmentCode" TEXT,
    "marketingCode" TEXT,

    CONSTRAINT "BcJournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseOcrJob" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "status" "ExpenseOcrStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT,
    "model" TEXT,
    "confidence" DECIMAL(5,4),
    "rawJson" JSONB,
    "errorMessage" TEXT,
    "suggestedCategoryId" TEXT,
    "suggestedCategoryRaw" TEXT,
    "suggestedDate" DATE,
    "suggestedAmount" DECIMAL(18,2),
    "suggestedTaxAmount" DECIMAL(18,2),
    "suggestedMerchant" TEXT,
    "suggestedDescription" TEXT,
    "expenseEntryId" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseOcrJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

-- CreateIndex
CREATE INDEX "Invoice_companyId_status_idx" ON "Invoice"("companyId", "status");

-- CreateIndex
CREATE INDEX "Invoice_createdById_idx" ON "Invoice"("createdById");

-- CreateIndex
CREATE INDEX "Invoice_invoiceNumber_idx" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "InvoiceFile_invoiceId_idx" ON "InvoiceFile"("invoiceId");

-- CreateIndex
CREATE INDEX "OCRJob_invoiceId_idx" ON "OCRJob"("invoiceId");

-- CreateIndex
CREATE INDEX "OCRJob_status_idx" ON "OCRJob"("status");

-- CreateIndex
CREATE UNIQUE INDEX "OCRResult_ocrJobId_key" ON "OCRResult"("ocrJobId");

-- CreateIndex
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Company_code_key" ON "Company"("code");

-- CreateIndex
CREATE INDEX "UserCompanyAccess_companyId_idx" ON "UserCompanyAccess"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Department_companyId_code_key" ON "Department"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "AreaCode_companyId_code_key" ON "AreaCode"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "SalesArea_companyId_code_key" ON "SalesArea"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingCode_companyId_code_key" ON "MarketingCode"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_userId_key" ON "Employee"("userId");

-- CreateIndex
CREATE INDEX "Employee_companyId_idx" ON "Employee"("companyId");

-- CreateIndex
CREATE INDEX "Employee_departmentId_idx" ON "Employee"("departmentId");

-- CreateIndex
CREATE INDEX "Employee_salesAreaId_idx" ON "Employee"("salesAreaId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_companyId_employeeCode_key" ON "Employee"("companyId", "employeeCode");

-- CreateIndex
CREATE INDEX "ExpenseCategory_companyId_idx" ON "ExpenseCategory"("companyId");

-- CreateIndex
CREATE INDEX "ExpenseCategory_parentId_idx" ON "ExpenseCategory"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_companyId_code_key" ON "ExpenseCategory"("companyId", "code");

-- CreateIndex
CREATE INDEX "ExpenseRate_categoryId_effectiveFrom_idx" ON "ExpenseRate"("categoryId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "ApprovalRule_companyId_documentType_isActive_idx" ON "ApprovalRule"("companyId", "documentType", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalRuleStep_ruleId_sequence_key" ON "ApprovalRuleStep"("ruleId", "sequence");

-- CreateIndex
CREATE INDEX "ExpenseEntry_companyId_employeeId_claimId_idx" ON "ExpenseEntry"("companyId", "employeeId", "claimId");

-- CreateIndex
CREATE INDEX "ExpenseEntry_companyId_enteredAt_idx" ON "ExpenseEntry"("companyId", "enteredAt");

-- CreateIndex
CREATE INDEX "ExpenseEntry_expenseDate_idx" ON "ExpenseEntry"("expenseDate");

-- CreateIndex
CREATE INDEX "ExpenseEntry_categoryId_idx" ON "ExpenseEntry"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseEntry_companyId_externalReference_key" ON "ExpenseEntry"("companyId", "externalReference");

-- CreateIndex
CREATE INDEX "ExpenseAttachment_entryId_idx" ON "ExpenseAttachment"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "EntertainmentDetail_entryId_key" ON "EntertainmentDetail"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "MealAllowanceDetail_entryId_key" ON "MealAllowanceDetail"("entryId");

-- CreateIndex
CREATE INDEX "ExpenseRevision_entryId_idx" ON "ExpenseRevision"("entryId");

-- CreateIndex
CREATE INDEX "ExpenseClaim_companyId_status_idx" ON "ExpenseClaim"("companyId", "status");

-- CreateIndex
CREATE INDEX "ExpenseClaim_employeeId_idx" ON "ExpenseClaim"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseClaim_companyId_claimNumber_key" ON "ExpenseClaim"("companyId", "claimNumber");

-- CreateIndex
CREATE INDEX "ClaimApprovalStep_claimId_sequence_idx" ON "ClaimApprovalStep"("claimId", "sequence");

-- CreateIndex
CREATE INDEX "ClaimApprovalStep_pettyCashBatchId_sequence_idx" ON "ClaimApprovalStep"("pettyCashBatchId", "sequence");

-- CreateIndex
CREATE INDEX "ClaimApprovalStep_cashAdvanceId_sequence_idx" ON "ClaimApprovalStep"("cashAdvanceId", "sequence");

-- CreateIndex
CREATE INDEX "ClaimApprovalStep_status_idx" ON "ClaimApprovalStep"("status");

-- CreateIndex
CREATE INDEX "PettyCashBatch_companyId_status_idx" ON "PettyCashBatch"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PettyCashBatch_companyId_batchNumber_key" ON "PettyCashBatch"("companyId", "batchNumber");

-- CreateIndex
CREATE INDEX "PettyCashEntry_batchId_idx" ON "PettyCashEntry"("batchId");

-- CreateIndex
CREATE INDEX "PettyCashEntry_categoryId_idx" ON "PettyCashEntry"("categoryId");

-- CreateIndex
CREATE INDEX "PettyCashAttachment_entryId_idx" ON "PettyCashAttachment"("entryId");

-- CreateIndex
CREATE INDEX "CashAdvance_companyId_status_idx" ON "CashAdvance"("companyId", "status");

-- CreateIndex
CREATE INDEX "CashAdvance_employeeId_idx" ON "CashAdvance"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "CashAdvance_companyId_advanceNumber_key" ON "CashAdvance"("companyId", "advanceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentSequence_companyId_prefix_initials_year_key" ON "DocumentSequence"("companyId", "prefix", "initials", "year");

-- CreateIndex
CREATE INDEX "BcJournalBatch_companyId_status_idx" ON "BcJournalBatch"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BcJournalBatch_companyId_documentNo_key" ON "BcJournalBatch"("companyId", "documentNo");

-- CreateIndex
CREATE INDEX "BcJournalLine_batchId_idx" ON "BcJournalLine"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "BcJournalLine_batchId_lineNumber_key" ON "BcJournalLine"("batchId", "lineNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseOcrJob_expenseEntryId_key" ON "ExpenseOcrJob"("expenseEntryId");

-- CreateIndex
CREATE INDEX "ExpenseOcrJob_companyId_status_idx" ON "ExpenseOcrJob"("companyId", "status");

-- CreateIndex
CREATE INDEX "ExpenseOcrJob_uploadedByUserId_idx" ON "ExpenseOcrJob"("uploadedByUserId");

-- CreateIndex
CREATE INDEX "ExpenseOcrJob_suggestedCategoryId_idx" ON "ExpenseOcrJob"("suggestedCategoryId");

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_validatedById_fkey" FOREIGN KEY ("validatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceFile" ADD CONSTRAINT "InvoiceFile_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OCRJob" ADD CONSTRAINT "OCRJob_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OCRResult" ADD CONSTRAINT "OCRResult_ocrJobId_fkey" FOREIGN KEY ("ocrJobId") REFERENCES "OCRJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCompanyAccess" ADD CONSTRAINT "UserCompanyAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCompanyAccess" ADD CONSTRAINT "UserCompanyAccess_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_headEmployeeId_fkey" FOREIGN KEY ("headEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AreaCode" ADD CONSTRAINT "AreaCode_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesArea" ADD CONSTRAINT "SalesArea_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesArea" ADD CONSTRAINT "SalesArea_managerEmployeeId_fkey" FOREIGN KEY ("managerEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingCode" ADD CONSTRAINT "MarketingCode_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_areaCodeId_fkey" FOREIGN KEY ("areaCodeId") REFERENCES "AreaCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_salesAreaId_fkey" FOREIGN KEY ("salesAreaId") REFERENCES "SalesArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseRate" ADD CONSTRAINT "ExpenseRate_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRule" ADD CONSTRAINT "ApprovalRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRuleStep" ADD CONSTRAINT "ApprovalRuleStep_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "ApprovalRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRuleStep" ADD CONSTRAINT "ApprovalRuleStep_approverEmployeeId_fkey" FOREIGN KEY ("approverEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseEntry" ADD CONSTRAINT "ExpenseEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseEntry" ADD CONSTRAINT "ExpenseEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseEntry" ADD CONSTRAINT "ExpenseEntry_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseEntry" ADD CONSTRAINT "ExpenseEntry_marketingCodeId_fkey" FOREIGN KEY ("marketingCodeId") REFERENCES "MarketingCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseEntry" ADD CONSTRAINT "ExpenseEntry_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "ExpenseClaim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseAttachment" ADD CONSTRAINT "ExpenseAttachment_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "ExpenseEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntertainmentDetail" ADD CONSTRAINT "EntertainmentDetail_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "ExpenseEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealAllowanceDetail" ADD CONSTRAINT "MealAllowanceDetail_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "ExpenseEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseRevision" ADD CONSTRAINT "ExpenseRevision_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "ExpenseEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimApprovalStep" ADD CONSTRAINT "ClaimApprovalStep_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "ExpenseClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimApprovalStep" ADD CONSTRAINT "ClaimApprovalStep_pettyCashBatchId_fkey" FOREIGN KEY ("pettyCashBatchId") REFERENCES "PettyCashBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimApprovalStep" ADD CONSTRAINT "ClaimApprovalStep_cashAdvanceId_fkey" FOREIGN KEY ("cashAdvanceId") REFERENCES "CashAdvance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimApprovalStep" ADD CONSTRAINT "ClaimApprovalStep_assignedEmployeeId_fkey" FOREIGN KEY ("assignedEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCashBatch" ADD CONSTRAINT "PettyCashBatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCashEntry" ADD CONSTRAINT "PettyCashEntry_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PettyCashBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCashEntry" ADD CONSTRAINT "PettyCashEntry_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCashAttachment" ADD CONSTRAINT "PettyCashAttachment_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "PettyCashEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashAdvance" ADD CONSTRAINT "CashAdvance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashAdvance" ADD CONSTRAINT "CashAdvance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSequence" ADD CONSTRAINT "DocumentSequence_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BcJournalBatch" ADD CONSTRAINT "BcJournalBatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BcJournalBatch" ADD CONSTRAINT "BcJournalBatch_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "ExpenseClaim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BcJournalBatch" ADD CONSTRAINT "BcJournalBatch_pettyCashBatchId_fkey" FOREIGN KEY ("pettyCashBatchId") REFERENCES "PettyCashBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BcJournalBatch" ADD CONSTRAINT "BcJournalBatch_cashAdvanceId_fkey" FOREIGN KEY ("cashAdvanceId") REFERENCES "CashAdvance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BcJournalLine" ADD CONSTRAINT "BcJournalLine_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "BcJournalBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseOcrJob" ADD CONSTRAINT "ExpenseOcrJob_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseOcrJob" ADD CONSTRAINT "ExpenseOcrJob_suggestedCategoryId_fkey" FOREIGN KEY ("suggestedCategoryId") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseOcrJob" ADD CONSTRAINT "ExpenseOcrJob_expenseEntryId_fkey" FOREIGN KEY ("expenseEntryId") REFERENCES "ExpenseEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
