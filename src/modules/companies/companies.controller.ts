import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  COMPANY_SWITCH_PERMISSION,
  CompanyContextService,
} from '../../common/company/company-context.service';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import type { CompanyContext } from '../../common/types/company-context';
import { CompanySettingsService } from './company-settings.service';
import { DatabaseMaintenanceService } from './database-maintenance.service';
import { ClearDatabaseDto } from './dto/clear-database.dto';
import { CreateCompanyDto, UpdateCompanyDto } from './dto/company.dto';
import { SetDefaultCompanyDto } from './dto/set-default-company.dto';
import { UpdateOcrSettingsDto } from './dto/update-ocr-settings.dto';

@ApiTags('Companies')
@ApiBearerAuth()
@Controller('companies')
@UseGuards(JwtAuthGuard)
export class CompaniesController {
  constructor(
    private readonly companyContext: CompanyContextService,
    private readonly settings: CompanySettingsService,
    private readonly maintenance: DatabaseMaintenanceService,
  ) {}

  @Get('accessible')
  @ApiOperation({
    summary:
      'The companies the switcher may offer. Only a super administrator sees more than one.',
  })
  listAccessible(@CurrentUser() user: AuthenticatedUser) {
    return this.companyContext.listSelectableCompanies(user.id);
  }

  @Get('active')
  @UseGuards(CompanyAccessGuard)
  @ApiOperation({
    summary: 'The active company, or null when the user has no company yet',
  })
  getActive(@CurrentCompany() company?: CompanyContext) {
    return company ?? null;
  }

  @Put('default')
  @UseGuards(PermissionsGuard)
  @Permissions(COMPANY_SWITCH_PERMISSION)
  @ApiOperation({
    summary: "Set the user's default company. Super administrators only.",
  })
  async setDefault(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SetDefaultCompanyDto,
  ) {
    await this.companyContext.setDefaultCompany(user.id, dto.companyId);

    return { message: 'Default company updated' };
  }

  @Get('settings')
  @UseGuards(PermissionsGuard)
  @Permissions('company:manage')
  @ApiOperation({
    summary: 'Settings for every company. Super administrators only.',
  })
  listSettings() {
    return this.settings.listAll();
  }

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('company:manage')
  @ApiOperation({ summary: 'Create a company. Super administrators only.' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCompanyDto,
  ) {
    return this.settings.create(user.id, dto);
  }

  @Put(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('company:manage')
  @ApiOperation({ summary: 'Update a company. Super administrators only.' })
  updateCompany(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCompanyDto,
  ) {
    return this.settings.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('company:manage')
  @ApiOperation({
    summary:
      'Delete a company and everything scoped to it. Super administrators only.',
  })
  removeCompany(@Param('id', ParseUUIDPipe) id: string) {
    return this.settings.remove(id);
  }

  @Put(':id/ocr-settings')
  @UseGuards(PermissionsGuard)
  @Permissions('company:manage')
  @ApiOperation({ summary: 'Enable or disable OCR for a company' })
  updateOcrSettings(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOcrSettingsDto,
  ) {
    return this.settings.updateOcrSettings(id, dto);
  }

  @Post('maintenance/clear')
  @UseGuards(PermissionsGuard)
  @Permissions('company:manage')
  @ApiOperation({
    summary:
      'Development reset: clear all data or a single company. Super administrators only.',
  })
  clearDatabase(@Body() dto: ClearDatabaseDto) {
    return this.maintenance.clear(dto);
  }

  @Get(':id/export')
  @UseGuards(PermissionsGuard)
  @Permissions('company:manage')
  @ApiOperation({
    summary: "Export a company's data as JSON. Super administrators only.",
  })
  exportCompany(@Param('id', ParseUUIDPipe) id: string) {
    return this.maintenance.exportCompany(id);
  }
}
