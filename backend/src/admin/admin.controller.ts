import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, Req, Res } from '@nestjs/common';
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

  @Get('stats/growth')
  getGrowthData() {
    return this.adminService.getGrowthData();
  }

  @Get('reports')
  getReports() {
    return this.adminService.getReportData();
  }

  // ── Users ──

  @Get('users')
  getUsers(
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('role') role?: string,
    @Query('status') status?: string,
  ) {
    return this.adminService.getAllUsers({
      search,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
      role,
      status,
    });
  }

  @Post('users')
  createAdminUser(@Body() body: { name: string; email: string; password: string }, @Req() req: any) {
    return this.adminService.createAdminUser(body, req.user.sub);
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

  @Post('users/:id/impersonate')
  async impersonateUser(@Param('id') id: string, @Req() req: any) {
    return this.adminService.impersonateUser(id, req.user.sub);
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

  // ── Audit Log ──

  @Get('audit-logs')
  getAuditLogs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('action') action?: string,
    @Query('dateRange') dateRange?: string,
  ) {
    return this.adminService.getAuditLogs(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 25,
      search,
      action,
      dateRange,
    );
  }

  @Get('audit-logs/stats')
  getAuditStats() {
    return this.adminService.getAuditStats();
  }

  @Get('audit-logs/export')
  async exportAuditLogs(
    @Query('search') search?: string,
    @Query('action') action?: string,
    @Query('dateRange') dateRange?: string,
    @Res() res?: any,
  ) {
    const csv = await this.adminService.exportAuditLogsCsv(search, action, dateRange);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=audit-logs.csv');
    res.send(csv);
  }

  // ── Maintenance Mode ──

  @Get('maintenance')
  getMaintenanceMode() {
    return this.adminService.getMaintenanceMode();
  }

  @Put('maintenance')
  setMaintenanceMode(@Body() body: { enabled: boolean; message: string }, @Req() req: any) {
    return this.adminService.setMaintenanceMode(body.enabled, body.message, req.user.sub);
  }

  // ── Bulk User Actions ──

  @Post('users/bulk')
  async bulkUpdateUsers(@Body() body: { ids: string[]; action: string; value?: string }, @Req() req: any) {
    return this.adminService.bulkUpdateUsers(body.ids, body.action, req.user.sub, body.value);
  }

  // ── Feature Flags ──

  @Get('feature-flags')
  getFeatureFlags() {
    return this.adminService.getFeatureFlags();
  }

  @Put('feature-flags/:key')
  setFeatureFlag(@Param('key') key: string, @Body() body: { enabled: boolean }, @Req() req: any) {
    return this.adminService.setFeatureFlag(key, body.enabled, req.user.sub);
  }

  // ── Security & Control ──

  @Post('users/force-logout-all')
  async forceLogoutAll(@Req() req: any) {
    return this.adminService.forceLogoutAllUsers(req.user.sub);
  }

  @Post('users/:id/force-logout')
  async forceLogout(@Param('id') id: string, @Req() req: any) {
    return this.adminService.forceLogoutUser(id, req.user.sub);
  }

  @Get('security/locked-accounts')
  getLockedAccounts() {
    return this.adminService.getLockedAccounts();
  }

  @Post('users/:id/unlock')
  async unlockUser(@Param('id') id: string, @Req() req: any) {
    return this.adminService.unlockUser(id, req.user.sub);
  }

  @Get('security/password-policy')
  getPasswordPolicy() {
    return this.adminService.getPasswordPolicy();
  }

  @Put('security/password-policy')
  setPasswordPolicy(@Body() body: any, @Req() req: any) {
    return this.adminService.setPasswordPolicy(body, req.user.sub);
  }

  @Get('security/active-sessions')
  getActiveSessions() {
    return this.adminService.getActiveSessions();
  }

  @Get('security/settings')
  getSecuritySettings() {
    return this.adminService.getSecuritySettings();
  }

  @Put('security/settings')
  setSecuritySettings(@Body() body: any, @Req() req: any) {
    return this.adminService.setSecuritySettings(body, req.user.sub);
  }

  @Get('security/overview')
  getSecurityOverview() {
    return this.adminService.getSecurityOverview();
  }
}
