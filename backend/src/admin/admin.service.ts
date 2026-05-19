import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { User } from '../users/user.entity';
import { Organization } from '../organizations/organization.entity';
import { OrganizationUser } from '../organizations/organization-user.entity';
import { Collection } from '../collections/collection.entity';
import { Subscription } from '../subscriptions/subscription.entity';
import { PlanOverride } from './plan-override.entity';
import { Payment } from '../subscriptions/payment.entity';
import { Banner } from './banner.entity';
import { AuditLog } from './audit-log.entity';
import { SystemSetting } from './system-setting.entity';
import { PLANS, PlanId } from '../subscriptions/plans.config';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(Organization)
    private orgRepo: Repository<Organization>,
    @InjectRepository(OrganizationUser)
    private orgUserRepo: Repository<OrganizationUser>,
    @InjectRepository(Collection)
    private collectionRepo: Repository<Collection>,
    @InjectRepository(Subscription)
    private subRepo: Repository<Subscription>,
    @InjectRepository(PlanOverride)
    private overrideRepo: Repository<PlanOverride>,
    @InjectRepository(Payment)
    private paymentRepo: Repository<Payment>,
    @InjectRepository(Banner)
    private bannerRepo: Repository<Banner>,
    @InjectRepository(AuditLog)
    private auditRepo: Repository<AuditLog>,
    @InjectRepository(SystemSetting)
    private settingRepo: Repository<SystemSetting>,
    private jwtService: JwtService,
  ) {
    this.seedDefaultBanners();
  }

  // ── Admin User Creation ──

  async createAdminUser(data: { name: string; email: string; password: string }, performedBy?: string) {
    const existing = await this.userRepo.findOneBy({ email: data.email });
    if (existing) throw new BadRequestException('A user with this email already exists');
    const passwordHash = await bcrypt.hash(data.password, 10);
    const user = this.userRepo.create({
      name: data.name,
      email: data.email,
      passwordHash,
      role: 'ADMIN',
      isActive: true,
    });
    const saved = await this.userRepo.save(user);
    if (performedBy) {
      await this.logAction({ action: 'user.created', targetType: 'user', targetId: saved.id, targetLabel: saved.email, performedBy, details: { role: 'ADMIN' } });
    }
    return { id: saved.id, name: saved.name, email: saved.email, role: saved.role };
  }

  // ── Stats ──

  async getStats() {
    const [totalUsers, totalOrgs, totalCollections, totalSubscriptions] = await Promise.all([
      this.userRepo.count(),
      this.orgRepo.count(),
      this.collectionRepo.count(),
      this.subRepo.count({ where: { status: 'active' } }),
    ]);

    // Total revenue (from payment records)
    const payments = await this.paymentRepo.find({ where: { status: 'completed' } });
    const totalRevenue = payments.reduce((sum, p) => {
      const amount = parseFloat(p.amount.replace('$', '')) || 0;
      return sum + amount;
    }, 0);

    const planBreakdown = await this.subRepo
      .createQueryBuilder('sub')
      .select('sub.plan', 'plan')
      .addSelect('COUNT(*)', 'count')
      .where('sub.status = :status', { status: 'active' })
      .groupBy('sub.plan')
      .getRawMany();

    return {
      totalUsers,
      totalOrgs,
      totalCollections,
      totalSubscriptions,
      totalRevenue,
      totalPayments: payments.length,
      planBreakdown,
    };
  }

  // ── Helpers ──

  async getUserRole(userId: string): Promise<string> {
    const user = await this.userRepo.findOne({ where: { id: userId }, select: ['role'] });
    return user?.role || 'USER';
  }

  // ── Users ──

  async getAllUsers(params: { search?: string; page?: number; limit?: number; role?: string; status?: string; plan?: string }) {
    const page = params.page || 1;
    const limit = Math.min(params.limit || 20, 100);
    const offset = (page - 1) * limit;

    const query = this.userRepo.createQueryBuilder('user')
      .select([
        'user.id',
        'user.email',
        'user.name',
        'user.role',
        'user.isActive',
        'user.createdAt',
        'user.stripeCustomerId',
      ]);

    if (params.search) {
      query.where('(user.email ILIKE :search OR user.name ILIKE :search)', { search: `%${params.search}%` });
    }

    if (params.role && params.role !== 'all') {
      query.andWhere('user.role = :role', { role: params.role });
    }

    if (params.status === 'active') {
      query.andWhere('user.isActive = true');
    } else if (params.status === 'inactive') {
      query.andWhere('user.isActive = false');
    }

    query.orderBy('user.createdAt', 'DESC');

    const total = await query.getCount();
    const users = await query.skip(offset).take(limit).getMany();

    // Attach subscription info
    const result = await Promise.all(
      users.map(async (u) => {
        const sub = await this.subRepo.findOne({
          where: { userId: u.id },
          order: { createdAt: 'DESC' },
        });
        return {
          ...u,
          plan: sub?.plan || 'FREE',
          subscriptionStatus: sub?.status || 'none',
        };
      }),
    );

    return {
      users: result,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      limit,
    };
  }

  async updateUser(userId: string, data: { role?: string; name?: string }, requesterRole?: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role === 'SUPER_ADMIN' && requesterRole !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only Super Admins can modify other Super Admins');
    }

    if (data.role) user.role = data.role;
    if (data.name !== undefined) user.name = data.name;

    const result = await this.userRepo.save(user);
    if (requesterRole) {
      await this.logAction({ action: 'user.role_changed', targetType: 'user', targetId: userId, targetLabel: user.email, performedBy: userId, details: data }).catch(() => {});
    }
    return result;
  }

  async deleteUser(userId: string, requesterId: string, requesterRole?: string) {
    if (userId === requesterId) throw new ForbiddenException('You cannot deactivate yourself.');
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role === 'SUPER_ADMIN' && requesterRole !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only Super Admins can deactivate other Super Admins');
    }
    user.isActive = false;
    await this.userRepo.save(user);
    await this.logAction({ action: 'user.deactivated', targetType: 'user', targetId: userId, targetLabel: user.email, performedBy: requesterId }).catch(() => {});
    return { deactivated: true };
  }

  async toggleUserActive(userId: string, requesterId: string, requesterRole?: string) {
    if (userId === requesterId) throw new ForbiddenException('You cannot deactivate yourself.');
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role === 'SUPER_ADMIN' && requesterRole !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only Super Admins can modify other Super Admins');
    }
    user.isActive = !user.isActive;
    await this.userRepo.save(user);
    await this.logAction({ action: user.isActive ? 'user.activated' : 'user.deactivated', targetType: 'user', targetId: userId, targetLabel: user.email, performedBy: requesterId }).catch(() => {});
    return { isActive: user.isActive };
  }

  // ── Organizations ──

  async getAllOrganizations() {
    const orgs = await this.orgRepo.find({ order: { createdAt: 'DESC' } });

    const result = await Promise.all(
      orgs.map(async (org) => {
        const memberCount = await this.orgUserRepo.count({
          where: { organizationId: org.id },
        });
        const owner = await this.userRepo.findOne({ where: { id: org.ownerId } });
        return {
          ...org,
          memberCount,
          ownerEmail: owner?.email || 'Unknown',
        };
      }),
    );

    return result;
  }

  async deleteOrganization(orgId: string) {
    const org = await this.orgRepo.findOne({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');
    await this.orgRepo.remove(org);
    return { deleted: true };
  }

  // ── Subscriptions ──

  async getAllSubscriptions() {
    const subs = await this.subRepo.find({ order: { createdAt: 'DESC' } });

    const result = await Promise.all(
      subs.map(async (sub) => {
        const user = await this.userRepo.findOne({ where: { id: sub.userId } });
        return {
          ...sub,
          userEmail: user?.email || 'Unknown',
          userName: user?.name || '',
        };
      }),
    );

    return result;
  }

  async overrideUserPlan(userId: string, planId: string) {
    let sub = await this.subRepo.findOne({ where: { userId } });

    if (sub) {
      sub.plan = planId;
      sub.status = 'active';
    } else {
      sub = this.subRepo.create({
        userId,
        plan: planId,
        status: 'active',
        billingInterval: 'monthly',
      });
    }

    return this.subRepo.save(sub);
  }

  // ── Plan Overrides ──

  async getPlansWithOverrides() {
    const overrides = await this.overrideRepo.find();
    const overrideMap: Record<string, any> = {};
    overrides.forEach((o) => (overrideMap[o.planId] = o));

    return Object.values(PLANS).map((plan) => {
      const override = overrideMap[plan.id];
      const mergedLimits = { ...plan.limits };

      if (override) {
        if (override.maxCollections !== null) mergedLimits.maxCollections = override.maxCollections;
        if (override.maxRequestsPerCollection !== null) mergedLimits.maxRequestsPerCollection = override.maxRequestsPerCollection;
        if (override.maxMembers !== null) mergedLimits.maxMembers = override.maxMembers;
        if (override.maxCollaborators !== null) mergedLimits.maxCollaborators = override.maxCollaborators;
        if (override.maxEnvironments !== null) mergedLimits.maxEnvironments = override.maxEnvironments;
        if (override.historyDays !== null) mergedLimits.historyDays = override.historyDays;
        if (override.maxUploadMb !== null) mergedLimits.maxUploadMb = override.maxUploadMb;
        if (override.analyticsAccess !== null) mergedLimits.analyticsAccess = override.analyticsAccess;
      }

      return {
        id: plan.id,
        name: plan.name,
        description: plan.description,
        priceMonthly: plan.priceMonthly,
        priceYearly: plan.priceYearly,
        limits: mergedLimits,
        hasOverride: !!override,
      };
    });
  }

  async updatePlanOverride(planId: string, limits: Partial<PlanOverride>) {
    let override = await this.overrideRepo.findOne({ where: { planId } });

    if (override) {
      Object.assign(override, limits);
    } else {
      override = this.overrideRepo.create({ planId, ...limits });
    }

    return this.overrideRepo.save(override);
  }

  async resetPlanOverride(planId: string) {
    await this.overrideRepo.delete({ planId });
    return { reset: true };
  }

  // ── Payments ──

  async getPayments(year?: number, month?: number) {
    const query = this.paymentRepo.createQueryBuilder('payment')
      .orderBy('payment.createdAt', 'DESC');

    if (year && month) {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59);
      query.where('payment.createdAt >= :start AND payment.createdAt <= :end', {
        start: startDate,
        end: endDate,
      });
    }

    const payments = await query.getMany();

    // Calculate monthly total
    const monthlyTotal = payments.reduce((sum, p) => {
      const amount = parseFloat(p.amount.replace('$', '')) || 0;
      return sum + amount;
    }, 0);

    return {
      payments,
      total: payments.length,
      monthlyTotal,
      year: year || new Date().getFullYear(),
      month: month || new Date().getMonth() + 1,
    };
  }

  // ── Banners ──

  private async seedDefaultBanners() {
    const count = await this.bannerRepo.count();
    if (count > 0) return;
    const defaults = [
      '🚀 JetAPI v2.0 — History panel is now live! Track all your requests automatically.',
      '💡 Tip: Use {{variables}} in your URLs and headers for dynamic environments.',
      '⌨️ Shortcut: Press Ctrl+S (⌘+S) to save your request instantly.',
      '🔗 Share collections with your team — right-click any collection → Share.',
      '🌙 Toggle between dark and light themes from the top bar.',
    ];
    const banners = defaults.map((text, i) => this.bannerRepo.create({ text, isActive: true, sortOrder: i }));
    await this.bannerRepo.save(banners);
  }

  async getAllBanners() {
    return this.bannerRepo.find({ order: { isDeleted: 'ASC', sortOrder: 'ASC', createdAt: 'ASC' } });
  }

  async getActiveBanners() {
    return this.bannerRepo.find({ where: { isActive: true, isDeleted: false }, order: { sortOrder: 'ASC', createdAt: 'ASC' } });
  }

  async createBanner(text: string) {
    const maxSort = await this.bannerRepo.maximum('sortOrder') || 0;
    const banner = this.bannerRepo.create({ text, isActive: true, sortOrder: maxSort + 1 });
    return this.bannerRepo.save(banner);
  }

  async updateBanner(id: string, data: { text?: string; isActive?: boolean; sortOrder?: number; isDeleted?: boolean }) {
    const banner = await this.bannerRepo.findOneBy({ id });
    if (!banner) throw new NotFoundException('Banner not found');
    Object.assign(banner, data);
    return this.bannerRepo.save(banner);
  }

  async deleteBanner(id: string) {
    const banner = await this.bannerRepo.findOneBy({ id });
    if (!banner) throw new NotFoundException('Banner not found');
    banner.isDeleted = true;
    banner.isActive = false;
    await this.bannerRepo.save(banner);
    return { deleted: true };
  }

  // ── Audit Log ──

  async logAction(data: { action: string; targetType?: string; targetId?: string; targetLabel?: string; performedBy: string; details?: any }) {
    const performer = await this.userRepo.findOne({ where: { id: data.performedBy }, select: ['name', 'email'] });
    const log = this.auditRepo.create({
      action: data.action,
      targetType: data.targetType,
      targetId: data.targetId,
      targetLabel: data.targetLabel,
      performedBy: data.performedBy,
      performerName: performer?.name || performer?.email || 'Unknown',
      details: data.details ? JSON.stringify(data.details) : null,
    });
    return this.auditRepo.save(log);
  }

  private getDateRangeFilter(dateRange?: string): Date | null {
    if (!dateRange || dateRange === 'all') return null;
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    switch (dateRange) {
      case 'today': return start;
      case '7d': start.setDate(start.getDate() - 7); return start;
      case '30d': start.setDate(start.getDate() - 30); return start;
      case '90d': start.setDate(start.getDate() - 90); return start;
      default: return null;
    }
  }

  async getAuditLogs(page = 1, limit = 25, search?: string, action?: string, dateRange?: string) {
    const query = this.auditRepo.createQueryBuilder('log');

    if (search) {
      query.andWhere(
        '(log.action ILIKE :s OR log.targetLabel ILIKE :s OR log.targetType ILIKE :s OR log.performerName ILIKE :s)',
        { s: `%${search}%` },
      );
    }

    if (action) {
      query.andWhere('log.action = :action', { action });
    }

    const dateStart = this.getDateRangeFilter(dateRange);
    if (dateStart) {
      query.andWhere('log.createdAt >= :dateStart', { dateStart });
    }

    query.orderBy('log.createdAt', 'DESC');

    const total = await query.getCount();
    const logs = await query.skip((page - 1) * limit).take(limit).getMany();

    return { logs, total, page, totalPages: Math.ceil(total / limit) };
  }

  async getAuditStats() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);

    const [total, today, thisWeek, actionCounts, uniqueAdmins, dailyBreakdown] = await Promise.all([
      this.auditRepo.count(),
      this.auditRepo.createQueryBuilder('log').where('log.createdAt >= :d', { d: todayStart }).getCount(),
      this.auditRepo.createQueryBuilder('log').where('log.createdAt >= :d', { d: weekStart }).getCount(),
      this.auditRepo.createQueryBuilder('log')
        .select('log.action', 'action')
        .addSelect('COUNT(*)', 'count')
        .groupBy('log.action')
        .orderBy('count', 'DESC')
        .getRawMany(),
      this.auditRepo.createQueryBuilder('log')
        .select('COUNT(DISTINCT log.performedBy)', 'count')
        .getRawOne()
        .then(r => parseInt(r?.count || '0')),
      this.auditRepo.createQueryBuilder('log')
        .select("TO_CHAR(log.createdAt, 'YYYY-MM-DD')", 'date')
        .addSelect('COUNT(*)', 'count')
        .where('log.createdAt >= :d', { d: weekStart })
        .groupBy("TO_CHAR(log.createdAt, 'YYYY-MM-DD')")
        .orderBy('date', 'ASC')
        .getRawMany(),
    ]);

    return { total, today, thisWeek, actionCounts, uniqueAdmins, dailyBreakdown };
  }

  async exportAuditLogsCsv(search?: string, action?: string, dateRange?: string): Promise<string> {
    const query = this.auditRepo.createQueryBuilder('log');

    if (search) {
      query.andWhere(
        '(log.action ILIKE :s OR log.targetLabel ILIKE :s OR log.performerName ILIKE :s)',
        { s: `%${search}%` },
      );
    }
    if (action) query.andWhere('log.action = :action', { action });
    const dateStart = this.getDateRangeFilter(dateRange);
    if (dateStart) query.andWhere('log.createdAt >= :dateStart', { dateStart });

    query.orderBy('log.createdAt', 'DESC').take(5000);
    const logs = await query.getMany();

    const header = 'Date,Action,Performer,Target,Target Type,Details\n';
    const rows = logs.map(l => {
      const d = l.createdAt ? new Date(l.createdAt).toISOString() : '';
      const details = (l.details || '').replace(/"/g, '""');
      return `"${d}","${l.action}","${l.performerName || ''}","${l.targetLabel || ''}","${l.targetType || ''}","${details}"`;
    }).join('\n');

    return header + rows;
  }

  // ── User Impersonation ──

  async impersonateUser(targetUserId: string, adminUserId: string) {
    const target = await this.userRepo.findOne({ where: { id: targetUserId } });
    if (!target) throw new NotFoundException('User not found');
    if (target.role === 'SUPER_ADMIN') {
      const adminRole = await this.getUserRole(adminUserId);
      if (adminRole !== 'SUPER_ADMIN') throw new ForbiddenException('Cannot impersonate a Super Admin');
    }

    const payload = { sub: target.id, email: target.email, role: target.role };
    const token = this.jwtService.sign(payload);

    await this.logAction({
      action: 'user.impersonated',
      targetType: 'user',
      targetId: target.id,
      targetLabel: target.email,
      performedBy: adminUserId,
      details: { impersonatedAs: target.email },
    });

    return {
      access_token: token,
      user: {
        id: target.id,
        email: target.email,
        name: target.name,
        role: target.role,
        avatarMimeType: target.avatarMimeType || null,
      },
    };
  }

  // ── Maintenance Mode ──

  async getMaintenanceMode() {
    const setting = await this.settingRepo.findOne({ where: { key: 'maintenance_mode' } });
    if (!setting) return { enabled: false, message: '' };
    try { return JSON.parse(setting.value); } catch { return { enabled: false, message: '' }; }
  }

  async setMaintenanceMode(enabled: boolean, message: string, adminUserId: string) {
    let setting = await this.settingRepo.findOne({ where: { key: 'maintenance_mode' } });
    if (!setting) {
      setting = this.settingRepo.create({ key: 'maintenance_mode', value: '' });
    }
    setting.value = JSON.stringify({ enabled, message });
    await this.settingRepo.save(setting);

    await this.logAction({
      action: enabled ? 'system.maintenance_enabled' : 'system.maintenance_disabled',
      targetType: 'system',
      targetLabel: 'Maintenance Mode',
      performedBy: adminUserId,
      details: { enabled, message },
    });

    return { enabled, message };
  }

  // ── Growth Data (Charts) ──

  async getGrowthData() {
    // User registrations per month (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const userGrowth = await this.userRepo
      .createQueryBuilder('user')
      .select("TO_CHAR(user.createdAt, 'YYYY-MM')", 'month')
      .addSelect('COUNT(*)', 'count')
      .where('user.createdAt >= :since', { since: sixMonthsAgo })
      .groupBy("TO_CHAR(user.createdAt, 'YYYY-MM')")
      .orderBy("TO_CHAR(user.createdAt, 'YYYY-MM')", 'ASC')
      .getRawMany();

    const revenueGrowth = await this.paymentRepo
      .createQueryBuilder('p')
      .select("TO_CHAR(p.createdAt, 'YYYY-MM')", 'month')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(CAST(REPLACE(p.amount, \'$\', \'\') AS DECIMAL))', 'revenue')
      .where('p.status = :status', { status: 'completed' })
      .andWhere('p.createdAt >= :since', { since: sixMonthsAgo })
      .groupBy("TO_CHAR(p.createdAt, 'YYYY-MM')")
      .orderBy("TO_CHAR(p.createdAt, 'YYYY-MM')", 'ASC')
      .getRawMany();

    // Fill missing months
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    const userMap = Object.fromEntries(userGrowth.map((r: any) => [r.month, parseInt(r.count)]));
    const revMap = Object.fromEntries(revenueGrowth.map((r: any) => [r.month, parseFloat(r.revenue || '0')]));

    return {
      months,
      users: months.map(m => userMap[m] || 0),
      revenue: months.map(m => revMap[m] || 0),
    };
  }

  // ── Reports ──

  async getReportData() {
    const now = new Date();
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
    twelveMonthsAgo.setDate(1);
    twelveMonthsAgo.setHours(0, 0, 0, 0);

    // User growth — last 12 months
    const userGrowth = await this.userRepo
      .createQueryBuilder('user')
      .select("TO_CHAR(user.createdAt, 'YYYY-MM')", 'month')
      .addSelect('COUNT(*)', 'count')
      .where('user.createdAt >= :since', { since: twelveMonthsAgo })
      .groupBy("TO_CHAR(user.createdAt, 'YYYY-MM')")
      .orderBy("TO_CHAR(user.createdAt, 'YYYY-MM')", 'ASC')
      .getRawMany();

    // Revenue per month — last 12 months
    const revenueGrowth = await this.paymentRepo
      .createQueryBuilder('p')
      .select("TO_CHAR(p.createdAt, 'YYYY-MM')", 'month')
      .addSelect('COUNT(*)', 'txCount')
      .addSelect("SUM(CAST(REPLACE(p.amount, '$', '') AS DECIMAL))", 'revenue')
      .where('p.status = :status', { status: 'completed' })
      .andWhere('p.createdAt >= :since', { since: twelveMonthsAgo })
      .groupBy("TO_CHAR(p.createdAt, 'YYYY-MM')")
      .orderBy("TO_CHAR(p.createdAt, 'YYYY-MM')", 'ASC')
      .getRawMany();

    // Fill 12 months
    const months: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const ugMap = Object.fromEntries(userGrowth.map((r: any) => [r.month, parseInt(r.count)]));
    const rgMap = Object.fromEntries(revenueGrowth.map((r: any) => [r.month, { revenue: parseFloat(r.revenue || '0'), txCount: parseInt(r.txCount || '0') }]));

    // Plan distribution
    const planDist = await this.subRepo
      .createQueryBuilder('sub')
      .select('sub.plan', 'plan')
      .addSelect('COUNT(*)', 'count')
      .where('sub.status = :status', { status: 'active' })
      .groupBy('sub.plan')
      .getRawMany();
    const totalSubbed = planDist.reduce((s: number, r: any) => s + parseInt(r.count), 0);
    const totalUsers = await this.userRepo.count();
    const freeCount = totalUsers - totalSubbed;

    // Active vs inactive
    const activeUsers = await this.userRepo.count({ where: { isActive: true } });

    // Collections per month
    const collectionGrowth = await this.collectionRepo
      .createQueryBuilder('c')
      .select("TO_CHAR(c.createdAt, 'YYYY-MM')", 'month')
      .addSelect('COUNT(*)', 'count')
      .where('c.createdAt >= :since', { since: twelveMonthsAgo })
      .groupBy("TO_CHAR(c.createdAt, 'YYYY-MM')")
      .orderBy("TO_CHAR(c.createdAt, 'YYYY-MM')", 'ASC')
      .getRawMany();
    const cgMap = Object.fromEntries(collectionGrowth.map((r: any) => [r.month, parseInt(r.count)]));

    // Org growth
    const orgGrowth = await this.orgRepo
      .createQueryBuilder('o')
      .select("TO_CHAR(o.createdAt, 'YYYY-MM')", 'month')
      .addSelect('COUNT(*)', 'count')
      .where('o.createdAt >= :since', { since: twelveMonthsAgo })
      .groupBy("TO_CHAR(o.createdAt, 'YYYY-MM')")
      .orderBy("TO_CHAR(o.createdAt, 'YYYY-MM')", 'ASC')
      .getRawMany();
    const ogMap = Object.fromEntries(orgGrowth.map((r: any) => [r.month, parseInt(r.count)]));

    // Audit activity per month
    const auditGrowth = await this.auditRepo
      .createQueryBuilder('a')
      .select("TO_CHAR(a.createdAt, 'YYYY-MM')", 'month')
      .addSelect('COUNT(*)', 'count')
      .where('a.createdAt >= :since', { since: twelveMonthsAgo })
      .groupBy("TO_CHAR(a.createdAt, 'YYYY-MM')")
      .orderBy("TO_CHAR(a.createdAt, 'YYYY-MM')", 'ASC')
      .getRawMany();
    const agMap = Object.fromEntries(auditGrowth.map((r: any) => [r.month, parseInt(r.count)]));

    // Signups recent
    const signupsLast7d = await this.userRepo.createQueryBuilder('u').where('u.createdAt >= :since', { since: new Date(now.getTime() - 7 * 86400000) }).getCount();
    const signupsLast30d = await this.userRepo.createQueryBuilder('u').where('u.createdAt >= :since', { since: new Date(now.getTime() - 30 * 86400000) }).getCount();

    // Revenue summary
    const allPayments = await this.paymentRepo.find({ where: { status: 'completed' } });
    const totalRevenue = allPayments.reduce((s, p) => s + (parseFloat(p.amount.replace('$', '')) || 0), 0);
    const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    return {
      months,
      userGrowth: months.map(m => ugMap[m] || 0),
      revenueGrowth: months.map(m => rgMap[m]?.revenue || 0),
      transactionCount: months.map(m => rgMap[m]?.txCount || 0),
      collectionGrowth: months.map(m => cgMap[m] || 0),
      orgGrowth: months.map(m => ogMap[m] || 0),
      auditActivity: months.map(m => agMap[m] || 0),
      planDistribution: [
        { plan: 'FREE', count: freeCount },
        ...planDist.map((r: any) => ({ plan: r.plan, count: parseInt(r.count) })),
      ],
      summary: {
        totalUsers,
        activeUsers,
        inactiveUsers: totalUsers - activeUsers,
        signupsLast7d,
        signupsLast30d,
        totalRevenue,
        mrr: rgMap[thisMonthKey]?.revenue || 0,
        totalCollections: await this.collectionRepo.count(),
        totalOrgs: await this.orgRepo.count(),
        totalPayments: allPayments.length,
      },
    };
  }

  // ── Bulk User Actions ──

  async bulkUpdateUsers(ids: string[], action: string, performedBy: string, value?: string) {
    if (!ids?.length) throw new BadRequestException('No user IDs provided');

    const users = await this.userRepo.findByIds(ids);
    if (!users.length) throw new NotFoundException('No users found');

    // Protect SUPER_ADMINs
    const protectedUsers = users.filter(u => u.role === 'SUPER_ADMIN');
    const targetUsers = users.filter(u => u.role !== 'SUPER_ADMIN');

    let affected = 0;

    switch (action) {
      case 'deactivate':
        for (const u of targetUsers) { u.isActive = false; }
        await this.userRepo.save(targetUsers);
        affected = targetUsers.length;
        break;
      case 'activate':
        for (const u of targetUsers) { u.isActive = true; }
        await this.userRepo.save(targetUsers);
        affected = targetUsers.length;
        break;
      case 'delete':
        for (const u of targetUsers) { u.isActive = false; }
        await this.userRepo.save(targetUsers);
        affected = targetUsers.length;
        break;
      case 'set_role':
        if (!value || (value !== 'USER' && value !== 'ADMIN')) {
          throw new BadRequestException('Invalid role. Only USER or ADMIN allowed.');
        }
        for (const u of targetUsers) { u.role = value; }
        await this.userRepo.save(targetUsers);
        affected = targetUsers.length;
        break;
      default:
        throw new BadRequestException(`Unknown action: ${action}`);
    }

    await this.logAction({
      action: `bulk.${action}`,
      targetType: 'user',
      targetId: ids.join(','),
      targetLabel: `${affected} users`,
      performedBy,
      details: { action, affected, skippedProtected: protectedUsers.length, value },
    }).catch(() => {});

    return { affected, skippedProtected: protectedUsers.length };
  }

  // ── Feature Flags ──

  private readonly DEFAULT_FLAGS: Record<string, { enabled: boolean; label: string; description: string }> = {
    allow_signups: { enabled: true, label: 'User Registration', description: 'Allow new users to sign up' },
    allow_api_execution: { enabled: true, label: 'API Execution', description: 'Allow users to execute API requests via proxy' },
    show_pricing: { enabled: true, label: 'Show Pricing Page', description: 'Display the pricing page to users' },
    allow_subscriptions: { enabled: true, label: 'Subscription Plans', description: 'Allow users to purchase or upgrade subscription plans' },
    require_email_verification: { enabled: false, label: 'Email Verification', description: 'Require email verification for new accounts' },
    allow_collection_upload: { enabled: true, label: 'Collection Upload', description: 'Allow users to import/upload collection JSON files' },
    allow_variable_upload: { enabled: true, label: 'Variable Upload', description: 'Allow users to import/upload environment variable files' },
  };

  async getFeatureFlags() {
    const setting = await this.settingRepo.findOne({ where: { key: 'feature_flags' } });
    const saved: Record<string, boolean> = setting ? JSON.parse(setting.value) : {};

    return Object.entries(this.DEFAULT_FLAGS).map(([key, def]) => ({
      key,
      enabled: saved[key] !== undefined ? saved[key] : def.enabled,
      label: def.label,
      description: def.description,
    }));
  }

  async setFeatureFlag(key: string, enabled: boolean, adminUserId: string) {
    if (!this.DEFAULT_FLAGS[key]) throw new BadRequestException(`Unknown feature flag: ${key}`);

    let setting = await this.settingRepo.findOne({ where: { key: 'feature_flags' } });
    const current: Record<string, boolean> = setting ? JSON.parse(setting.value) : {};
    current[key] = enabled;

    if (setting) {
      setting.value = JSON.stringify(current);
      await this.settingRepo.save(setting);
    } else {
      setting = this.settingRepo.create({ key: 'feature_flags', value: JSON.stringify(current) });
      await this.settingRepo.save(setting);
    }

    await this.logAction({
      action: enabled ? 'feature.enabled' : 'feature.disabled',
      targetType: 'feature',
      targetId: key,
      targetLabel: this.DEFAULT_FLAGS[key].label,
      performedBy: adminUserId,
    }).catch(() => {});

    return this.getFeatureFlags();
  }

  async getPublicFeatureFlags() {
    const flags = await this.getFeatureFlags();
    return Object.fromEntries(flags.map(f => [f.key, f.enabled]));
  }

  // ── Security & Control ──

  async forceLogoutUser(userId: string, adminUserId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new BadRequestException('User not found');

    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await this.userRepo.save(user);

    await this.logAction({
      action: 'user.force_logout',
      targetType: 'user',
      targetId: userId,
      targetLabel: user.email,
      performedBy: adminUserId,
    }).catch(() => {});

    return { message: `Force logged out ${user.email}` };
  }

  async forceLogoutAllUsers(adminUserId: string) {
    await this.userRepo
      .createQueryBuilder()
      .update()
      .set({ tokenVersion: () => '"tokenVersion" + 1' })
      .execute();

    await this.logAction({
      action: 'security.force_logout_all',
      targetType: 'system',
      targetId: 'all_users',
      targetLabel: 'All Users',
      performedBy: adminUserId,
    }).catch(() => {});

    return { message: 'All user sessions invalidated' };
  }

  async getLockedAccounts() {
    const locked = await this.userRepo
      .createQueryBuilder('user')
      .where('user.lockedUntil > :now', { now: new Date() })
      .orWhere('user.failedLoginAttempts >= :max', { max: 5 })
      .orWhere('user.isActive = :inactive', { inactive: false })
      .select(['user.id', 'user.email', 'user.name', 'user.failedLoginAttempts', 'user.lockedUntil', 'user.isActive'])
      .orderBy('user.lockedUntil', 'DESC')
      .getMany();

    return locked;
  }

  async unlockUser(userId: string, adminUserId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new BadRequestException('User not found');

    user.failedLoginAttempts = 0;
    user.lockedUntil = null as any;
    await this.userRepo.save(user);

    await this.logAction({
      action: 'user.unlocked',
      targetType: 'user',
      targetId: userId,
      targetLabel: user.email,
      performedBy: adminUserId,
    }).catch(() => {});

    return { message: `Unlocked ${user.email}` };
  }

  async getPasswordPolicy() {
    const setting = await this.settingRepo.findOne({ where: { key: 'password_policy' } });
    const defaults = {
      minLength: 6,
      requireUppercase: false,
      requireLowercase: false,
      requireNumber: false,
      requireSpecial: false,
    };
    if (setting) {
      return { ...defaults, ...JSON.parse(setting.value) };
    }
    return defaults;
  }

  async setPasswordPolicy(policy: any, adminUserId: string) {
    const cleaned = {
      minLength: Math.max(4, Math.min(32, parseInt(policy.minLength) || 6)),
      requireUppercase: !!policy.requireUppercase,
      requireLowercase: !!policy.requireLowercase,
      requireNumber: !!policy.requireNumber,
      requireSpecial: !!policy.requireSpecial,
    };

    let setting = await this.settingRepo.findOne({ where: { key: 'password_policy' } });
    if (setting) {
      setting.value = JSON.stringify(cleaned);
      await this.settingRepo.save(setting);
    } else {
      setting = this.settingRepo.create({ key: 'password_policy', value: JSON.stringify(cleaned) });
      await this.settingRepo.save(setting);
    }

    await this.logAction({
      action: 'security.password_policy_updated',
      targetType: 'system',
      targetId: 'password_policy',
      targetLabel: 'Password Policy',
      performedBy: adminUserId,
      details: JSON.stringify(cleaned),
    }).catch(() => {});

    return cleaned;
  }

  async getActiveSessions() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // last 24h
    const users = await this.userRepo
      .createQueryBuilder('user')
      .where('user.lastLoginAt > :since', { since })
      .select(['user.id', 'user.email', 'user.name', 'user.lastLoginAt', 'user.lastLoginIp', 'user.role'])
      .orderBy('user.lastLoginAt', 'DESC')
      .getMany();

    return users;
  }

  async getSecuritySettings() {
    const setting = await this.settingRepo.findOne({ where: { key: 'security_settings' } });
    const defaults = { maxLoginAttempts: 5, sessionTimeoutMinutes: 1440, lockoutDurationMinutes: 30, requireEmailVerification: false };
    if (setting) return { ...defaults, ...JSON.parse(setting.value) };
    return defaults;
  }

  async setSecuritySettings(data: any, adminUserId: string) {
    const cleaned = {
      maxLoginAttempts: Math.max(1, Math.min(20, parseInt(data.maxLoginAttempts) || 5)),
      sessionTimeoutMinutes: Math.max(5, Math.min(10080, parseInt(data.sessionTimeoutMinutes) || 1440)),
      lockoutDurationMinutes: Math.max(1, Math.min(1440, parseInt(data.lockoutDurationMinutes) || 30)),
      requireEmailVerification: !!data.requireEmailVerification,
    };
    let setting = await this.settingRepo.findOne({ where: { key: 'security_settings' } });
    if (setting) { setting.value = JSON.stringify(cleaned); await this.settingRepo.save(setting); }
    else { setting = this.settingRepo.create({ key: 'security_settings', value: JSON.stringify(cleaned) }); await this.settingRepo.save(setting); }
    await this.logAction({ action: 'security.settings_updated', targetType: 'system', targetId: 'security_settings', targetLabel: 'Security Settings', performedBy: adminUserId, details: JSON.stringify(cleaned) }).catch(() => {});
    return cleaned;
  }

  async getSecurityOverview() {
    const [totalUsers, activeUsers, inactiveUsers, failedAttemptUsers, recentSecurityEvents] = await Promise.all([
      this.userRepo.count(),
      this.userRepo.count({ where: { isActive: true } }),
      this.userRepo.count({ where: { isActive: false } }),
      this.userRepo.createQueryBuilder('u').where('u.failedLoginAttempts > 0').getCount(),
      this.auditRepo.createQueryBuilder('log')
        .where("log.action LIKE :s", { s: 'security.%' })
        .orWhere("log.action LIKE :u", { u: 'user.force_logout%' })
        .orWhere("log.action = :ul", { ul: 'user.unlocked' })
        .orWhere("log.action = :da", { da: 'user.deactivated' })
        .orderBy('log.createdAt', 'DESC')
        .take(10)
        .getMany(),
    ]);
    return { totalUsers, activeUsers, inactiveUsers, failedAttemptUsers, recentSecurityEvents };
  }
}
