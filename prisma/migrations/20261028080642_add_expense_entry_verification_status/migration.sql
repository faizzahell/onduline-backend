-- CreateEnum
CREATE TYPE "ExpenseEntryStatus" AS ENUM ('DRAFT', 'VERIFIED');

-- AlterTable
ALTER TABLE "ExpenseEntry" ADD COLUMN     "status" "ExpenseEntryStatus" NOT NULL DEFAULT 'VERIFIED';

-- CreateIndex
CREATE INDEX "ExpenseEntry_companyId_employeeId_status_idx" ON "ExpenseEntry"("companyId", "employeeId", "status");
