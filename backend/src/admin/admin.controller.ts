import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, Req } from '@nestjs/common';
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

  @Post('users')
  createAdminUser(@Body() body: { name: string; email: string; password: string }) {
    return this.adminService.createAdminUser(body);
  }

  @Put('users/:id')
  async updateUser(@Param('id') id: string, @Body() body: { role?: string; name?: string }, @Req() req: any) {
    const requester = await this.adminService.getUserRole(req.user.sub);
    return this.adminService.updateUser(id, body, requester);
  }

  @Delete('users/:id')
  async deleteUser(@Param('id') id: string, @Req() req: any) {
    const requester = await this.adminService.getUserRole(req.user.sub);
    return this.adminService.deleteUser(id, req.user.sub, requester);
  }

  @Put('users/:id/toggle-active')
  async toggleUserActive(@Param('id') id: string, @Req() req: any) {
    const requester = await this.adminService.getUserRole(req.user.sub);
    return this.adminService.toggleUserActive(id, req.user.sub, requester);
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

  // ── Banners ──

  @Get('banners')
  getBanners() {
    return this.adminService.getAllBanners();
  }

  @Post('banners')
  createBanner(@Body() body: { text: string }) {
    return this.adminService.createBanner(body.text);
  }

  @Put('banners/:id')
  updateBanner(@Param('id') id: string, @Body() body: { text?: string; isActive?: boolean; sortOrder?: number; isDeleted?: boolean }) {
    return this.adminService.updateBanner(id, body);
  }

  @Delete('banners/:id')
  deleteBanner(@Param('id') id: string) {
    return this.adminService.deleteBanner(id);
  }
}
