import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { CompanyContext } from '../../common/types/company-context';
import { BcJournalService } from './bc-journal.service';

@ApiTags('Business Central')
@ApiBearerAuth()
@Controller('business-central/journals')
@UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
export class BcJournalController {
  constructor(private readonly journalService: BcJournalService) {}

  @Get()
  @Permissions('expense:accrue', 'expense:post', 'expense:report')
  @ApiOperation({ summary: 'General Journal batches that have been built' })
  list(
    @CurrentCompany() company: CompanyContext,
    @Query('status') status?: string,
  ) {
    return this.journalService.listBatches(company.id, status);
  }

  @Get(':id')
  @Permissions('expense:accrue', 'expense:post', 'expense:report')
  findOne(
    @CurrentCompany() company: CompanyContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.journalService.findBatch(company.id, id);
  }

  @Get(':id/export')
  @Permissions('expense:accrue', 'expense:post', 'expense:report')
  @ApiOperation({
    summary:
      'Flat journal lines with the same columns as the BC General Journal worksheet',
  })
  export(
    @CurrentCompany() company: CompanyContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.journalService.exportBatch(company.id, id);
  }
}
