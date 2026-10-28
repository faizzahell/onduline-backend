import { Module } from '@nestjs/common';

import { CompaniesController } from './companies.controller';
import { CompanySettingsService } from './company-settings.service';
import { DatabaseMaintenanceService } from './database-maintenance.service';

@Module({
  controllers: [CompaniesController],
  providers: [CompanySettingsService, DatabaseMaintenanceService],
  exports: [CompanySettingsService],
})
export class CompaniesModule {}
