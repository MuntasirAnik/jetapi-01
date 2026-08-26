import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  Res,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import { RateLimitGuard } from './rate-limit.guard';

@Controller(['admin', 'api/admin'])
@UseGuards(AuthGuard, AdminGuard)
export class AdminController {
  constructor(
    private adminService: AdminService,
    private rateLimitGuard: RateLimitGuard,
  ) {}

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
  createAdminUser(
    @Body() body: { name: string; email: string; password: string },
    @Req() req: any,
  ) {
    return this.adminService.createAdminUser(body, req.user.sub);
  }

  @Put('users/:id')
  async updateUser(
    @Param('id') id: string,
    @Body() body: { role?: string; name?: string },
    @Req() req: any,
  ) {
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
  overrideUserPlan(
    @Param('userId') userId: string,
    @Body() body: { planId: string },
  ) {
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
  updateBanner(
    @Param('id') id: string,
    @Body()
    body: {
      text?: string;
      isActive?: boolean;
      sortOrder?: number;
      isDeleted?: boolean;
    },
  ) {
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

  @Get('api-hits')
  getApiHits(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('method') method?: string,
    @Query('statusCode') statusCode?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.adminService.getApiHits(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 25,
      search,
      method,
      statusCode ? parseInt(statusCode) : undefined,
      startDate,
      endDate,
    );
  }

  @Get('api-hits/export')
  async exportApiHits(
    @Res() res: any,
    @Query('search') search?: string,
    @Query('method') method?: string,
    @Query('statusCode') statusCode?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const csv = await this.adminService.exportApiHitsCsv(
      search,
      method,
      statusCode ? parseInt(statusCode) : undefined,
      startDate,
      endDate,
    );
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="api-hits_${new Date().toISOString().split('T')[0]}.csv"`,
    );
    return res.send(csv);
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
    const csv = await this.adminService.exportAuditLogsCsv(
      search,
      action,
      dateRange,
    );
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
  setMaintenanceMode(
    @Body() body: { enabled: boolean; message: string },
    @Req() req: any,
  ) {
    return this.adminService.setMaintenanceMode(
      body.enabled,
      body.message,
      req.user.sub,
    );
  }

  // ── Bulk User Actions ──

  @Post('users/bulk')
  async bulkUpdateUsers(
    @Body() body: { ids: string[]; action: string; value?: string },
    @Req() req: any,
  ) {
    return this.adminService.bulkUpdateUsers(
      body.ids,
      body.action,
      req.user.sub,
      body.value,
    );
  }

  // ── Feature Flags ──

  @Get('feature-flags')
  getFeatureFlags() {
    return this.adminService.getFeatureFlags();
  }

  @Put('feature-flags/:key')
  setFeatureFlag(
    @Param('key') key: string,
    @Body() body: { enabled: boolean },
    @Req() req: any,
  ) {
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

  // ── Export Users CSV ──

  @Get('users/export')
  async exportUsers(@Res() res: any) {
    const csv = await this.adminService.exportUsersCsv();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=jetapi-users.csv',
    );
    res.send(csv);
  }

  // ── Changelog ──

  @Get('changelog')
  getChangelogs() {
    return this.adminService.getChangelogs();
  }

  @Get('changelog/next-version')
  getNextVersion() {
    return this.adminService.getNextVersion().then((v) => ({ version: v }));
  }

  @Post('changelog')
  createChangelog(
    @Body() body: { title: string; content: string; version?: string },
    @Req() req: any,
  ) {
    return this.adminService.createChangelog(body, req.user.sub);
  }

  @Put('changelog/:id')
  updateChangelog(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.adminService.updateChangelog(id, body, req.user.sub);
  }

  @Delete('changelog/:id')
  deleteChangelog(@Param('id') id: string, @Req() req: any) {
    return this.adminService.deleteChangelog(id, req.user.sub);
  }

  // ── Activity Heatmap ──

  @Get('stats/activity-heatmap')
  getActivityHeatmap() {
    return this.adminService.getActivityHeatmap();
  }

  // ── Branding ──

  @Get('branding')
  getBranding() {
    return this.adminService.getBranding();
  }

  @Put('branding')
  updateBranding(@Body() body: any, @Req() req: any) {
    return this.adminService.updateBranding(body, req.user.sub);
  }

  // ── Webhooks ──

  @Get('webhooks')
  getWebhookConfig() {
    return this.adminService.getWebhookConfig();
  }

  @Put('webhooks')
  updateWebhookConfig(
    @Body() body: { url: string; events: string[]; enabled: boolean },
    @Req() req: any,
  ) {
    return this.adminService.updateWebhookConfig(body, req.user.sub);
  }

  @Post('webhooks/test')
  testWebhook(@Body() body: { url: string }) {
    return this.adminService.testWebhook(body.url);
  }

  // ── Tickets ──

  @Get('tickets')
  getTickets(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('priority') priority?: string,
  ) {
    return this.adminService.getTickets({
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
      search,
      status,
      type,
      priority,
    });
  }

  @Get('tickets/stats')
  getTicketStats() {
    return this.adminService.getTicketStats();
  }

  @Get('tickets/:id')
  getTicket(@Param('id') id: string) {
    return this.adminService.getTicketById(id);
  }

  @Put('tickets/:id')
  updateTicket(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.adminService.updateTicket(id, body, req.user.sub);
  }

  @Put('tickets/:id/reply')
  replyToTicket(
    @Param('id') id: string,
    @Body() body: { reply: string },
    @Req() req: any,
  ) {
    return this.adminService.replyToTicket(id, body.reply, req.user.sub);
  }

  @Delete('tickets/:id')
  deleteTicket(@Param('id') id: string, @Req() req: any) {
    return this.adminService.deleteTicket(id, req.user.sub);
  }

  // ── Rate Limits ──

  @Get('rate-limits')
  getRateLimitConfig() {
    return this.adminService.getRateLimitConfig();
  }

  @Put('rate-limits')
  async setRateLimitConfig(@Body() body: any, @Req() req: any) {
    const result = await this.adminService.setRateLimitConfig(
      body,
      req.user.sub,
    );
    this.rateLimitGuard.invalidateCache();
    return result;
  }

  @Get('rate-limits/usage')
  async getRateLimitUsage() {
    const rawUsage = this.rateLimitGuard.getUsageStats();
    return this.adminService.getRateLimitUsage(rawUsage);
  }

  @Put('rate-limits/user/:userId')
  async setUserRateLimit(
    @Param('id') id: string,
    @Body() body: { limit: number },
    @Req() req: any,
    @Param('userId') userId: string,
  ) {
    const result = await this.adminService.setUserRateLimit(
      userId,
      body.limit,
      req.user.sub,
    );
    this.rateLimitGuard.invalidateCache();
    return result;
  }

  @Delete('rate-limits/user/:userId')
  async removeUserRateLimit(@Param('userId') userId: string, @Req() req: any) {
    const result = await this.adminService.removeUserRateLimit(
      userId,
      req.user.sub,
    );
    this.rateLimitGuard.invalidateCache();
    return result;
  }

  // ── Plugins ──

  @Get('plugins')
  getPlugins(@Query('category') category?: string) {
    return this.adminService.getPlugins(category);
  }

  @Get('plugins/:slug')
  getPlugin(@Param('slug') slug: string) {
    return this.adminService.getPlugin(slug);
  }

  @Put('plugins/:slug')
  updatePlugin(
    @Param('slug') slug: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    return this.adminService.updatePlugin(slug, body, req.user.sub);
  }

  @Post('plugins/:slug/test')
  testPlugin(@Param('slug') slug: string) {
    return this.adminService.testPlugin(slug);
  }
}
