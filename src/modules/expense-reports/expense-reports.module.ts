import { Module } from '@nestjs/common';

import { ExpenseMasterModule } from '../expense-master/expense-master.module';
import { ExpenseReportsController } from './expense-reports.controller';
import { ExpenseReportsService } from './expense-reports.service';

@Module({
  imports: [ExpenseMasterModule],
  controllers: [ExpenseReportsController],
  providers: [ExpenseReportsService],
})
export class ExpenseReportsModule {}
