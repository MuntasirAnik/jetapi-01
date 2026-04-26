import { Controller, Get, Put, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(AuthGuard, AdminGuard)
export class AdminController {
  constructor(private adminService: AdminService) {}

  // ── Stats ──

  @Get('stats')
  getStats() {
    return this.adminService.getStats();
  }

  // ── Users ──

  @Get('users')
  getUsers(@Query('search') search?: string) {
    return this.adminService.getAllUsers(search);
  }

  @Put('users/:id')
  updateUser(@Param('id') id: string, @Body() body: { role?: string; name?: string }) {
    return this.adminService.updateUser(id, body);
  }

  @Delete('users/:id')
  deleteUser(@Param('id') id: string) {
    return this.adminService.deleteUser(id);
  }

  // ── Organizations ──

  @Get('organizations')
  getOrganizations() {
    return this.adminService.getAllOrganizations();
  }

  @Delete('organizations/:id')
  deleteOrganization(@Param('id') id: string) {
    return this.adminService.deleteOrganization(id);
  }

  // ── Subscriptions ──

  @Get('subscriptions')
  getSubscriptions() {
    return this.adminService.getAllSubscriptions();
  }

  @Put('subscriptions/:userId')
  overrideUserPlan(@Param('userId') userId: string, @Body() body: { planId: string }) {
    return this.adminService.overrideUserPlan(userId, body.planId);
  }

  // ── Plan Config ──

  @Get('plans')
  getPlans() {
    return this.adminService.getPlansWithOverrides();
  }

  @Put('plans/:planId')
  updatePlan(@Param('planId') planId: string, @Body() body: any) {
    return this.adminService.updatePlanOverride(planId, body);
  }

  @Delete('plans/:planId')
  resetPlan(@Param('planId') planId: string) {
    return this.adminService.resetPlanOverride(planId);
  }

  // ── Payments ──

  @Get('payments')
  getPayments(@Query('year') year?: string, @Query('month') month?: string) {
    return this.adminService.getPayments(
      year ? parseInt(year) : undefined,
      month ? parseInt(month) : undefined,
    );
  }
}
