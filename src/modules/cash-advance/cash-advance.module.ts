import { Module } from '@nestjs/common';

import { ExpenseMasterModule } from '../expense-master/expense-master.module';
import { CashAdvanceController } from './cash-advance.controller';
import { CashAdvanceService } from './cash-advance.service';

@Module({
  imports: [ExpenseMasterModule],
  controllers: [CashAdvanceController],
  providers: [CashAdvanceService],
})
export class CashAdvanceModule {}
