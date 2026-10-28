import { Module } from '@nestjs/common';

import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { ExpenseMasterController } from './expense-master.controller';
import { ExpenseMasterService } from './expense-master.service';

@Module({
  controllers: [ExpenseMasterController, EmployeesController],
  providers: [ExpenseMasterService, EmployeesService],
  exports: [ExpenseMasterService, EmployeesService],
})
export class ExpenseMasterModule {}
