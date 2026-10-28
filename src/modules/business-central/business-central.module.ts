import { Module } from '@nestjs/common';

import { BcJournalController } from './bc-journal.controller';
import { BcJournalService } from './bc-journal.service';
import { BusinessCentralService } from './business-central.service';
import { BUSINESS_CENTRAL_CLIENT } from './business-central.types';
import { MockBusinessCentralClient } from './clients/mock-business-central.client';

@Module({
  controllers: [BcJournalController],
  providers: [
    MockBusinessCentralClient,
    {
      // Swap this line for the real HTTP client once the Business Central
      // credentials are available.
      provide: BUSINESS_CENTRAL_CLIENT,
      useExisting: MockBusinessCentralClient,
    },
    BusinessCentralService,
    BcJournalService,
  ],
  exports: [BusinessCentralService, BcJournalService],
})
export class BusinessCentralModule {}
