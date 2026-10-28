import { Module } from '@nestjs/common';

import { BusinessCentralModule } from '../business-central/business-central.module';
import { ExpenseMasterModule } from '../expense-master/expense-master.module';
import { PettyCashController } from './petty-cash.controller';
import { PettyCashService } from './petty-cash.service';

@Module({
  imports: [ExpenseMasterModule, BusinessCentralModule],
  controllers: [PettyCashController],
  providers: [PettyCashService],
})
export class PettyCashModule {}
