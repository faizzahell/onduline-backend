import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { CompanyModule } from './common/company/company.module';
import { HealthController } from './common/health/health.controller';
import { NumberingModule } from './common/numbering/numbering.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { QueueModule } from './common/queue/queue.module';
import { StorageModule } from './common/storage/storage.module';
import { validateEnv } from './config/env.validation';
import { ApprovalModule } from './modules/approval/approval.module';
import { AuthModule } from './modules/auth/auth.module';
import { BusinessCentralModule } from './modules/business-central/business-central.module';
import { CashAdvanceModule } from './modules/cash-advance/cash-advance.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { ExpenseMasterModule } from './modules/expense-master/expense-master.module';
import { ExpenseReportsModule } from './modules/expense-reports/expense-reports.module';
import { ExpenseModule } from './modules/expense/expense.module';
import { OcrInvoiceModule } from './modules/ocr-invoice/ocr-invoice.module';
import { PettyCashModule } from './modules/petty-cash/petty-cash.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),

    // Infrastruktur bersama, semuanya @Global().
    PrismaModule,
    QueueModule,
    StorageModule,
    CompanyModule,
    NumberingModule,
    RbacModule,
    ApprovalModule,

    // Modul domain.
    AuthModule,
    UsersModule,
    CompaniesModule,
    BusinessCentralModule,
    OcrInvoiceModule,
    ExpenseMasterModule,
    ExpenseModule,
    PettyCashModule,
    CashAdvanceModule,
    ExpenseReportsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
