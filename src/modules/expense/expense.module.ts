import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { EXPENSE_OCR_QUEUE } from '../../common/queue/queue.constants';
import { BusinessCentralModule } from '../business-central/business-central.module';
import { ExpenseMasterModule } from '../expense-master/expense-master.module';
import { ExpenseClaimsController } from './expense-claims.controller';
import { ExpenseClaimsService } from './expense-claims.service';
import { ExpenseEntriesController } from './expense-entries.controller';
import { ExpenseEntriesService } from './expense-entries.service';
import { ExpenseOcrController } from './expense-ocr/expense-ocr.controller';
import { ExpenseOcrProcessor } from './expense-ocr/expense-ocr.processor';
import { ExpenseOcrProvider } from './expense-ocr/expense-ocr.provider';
import { ExpenseOcrService } from './expense-ocr/expense-ocr.service';

@Module({
  imports: [
    ExpenseMasterModule,
    BusinessCentralModule,
    BullModule.registerQueue({ name: EXPENSE_OCR_QUEUE }),
  ],
  controllers: [
    ExpenseEntriesController,
    ExpenseClaimsController,
    ExpenseOcrController,
  ],
  providers: [
    ExpenseEntriesService,
    ExpenseClaimsService,
    ExpenseOcrService,
    ExpenseOcrProcessor,
    ExpenseOcrProvider,
  ],
  exports: [ExpenseEntriesService, ExpenseClaimsService],
})
export class ExpenseModule {}
