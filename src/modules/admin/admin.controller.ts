import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { Public } from '../access/public.decorator';
import { AdminKeyGuard } from './admin-key.guard';
import type { AdminStats, AdminUserDetail, AdminUserList } from './admin.contract';
import { AdminService } from './admin.service';
import { AdminUsersQueryDto } from './dto/admin-users-query.dto';

@ApiExcludeController()
@Public()
@UseGuards(AdminKeyGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  getStats(): Promise<AdminStats> {
    return this.adminService.getStats();
  }

  @Get('users')
  listUsers(@Query() query: AdminUsersQueryDto): Promise<AdminUserList> {
    return this.adminService.listUsers(query);
  }

  @Get('users/:id')
  getUser(@Param('id', ParseUUIDPipe) id: string): Promise<AdminUserDetail> {
    return this.adminService.getUser(id);
  }
}
