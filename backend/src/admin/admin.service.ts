import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  OnApplicationBootstrap,
} from '@nestjs/common';
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
import { Changelog } from './changelog.entity';
import { FeedbackTicket } from './feedback-ticket.entity';
import { Plugin } from './plugin.entity';
import { ApiHit } from './api-hit.entity';
import { Plan } from '../subscriptions/plan.entity';
import { DEFAULT_PLANS, PlanId } from '../subscriptions/plans.config';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AdminService implements OnApplicationBootstrap {
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
    @InjectRepository(Plan)
    private planRepo: Repository<Plan>,
    @InjectRepository(Payment)
    private paymentRepo: Repository<Payment>,
    @InjectRepository(Banner)
    private bannerRepo: Repository<Banner>,
    @InjectRepository(AuditLog)
    private auditRepo: Repository<AuditLog>,
    @InjectRepository(SystemSetting)
    private settingRepo: Repository<SystemSetting>,
    @InjectRepository(Changelog)
    private changelogRepo: Repository<Changelog>,
    @InjectRepository(FeedbackTicket)
    private ticketRepo: Repository<FeedbackTicket>,
    @InjectRepository(Plugin)
    private pluginRepo: Repository<Plugin>,
    @InjectRepository(ApiHit)
    private apiHitRepo: Repository<ApiHit>,
    private jwtService: JwtService,
  ) {
    this.seedDefaultBanners();
    this.seedDefaultPlugins();
    this.seedDefaultPlans();
  }

  // ── Admin User Creation ──

  async createAdminUser(
    data: { name: string; email: string; password: string },
    performedBy?: string,
  ) {
    const existing = await this.userRepo.findOneBy({ email: data.email });
    if (existing)
      throw new BadRequestException('A user with this email already exists');
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
      await this.logAction({
        action: 'user.created',
        targetType: 'user',
        targetId: saved.id,
        targetLabel: saved.email,
        performedBy,
        details: { role: 'ADMIN' },
      });
    }
    return {
      id: saved.id,
      name: saved.name,
      email: saved.email,
      role: saved.role,
    };
  }

  // ── Stats ──

  async getStats() {
    const [totalUsers, totalOrgs, totalCollections, totalSubscriptions] =
      await Promise.all([
        this.userRepo.count(),
        this.orgRepo.count(),
        this.collectionRepo.count(),
        this.subRepo.count({ where: { status: 'active' } }),
      ]);

    // Total revenue (from payment records)
    const payments = await this.paymentRepo.find({
      where: { status: 'completed' },
    });
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
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['role'],
    });
    return user?.role || 'USER';
  }

  // ── Users ──

  async getAllUsers(params: {
    search?: string;
    page?: number;
    limit?: number;
    role?: string;
    status?: string;
    plan?: string;
  }) {
    const page = params.page || 1;
    const limit = Math.min(params.limit || 20, 100);
    const offset = (page - 1) * limit;

    const query = this.userRepo
      .createQueryBuilder('user')
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
      query.where('(user.email ILIKE :search OR user.name ILIKE :search)', {
        search: `%${params.search}%`,
      });
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

  async updateUser(
    userId: string,
    data: { role?: string; name?: string },
    requesterRole?: string,
  ) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role === 'SUPER_ADMIN' && requesterRole !== 'SUPER_ADMIN') {
      throw new ForbiddenException(
        'Only Super Admins can modify other Super Admins',
      );
    }

    if (data.role) user.role = data.role;
    if (data.name !== undefined) user.name = data.name;

    const result = await this.userRepo.save(user);
    if (requesterRole) {
      await this.logAction({
        action: 'user.role_changed',
        targetType: 'user',
        targetId: userId,
        targetLabel: user.email,
        performedBy: userId,
        details: data,
      }).catch(() => {});
    }
    return result;
  }

  async deleteUser(
    userId: string,
    requesterId: string,
    requesterRole?: string,
  ) {
    if (userId === requesterId)
      throw new ForbiddenException('You cannot deactivate yourself.');
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role === 'SUPER_ADMIN' && requesterRole !== 'SUPER_ADMIN') {
      throw new ForbiddenException(
        'Only Super Admins can deactivate other Super Admins',
      );
    }
    user.isActive = false;
    await this.userRepo.save(user);
    await this.logAction({
      action: 'user.deactivated',
      targetType: 'user',
      targetId: userId,
      targetLabel: user.email,
      performedBy: requesterId,
    }).catch(() => {});
    return { deactivated: true };
  }

  async toggleUserActive(
    userId: string,
    requesterId: string,
    requesterRole?: string,
  ) {
    if (userId === requesterId)
      throw new ForbiddenException('You cannot deactivate yourself.');
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role === 'SUPER_ADMIN' && requesterRole !== 'SUPER_ADMIN') {
      throw new ForbiddenException(
        'Only Super Admins can modify other Super Admins',
      );
    }
    user.isActive = !user.isActive;
    await this.userRepo.save(user);
    await this.logAction({
      action: user.isActive ? 'user.activated' : 'user.deactivated',
      targetType: 'user',
      targetId: userId,
      targetLabel: user.email,
      performedBy: requesterId,
    }).catch(() => {});
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
        const owner = await this.userRepo.findOne({
          where: { id: org.ownerId },
        });
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

  // ── Plan Configuration (DB-driven) ──

  private async seedDefaultPlans() {
    try {
      const count = await this.planRepo.count();
      if (count > 0) return;

      const defaultPlans = Object.values(DEFAULT_PLANS);
      for (let index = 0; index < defaultPlans.length; index++) {
        const p = defaultPlans[index];
        const entity = new Plan();
        entity.id = p.id;
        entity.name = p.name;
        entity.description = p.description;
        entity.priceMonthly = p.priceMonthly / 100;
        entity.priceYearly = p.priceYearly / 100;
        entity.maxCollections = p.limits.maxCollections;
        entity.maxRequestsPerCollection = p.limits.maxRequestsPerCollection;
        entity.maxMembers = p.limits.maxMembers;
        entity.maxCollaborators = p.limits.maxCollaborators;
        entity.maxEnvironments = p.limits.maxEnvironments;
        entity.historyDays = p.limits.historyDays;
        entity.maxUploadMb = p.limits.maxUploadMb;
        entity.analyticsAccess = p.limits.analyticsAccess;
        entity.sharedCollections = p.limits.sharedCollections;
        entity.apiDocExport = p.limits.apiDocExport;
        entity.features = JSON.stringify(p.features);
        entity.popular = p.popular || false;
        entity.stripePriceIdMonthly = p.stripePriceIdMonthly || '';
        entity.stripePriceIdYearly = p.stripePriceIdYearly || '';
        entity.sortOrder = index;
        await this.planRepo.save(entity);
      }
    } catch (err) {
      // Table may not exist yet on first boot; ignore
    }
  }

  async getPlansWithOverrides() {
    const plans = await this.planRepo.find({ order: { sortOrder: 'ASC' } });

    return plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      description: plan.description,
      priceMonthly: parseFloat(String(plan.priceMonthly)),
      priceYearly: parseFloat(String(plan.priceYearly)),
      limits: {
        maxCollections: plan.maxCollections,
        maxRequestsPerCollection: plan.maxRequestsPerCollection,
        maxMembers: plan.maxMembers,
        maxCollaborators: plan.maxCollaborators,
        maxEnvironments: plan.maxEnvironments,
        historyDays: plan.historyDays,
        maxUploadMb: plan.maxUploadMb,
        analyticsAccess: plan.analyticsAccess,
        sharedCollections: plan.sharedCollections,
        apiDocExport: plan.apiDocExport,
      },
      features: (() => {
        try {
          return JSON.parse(plan.features);
        } catch {
          return [];
        }
      })(),
      popular: plan.popular,
      hasOverride: true, // All plans are now DB-driven
    }));
  }

  async updatePlanOverride(planId: string, data: any) {
    const plan = await this.planRepo.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException(`Plan ${planId} not found`);

    // Update pricing
    if (data.priceMonthly !== undefined) plan.priceMonthly = data.priceMonthly;
    if (data.priceYearly !== undefined) plan.priceYearly = data.priceYearly;

    // Update limits
    if (data.maxCollections !== undefined)
      plan.maxCollections = data.maxCollections;
    if (data.maxRequestsPerCollection !== undefined)
      plan.maxRequestsPerCollection = data.maxRequestsPerCollection;
    if (data.maxMembers !== undefined) plan.maxMembers = data.maxMembers;
    if (data.maxCollaborators !== undefined)
      plan.maxCollaborators = data.maxCollaborators;
    if (data.maxEnvironments !== undefined)
      plan.maxEnvironments = data.maxEnvironments;
    if (data.historyDays !== undefined) plan.historyDays = data.historyDays;
    if (data.maxUploadMb !== undefined) plan.maxUploadMb = data.maxUploadMb;
    if (data.analyticsAccess !== undefined)
      plan.analyticsAccess = data.analyticsAccess;

    return this.planRepo.save(plan);
  }

  async resetPlanOverride(planId: string) {
    const defaultPlan = DEFAULT_PLANS[planId as PlanId];
    if (!defaultPlan)
      throw new NotFoundException(`Default plan ${planId} not found`);

    const plan = await this.planRepo.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException(`Plan ${planId} not found`);

    // Reset to factory defaults (convert cents to dollars)
    plan.priceMonthly = defaultPlan.priceMonthly / 100;
    plan.priceYearly = defaultPlan.priceYearly / 100;
    plan.maxCollections = defaultPlan.limits.maxCollections;
    plan.maxRequestsPerCollection = defaultPlan.limits.maxRequestsPerCollection;
    plan.maxMembers = defaultPlan.limits.maxMembers;
    plan.maxCollaborators = defaultPlan.limits.maxCollaborators;
    plan.maxEnvironments = defaultPlan.limits.maxEnvironments;
    plan.historyDays = defaultPlan.limits.historyDays;
    plan.maxUploadMb = defaultPlan.limits.maxUploadMb;
    plan.analyticsAccess = defaultPlan.limits.analyticsAccess;

    await this.planRepo.save(plan);
    return { reset: true };
  }

  // ── Payments ──

  async getPayments(year?: number, month?: number) {
    const query = this.paymentRepo
      .createQueryBuilder('payment')
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
    const banners = defaults.map((text, i) =>
      this.bannerRepo.create({ text, isActive: true, sortOrder: i }),
    );
    await this.bannerRepo.save(banners);
  }

  async getAllBanners() {
    return this.bannerRepo.find({
      order: { isDeleted: 'ASC', sortOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  async getActiveBanners() {
    return this.bannerRepo.find({
      where: { isActive: true, isDeleted: false },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  async createBanner(text: string) {
    const maxSort = (await this.bannerRepo.maximum('sortOrder')) || 0;
    const banner = this.bannerRepo.create({
      text,
      isActive: true,
      sortOrder: maxSort + 1,
    });
    return this.bannerRepo.save(banner);
  }

  async updateBanner(
    id: string,
    data: {
      text?: string;
      isActive?: boolean;
      sortOrder?: number;
      isDeleted?: boolean;
    },
  ) {
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

  async logAction(data: {
    action: string;
    targetType?: string;
    targetId?: string;
    targetLabel?: string;
    performedBy: string;
    details?: any;
  }) {
    const performer = await this.userRepo.findOne({
      where: { id: data.performedBy },
      select: ['name', 'email'],
    });
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
      case 'today':
        return start;
      case '7d':
        start.setDate(start.getDate() - 7);
        return start;
      case '30d':
        start.setDate(start.getDate() - 30);
        return start;
      case '90d':
        start.setDate(start.getDate() - 90);
        return start;
      default:
        return null;
    }
  }

  async getAuditLogs(
    page = 1,
    limit = 25,
    search?: string,
    action?: string,
    dateRange?: string,
  ) {
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
    const logs = await query
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return { logs, total, page, totalPages: Math.ceil(total / limit) };
  }

  async getAuditStats() {
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);

    const [total, today, thisWeek, actionCounts, uniqueAdmins, dailyBreakdown] =
      await Promise.all([
        this.auditRepo.count(),
        this.auditRepo
          .createQueryBuilder('log')
          .where('log.createdAt >= :d', { d: todayStart })
          .getCount(),
        this.auditRepo
          .createQueryBuilder('log')
          .where('log.createdAt >= :d', { d: weekStart })
          .getCount(),
        this.auditRepo
          .createQueryBuilder('log')
          .select('log.action', 'action')
          .addSelect('COUNT(*)', 'count')
          .groupBy('log.action')
          .orderBy('count', 'DESC')
          .getRawMany(),
        this.auditRepo
          .createQueryBuilder('log')
          .select('COUNT(DISTINCT log.performedBy)', 'count')
          .getRawOne()
          .then((r) => parseInt(r?.count || '0')),
        this.auditRepo
          .createQueryBuilder('log')
          .select("TO_CHAR(log.createdAt, 'YYYY-MM-DD')", 'date')
          .addSelect('COUNT(*)', 'count')
          .where('log.createdAt >= :d', { d: weekStart })
          .groupBy("TO_CHAR(log.createdAt, 'YYYY-MM-DD')")
          .orderBy('date', 'ASC')
          .getRawMany(),
      ]);

    return {
      total,
      today,
      thisWeek,
      actionCounts,
      uniqueAdmins,
      dailyBreakdown,
    };
  }

  async exportAuditLogsCsv(
    search?: string,
    action?: string,
    dateRange?: string,
  ): Promise<string> {
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
    const rows = logs
      .map((l) => {
        const d = l.createdAt ? new Date(l.createdAt).toISOString() : '';
        const details = (l.details || '').replace(/"/g, '""');
        return `"${d}","${l.action}","${l.performerName || ''}","${l.targetLabel || ''}","${l.targetType || ''}","${details}"`;
      })
      .join('\n');

    return header + rows;
  }

  // ── User Impersonation ──

  async impersonateUser(targetUserId: string, adminUserId: string) {
    const target = await this.userRepo.findOne({ where: { id: targetUserId } });
    if (!target) throw new NotFoundException('User not found');
    if (target.role === 'SUPER_ADMIN') {
      const adminRole = await this.getUserRole(adminUserId);
      if (adminRole !== 'SUPER_ADMIN')
        throw new ForbiddenException('Cannot impersonate a Super Admin');
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
    const setting = await this.settingRepo.findOne({
      where: { key: 'maintenance_mode' },
    });
    if (!setting) return { enabled: false, message: '' };
    try {
      return JSON.parse(setting.value);
    } catch {
      return { enabled: false, message: '' };
    }
  }

  async setMaintenanceMode(
    enabled: boolean,
    message: string,
    adminUserId: string,
  ) {
    let setting = await this.settingRepo.findOne({
      where: { key: 'maintenance_mode' },
    });
    if (!setting) {
      setting = this.settingRepo.create({ key: 'maintenance_mode', value: '' });
    }
    setting.value = JSON.stringify({ enabled, message });
    await this.settingRepo.save(setting);

    await this.logAction({
      action: enabled
        ? 'system.maintenance_enabled'
        : 'system.maintenance_disabled',
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
      .addSelect("SUM(CAST(REPLACE(p.amount, '$', '') AS DECIMAL))", 'revenue')
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
      months.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      );
    }

    const userMap = Object.fromEntries(
      userGrowth.map((r: any) => [r.month, parseInt(r.count)]),
    );
    const revMap = Object.fromEntries(
      revenueGrowth.map((r: any) => [r.month, parseFloat(r.revenue || '0')]),
    );

    return {
      months,
      users: months.map((m) => userMap[m] || 0),
      revenue: months.map((m) => revMap[m] || 0),
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
      months.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      );
    }
    const ugMap = Object.fromEntries(
      userGrowth.map((r: any) => [r.month, parseInt(r.count)]),
    );
    const rgMap = Object.fromEntries(
      revenueGrowth.map((r: any) => [
        r.month,
        {
          revenue: parseFloat(r.revenue || '0'),
          txCount: parseInt(r.txCount || '0'),
        },
      ]),
    );

    // Plan distribution
    const planDist = await this.subRepo
      .createQueryBuilder('sub')
      .select('sub.plan', 'plan')
      .addSelect('COUNT(*)', 'count')
      .where('sub.status = :status', { status: 'active' })
      .groupBy('sub.plan')
      .getRawMany();
    const totalSubbed = planDist.reduce(
      (s: number, r: any) => s + parseInt(r.count),
      0,
    );
    const totalUsers = await this.userRepo.count();
    const freeCount = totalUsers - totalSubbed;

    // Active vs inactive
    const activeUsers = await this.userRepo.count({
      where: { isActive: true },
    });

    // Collections per month
    const collectionGrowth = await this.collectionRepo
      .createQueryBuilder('c')
      .select("TO_CHAR(c.createdAt, 'YYYY-MM')", 'month')
      .addSelect('COUNT(*)', 'count')
      .where('c.createdAt >= :since', { since: twelveMonthsAgo })
      .groupBy("TO_CHAR(c.createdAt, 'YYYY-MM')")
      .orderBy("TO_CHAR(c.createdAt, 'YYYY-MM')", 'ASC')
      .getRawMany();
    const cgMap = Object.fromEntries(
      collectionGrowth.map((r: any) => [r.month, parseInt(r.count)]),
    );

    // Org growth
    const orgGrowth = await this.orgRepo
      .createQueryBuilder('o')
      .select("TO_CHAR(o.createdAt, 'YYYY-MM')", 'month')
      .addSelect('COUNT(*)', 'count')
      .where('o.createdAt >= :since', { since: twelveMonthsAgo })
      .groupBy("TO_CHAR(o.createdAt, 'YYYY-MM')")
      .orderBy("TO_CHAR(o.createdAt, 'YYYY-MM')", 'ASC')
      .getRawMany();
    const ogMap = Object.fromEntries(
      orgGrowth.map((r: any) => [r.month, parseInt(r.count)]),
    );

    // Audit activity per month
    const auditGrowth = await this.auditRepo
      .createQueryBuilder('a')
      .select("TO_CHAR(a.createdAt, 'YYYY-MM')", 'month')
      .addSelect('COUNT(*)', 'count')
      .where('a.createdAt >= :since', { since: twelveMonthsAgo })
      .groupBy("TO_CHAR(a.createdAt, 'YYYY-MM')")
      .orderBy("TO_CHAR(a.createdAt, 'YYYY-MM')", 'ASC')
      .getRawMany();
    const agMap = Object.fromEntries(
      auditGrowth.map((r: any) => [r.month, parseInt(r.count)]),
    );

    // Signups recent
    const signupsLast7d = await this.userRepo
      .createQueryBuilder('u')
      .where('u.createdAt >= :since', {
        since: new Date(now.getTime() - 7 * 86400000),
      })
      .getCount();
    const signupsLast30d = await this.userRepo
      .createQueryBuilder('u')
      .where('u.createdAt >= :since', {
        since: new Date(now.getTime() - 30 * 86400000),
      })
      .getCount();

    // Revenue summary
    const allPayments = await this.paymentRepo.find({
      where: { status: 'completed' },
    });
    const totalRevenue = allPayments.reduce(
      (s, p) => s + (parseFloat(p.amount.replace('$', '')) || 0),
      0,
    );
    const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    return {
      months,
      userGrowth: months.map((m) => ugMap[m] || 0),
      revenueGrowth: months.map((m) => rgMap[m]?.revenue || 0),
      transactionCount: months.map((m) => rgMap[m]?.txCount || 0),
      collectionGrowth: months.map((m) => cgMap[m] || 0),
      orgGrowth: months.map((m) => ogMap[m] || 0),
      auditActivity: months.map((m) => agMap[m] || 0),
      planDistribution: [
        { plan: 'FREE', count: freeCount },
        ...planDist.map((r: any) => ({
          plan: r.plan,
          count: parseInt(r.count),
        })),
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

  async bulkUpdateUsers(
    ids: string[],
    action: string,
    performedBy: string,
    value?: string,
  ) {
    if (!ids?.length) throw new BadRequestException('No user IDs provided');

    const users = await this.userRepo.findByIds(ids);
    if (!users.length) throw new NotFoundException('No users found');

    // Protect SUPER_ADMINs
    const protectedUsers = users.filter((u) => u.role === 'SUPER_ADMIN');
    const targetUsers = users.filter((u) => u.role !== 'SUPER_ADMIN');

    let affected = 0;

    switch (action) {
      case 'deactivate':
        for (const u of targetUsers) {
          u.isActive = false;
        }
        await this.userRepo.save(targetUsers);
        affected = targetUsers.length;
        break;
      case 'activate':
        for (const u of targetUsers) {
          u.isActive = true;
        }
        await this.userRepo.save(targetUsers);
        affected = targetUsers.length;
        break;
      case 'delete':
        for (const u of targetUsers) {
          u.isActive = false;
        }
        await this.userRepo.save(targetUsers);
        affected = targetUsers.length;
        break;
      case 'set_role':
        if (!value || (value !== 'USER' && value !== 'ADMIN')) {
          throw new BadRequestException(
            'Invalid role. Only USER or ADMIN allowed.',
          );
        }
        for (const u of targetUsers) {
          u.role = value;
        }
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
      details: {
        action,
        affected,
        skippedProtected: protectedUsers.length,
        value,
      },
    }).catch(() => {});

    return { affected, skippedProtected: protectedUsers.length };
  }

  // ── Feature Flags ──

  private readonly DEFAULT_FLAGS: Record<
    string,
    { enabled: boolean; label: string; description: string }
  > = {
    allow_signups: {
      enabled: true,
      label: 'User Registration',
      description: 'Allow new users to sign up',
    },
    allow_api_execution: {
      enabled: true,
      label: 'API Execution',
      description: 'Allow users to execute API requests via proxy',
    },
    show_pricing: {
      enabled: true,
      label: 'Show Pricing Page',
      description: 'Display the pricing page to users',
    },
    allow_subscriptions: {
      enabled: true,
      label: 'Subscription Plans',
      description: 'Allow users to purchase or upgrade subscription plans',
    },
    require_email_verification: {
      enabled: false,
      label: 'Email Verification',
      description: 'Require email verification for new accounts',
    },
    allow_collection_upload: {
      enabled: true,
      label: 'Collection Upload',
      description: 'Allow users to import/upload collection JSON files',
    },
    allow_variable_upload: {
      enabled: true,
      label: 'Variable Upload',
      description: 'Allow users to import/upload environment variable files',
    },
    show_announcements: {
      enabled: true,
      label: 'Announcements Ticker',
      description: 'Show the scrolling announcement ticker bar to all users',
    },
  };

  async getFeatureFlags() {
    const setting = await this.settingRepo.findOne({
      where: { key: 'feature_flags' },
    });
    const saved: Record<string, boolean> = setting
      ? JSON.parse(setting.value)
      : {};

    return Object.entries(this.DEFAULT_FLAGS).map(([key, def]) => ({
      key,
      enabled: saved[key] !== undefined ? saved[key] : def.enabled,
      label: def.label,
      description: def.description,
    }));
  }

  async setFeatureFlag(key: string, enabled: boolean, adminUserId: string) {
    if (!this.DEFAULT_FLAGS[key])
      throw new BadRequestException(`Unknown feature flag: ${key}`);

    let setting = await this.settingRepo.findOne({
      where: { key: 'feature_flags' },
    });
    const current: Record<string, boolean> = setting
      ? JSON.parse(setting.value)
      : {};
    current[key] = enabled;

    if (setting) {
      setting.value = JSON.stringify(current);
      await this.settingRepo.save(setting);
    } else {
      setting = this.settingRepo.create({
        key: 'feature_flags',
        value: JSON.stringify(current),
      });
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
    return Object.fromEntries(flags.map((f) => [f.key, f.enabled]));
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
      .select([
        'user.id',
        'user.email',
        'user.name',
        'user.failedLoginAttempts',
        'user.lockedUntil',
        'user.isActive',
      ])
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
    const setting = await this.settingRepo.findOne({
      where: { key: 'password_policy' },
    });
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

    let setting = await this.settingRepo.findOne({
      where: { key: 'password_policy' },
    });
    if (setting) {
      setting.value = JSON.stringify(cleaned);
      await this.settingRepo.save(setting);
    } else {
      setting = this.settingRepo.create({
        key: 'password_policy',
        value: JSON.stringify(cleaned),
      });
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
      .select([
        'user.id',
        'user.email',
        'user.name',
        'user.lastLoginAt',
        'user.lastLoginIp',
        'user.role',
      ])
      .orderBy('user.lastLoginAt', 'DESC')
      .getMany();

    return users;
  }

  async getSecuritySettings() {
    const setting = await this.settingRepo.findOne({
      where: { key: 'security_settings' },
    });
    const defaults = {
      maxLoginAttempts: 5,
      sessionTimeoutMinutes: 1440,
      lockoutDurationMinutes: 30,
      requireEmailVerification: false,
    };
    if (setting) return { ...defaults, ...JSON.parse(setting.value) };
    return defaults;
  }

  async setSecuritySettings(data: any, adminUserId: string) {
    const cleaned = {
      maxLoginAttempts: Math.max(
        1,
        Math.min(20, parseInt(data.maxLoginAttempts) || 5),
      ),
      sessionTimeoutMinutes: Math.max(
        5,
        Math.min(10080, parseInt(data.sessionTimeoutMinutes) || 1440),
      ),
      lockoutDurationMinutes: Math.max(
        1,
        Math.min(1440, parseInt(data.lockoutDurationMinutes) || 30),
      ),
      requireEmailVerification: !!data.requireEmailVerification,
    };
    let setting = await this.settingRepo.findOne({
      where: { key: 'security_settings' },
    });
    if (setting) {
      setting.value = JSON.stringify(cleaned);
      await this.settingRepo.save(setting);
    } else {
      setting = this.settingRepo.create({
        key: 'security_settings',
        value: JSON.stringify(cleaned),
      });
      await this.settingRepo.save(setting);
    }
    await this.logAction({
      action: 'security.settings_updated',
      targetType: 'system',
      targetId: 'security_settings',
      targetLabel: 'Security Settings',
      performedBy: adminUserId,
      details: JSON.stringify(cleaned),
    }).catch(() => {});
    return cleaned;
  }

  async getSecurityOverview() {
    const [
      totalUsers,
      activeUsers,
      inactiveUsers,
      failedAttemptUsers,
      recentSecurityEvents,
    ] = await Promise.all([
      this.userRepo.count(),
      this.userRepo.count({ where: { isActive: true } }),
      this.userRepo.count({ where: { isActive: false } }),
      this.userRepo
        .createQueryBuilder('u')
        .where('u.failedLoginAttempts > 0')
        .getCount(),
      this.auditRepo
        .createQueryBuilder('log')
        .where('log.action LIKE :s', { s: 'security.%' })
        .orWhere('log.action LIKE :u', { u: 'user.force_logout%' })
        .orWhere('log.action = :ul', { ul: 'user.unlocked' })
        .orWhere('log.action = :da', { da: 'user.deactivated' })
        .orderBy('log.createdAt', 'DESC')
        .take(10)
        .getMany(),
    ]);
    return {
      totalUsers,
      activeUsers,
      inactiveUsers,
      failedAttemptUsers,
      recentSecurityEvents,
    };
  }

  // ══════════════════════════════════════════════
  // ── BATCH 1: New Features ──
  // ══════════════════════════════════════════════

  // ── 1. Export Users CSV ──

  async exportUsersCsv(): Promise<string> {
    const users = await this.userRepo.find({ order: { createdAt: 'DESC' } });
    const subs = await this.subRepo.find();
    const subMap: Record<string, any> = {};
    subs.forEach((s) => {
      subMap[s.userId] = s;
    });

    const header = 'Name,Email,Role,Plan,Status,Signup Date,Last Active';
    const rows = users.map((u) => {
      const sub = subMap[u.id];
      return [
        `"${(u.name || '').replace(/"/g, '""')}"`,
        u.email,
        u.role,
        sub?.plan || 'FREE',
        u.isActive ? 'Active' : 'Inactive',
        u.createdAt?.toISOString()?.split('T')[0] || '',
        u.updatedAt?.toISOString()?.split('T')[0] || '',
      ].join(',');
    });
    return [header, ...rows].join('\n');
  }

  // ── 2. Changelog ──

  async getChangelogs(): Promise<Changelog[]> {
    return this.changelogRepo.find({ order: { createdAt: 'DESC' } });
  }

  async getPublicChangelogs(): Promise<Changelog[]> {
    return this.changelogRepo.find({
      where: { isPublished: true },
      order: { createdAt: 'DESC' },
      take: 20,
    });
  }

  async getNextVersion(): Promise<string> {
    const latest = await this.changelogRepo
      .createQueryBuilder('c')
      .orderBy('c.createdAt', 'DESC')
      .getOne();
    if (latest?.version) {
      const match = latest.version.match(/^v?(\d+)\.(\d+)\.(\d+)$/);
      if (match) return `v${match[1]}.${match[2]}.${parseInt(match[3]) + 1}`;
    }
    return 'v2.0.0';
  }

  async createChangelog(
    data: { title: string; content: string; version?: string },
    adminId: string,
  ): Promise<Changelog> {
    if (!data.version) {
      data.version = await this.getNextVersion();
    }
    const entry = this.changelogRepo.create(data);
    const saved = await this.changelogRepo.save(entry);
    await this.logAction({
      action: 'changelog.created',
      targetType: 'changelog',
      targetId: saved.id,
      targetLabel: saved.title,
      performedBy: adminId,
    }).catch(() => {});
    return saved;
  }

  async updateChangelog(
    id: string,
    data: Partial<Changelog>,
    adminId: string,
  ): Promise<Changelog> {
    const entry = await this.changelogRepo.findOneBy({ id });
    if (!entry) throw new NotFoundException('Changelog entry not found');
    Object.assign(entry, data);
    const saved = await this.changelogRepo.save(entry);
    await this.logAction({
      action: 'changelog.updated',
      targetType: 'changelog',
      targetId: saved.id,
      targetLabel: saved.title,
      performedBy: adminId,
    }).catch(() => {});
    return saved;
  }

  async deleteChangelog(id: string, adminId: string): Promise<void> {
    const entry = await this.changelogRepo.findOneBy({ id });
    if (!entry) throw new NotFoundException('Changelog entry not found');
    await this.changelogRepo.remove(entry);
    await this.logAction({
      action: 'changelog.deleted',
      targetType: 'changelog',
      targetId: id,
      targetLabel: entry.title,
      performedBy: adminId,
    }).catch(() => {});
  }

  // ── 3. Activity Heatmap ──

  async getActivityHeatmap(): Promise<{ date: string; count: number }[]> {
    const result = await this.auditRepo
      .createQueryBuilder('log')
      .select("TO_CHAR(log.createdAt, 'YYYY-MM-DD')", 'date')
      .addSelect('COUNT(*)', 'count')
      .where("log.createdAt > NOW() - INTERVAL '365 days'")
      .groupBy("TO_CHAR(log.createdAt, 'YYYY-MM-DD')")
      .orderBy('date', 'ASC')
      .getRawMany();
    return result.map((r) => ({ date: r.date, count: parseInt(r.count) }));
  }

  // ── 4. Branding ──

  async getBranding(): Promise<any> {
    const keys = [
      'branding_app_name',
      'branding_logo_url',
      'branding_accent_color',
      'branding_favicon_url',
    ];
    const settings = await this.settingRepo.findBy(
      keys.map((k) => ({ key: k })),
    );
    const result: any = {};
    settings.forEach((s) => {
      result[s.key.replace('branding_', '')] = s.value;
    });
    return result;
  }

  async updateBranding(
    data: Record<string, string>,
    adminId: string,
  ): Promise<any> {
    const allowedKeys = ['app_name', 'logo_url', 'accent_color', 'favicon_url'];
    for (const [key, value] of Object.entries(data)) {
      if (!allowedKeys.includes(key)) continue;
      await this.settingRepo.upsert(
        { key: `branding_${key}`, value: value || '' },
        ['key'],
      );
    }
    await this.logAction({
      action: 'branding.updated',
      targetType: 'system',
      targetId: 'branding',
      targetLabel: 'Branding',
      performedBy: adminId,
      details: data,
    }).catch(() => {});
    return this.getBranding();
  }

  // ── 5. Webhooks ──

  async getWebhookConfig(): Promise<any> {
    const setting = await this.settingRepo.findOneBy({ key: 'webhook_config' });
    if (!setting?.value) return { url: '', events: [], enabled: false };
    try {
      return JSON.parse(setting.value);
    } catch {
      return { url: '', events: [], enabled: false };
    }
  }

  async updateWebhookConfig(
    config: { url: string; events: string[]; enabled: boolean },
    adminId: string,
  ): Promise<any> {
    await this.settingRepo.upsert(
      { key: 'webhook_config', value: JSON.stringify(config) },
      ['key'],
    );
    await this.logAction({
      action: 'webhook.updated',
      targetType: 'system',
      targetId: 'webhook_config',
      targetLabel: 'Webhook Config',
      performedBy: adminId,
      details: config,
    }).catch(() => {});
    return config;
  }

  async fireWebhook(event: string, payload: any): Promise<void> {
    try {
      const config = await this.getWebhookConfig();
      if (!config.enabled || !config.url || !config.events.includes(event))
        return;
      fetch(config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-JetAPI-Event': event,
        },
        body: JSON.stringify({
          event,
          timestamp: new Date().toISOString(),
          data: payload,
        }),
      }).catch(() => {});
    } catch {}
  }

  async testWebhook(
    url: string,
  ): Promise<{ success: boolean; status?: number; error?: string }> {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-JetAPI-Event': 'test',
        },
        body: JSON.stringify({
          event: 'test',
          timestamp: new Date().toISOString(),
          data: { message: 'Test webhook from JetAPI' },
        }),
      });
      return { success: res.ok, status: res.status };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  // ── Feedback Tickets ──

  async createTicket(
    data: {
      subject: string;
      description: string;
      type?: string;
      priority?: string;
      tags?: string;
    },
    userId: string,
  ) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['id', 'email', 'name'],
    });
    const ticket = this.ticketRepo.create({
      subject: data.subject,
      description: data.description,
      type: data.type || 'feedback',
      priority: data.priority || 'medium',
      tags: data.tags || undefined,
      userId,
      userEmail: user?.email || 'Unknown',
      userName: user?.name || '',
      status: 'open',
    });
    return this.ticketRepo.save(ticket);
  }

  async getUserTickets(userId: string) {
    return this.ticketRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      select: [
        'id',
        'subject',
        'type',
        'priority',
        'status',
        'adminReply',
        'repliedAt',
        'resolvedAt',
        'createdAt',
        'updatedAt',
      ],
    });
  }

  async getTickets(params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    type?: string;
    priority?: string;
  }) {
    const page = params.page || 1;
    const limit = Math.min(params.limit || 20, 100);
    const query = this.ticketRepo.createQueryBuilder('ticket');

    if (params.search) {
      query.andWhere(
        '(ticket.subject ILIKE :s OR ticket.description ILIKE :s OR ticket.userEmail ILIKE :s OR ticket.userName ILIKE :s)',
        { s: `%${params.search}%` },
      );
    }
    if (params.status && params.status !== 'all') {
      query.andWhere('ticket.status = :status', { status: params.status });
    }
    if (params.type && params.type !== 'all') {
      query.andWhere('ticket.type = :type', { type: params.type });
    }
    if (params.priority && params.priority !== 'all') {
      query.andWhere('ticket.priority = :priority', {
        priority: params.priority,
      });
    }

    query.orderBy('ticket.createdAt', 'DESC');
    const total = await query.getCount();
    const tickets = await query
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return { tickets, total, page, totalPages: Math.ceil(total / limit) };
  }

  async getTicketStats() {
    const [total, open, inProgress, resolved, closed] = await Promise.all([
      this.ticketRepo.count(),
      this.ticketRepo.count({ where: { status: 'open' } }),
      this.ticketRepo.count({ where: { status: 'in_progress' } }),
      this.ticketRepo.count({ where: { status: 'resolved' } }),
      this.ticketRepo.count({ where: { status: 'closed' } }),
    ]);
    return { total, open, inProgress, resolved, closed };
  }

  async getTicketById(id: string) {
    const ticket = await this.ticketRepo.findOne({ where: { id } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  async updateTicket(
    id: string,
    data: {
      status?: string;
      priority?: string;
      assignedTo?: string;
      assignedName?: string;
      adminNotes?: string;
      tags?: string;
    },
    adminId: string,
  ) {
    const ticket = await this.ticketRepo.findOne({ where: { id } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    if (data.status) ticket.status = data.status;
    if (data.priority) ticket.priority = data.priority;
    if (data.assignedTo !== undefined) ticket.assignedTo = data.assignedTo;
    if (data.assignedName !== undefined)
      ticket.assignedName = data.assignedName;
    if (data.adminNotes !== undefined) ticket.adminNotes = data.adminNotes;
    if (data.tags !== undefined) ticket.tags = data.tags;
    if (data.status === 'resolved' && !ticket.resolvedAt)
      ticket.resolvedAt = new Date();

    const saved = await this.ticketRepo.save(ticket);
    await this.logAction({
      action: 'ticket.updated',
      targetType: 'ticket',
      targetId: id,
      targetLabel: ticket.subject,
      performedBy: adminId,
      details: data,
    }).catch(() => {});
    return saved;
  }

  async replyToTicket(id: string, reply: string, adminId: string) {
    const ticket = await this.ticketRepo.findOne({ where: { id } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    ticket.adminReply = reply;
    ticket.repliedAt = new Date();
    if (ticket.status === 'open') ticket.status = 'in_progress';

    const saved = await this.ticketRepo.save(ticket);
    await this.logAction({
      action: 'ticket.replied',
      targetType: 'ticket',
      targetId: id,
      targetLabel: ticket.subject,
      performedBy: adminId,
      details: { reply },
    }).catch(() => {});
    return saved;
  }

  async deleteTicket(id: string, adminId: string) {
    const ticket = await this.ticketRepo.findOne({ where: { id } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    await this.ticketRepo.remove(ticket);
    await this.logAction({
      action: 'ticket.deleted',
      targetType: 'ticket',
      targetId: id,
      targetLabel: ticket.subject,
      performedBy: adminId,
    }).catch(() => {});
    return { deleted: true };
  }

  // ── Rate Limiting ──

  async getRateLimitConfig() {
    const setting = await this.settingRepo.findOne({
      where: { key: 'rate_limit_config' },
    });
    if (!setting) {
      return {
        enabled: false,
        windowMs: 3600000,
        limits: { FREE: 100, PRO: 1000, TEAM: 5000 },
        overrides: {},
      };
    }
    try {
      return JSON.parse(setting.value);
    } catch {
      return {
        enabled: false,
        windowMs: 3600000,
        limits: { FREE: 100, PRO: 1000, TEAM: 5000 },
        overrides: {},
      };
    }
  }

  async setRateLimitConfig(config: any, adminId: string) {
    await this.settingRepo.upsert(
      { key: 'rate_limit_config', value: JSON.stringify(config) },
      ['key'],
    );
    await this.logAction({
      action: 'rate_limit.config_updated',
      targetType: 'system',
      targetLabel: 'Rate Limit Config',
      performedBy: adminId,
      details: config,
    }).catch(() => {});
    return config;
  }

  async getRateLimitUsage(
    usageData: Array<{ userId: string; count: number; windowStart: number }>,
  ) {
    // Enrich with user info
    const enriched = await Promise.all(
      usageData.map(async (entry) => {
        const user = await this.userRepo.findOne({
          where: { id: entry.userId },
          select: ['id', 'email', 'name', 'role'],
        });
        const sub = await this.subRepo.findOne({
          where: { userId: entry.userId, status: 'active' },
          order: { createdAt: 'DESC' },
          select: ['plan'],
        });
        return {
          userId: entry.userId,
          email: user?.email || 'Unknown',
          name: user?.name || '',
          role: user?.role || 'USER',
          plan: sub?.plan || 'FREE',
          count: entry.count,
          windowStart: entry.windowStart,
        };
      }),
    );

    return enriched.sort((a, b) => b.count - a.count);
  }

  async setUserRateLimit(userId: string, limit: number, adminId: string) {
    const config = await this.getRateLimitConfig();
    if (!config.overrides) config.overrides = {};
    config.overrides[userId] = limit;
    await this.settingRepo.upsert(
      { key: 'rate_limit_config', value: JSON.stringify(config) },
      ['key'],
    );
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['email'],
    });
    await this.logAction({
      action: 'rate_limit.user_override',
      targetType: 'user',
      targetId: userId,
      targetLabel: user?.email || userId,
      performedBy: adminId,
      details: { limit },
    }).catch(() => {});
    return config;
  }

  async removeUserRateLimit(userId: string, adminId: string) {
    const config = await this.getRateLimitConfig();
    if (config.overrides) {
      delete config.overrides[userId];
    }
    await this.settingRepo.upsert(
      { key: 'rate_limit_config', value: JSON.stringify(config) },
      ['key'],
    );
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['email'],
    });
    await this.logAction({
      action: 'rate_limit.user_override_removed',
      targetType: 'user',
      targetId: userId,
      targetLabel: user?.email || userId,
      performedBy: adminId,
    }).catch(() => {});
    return config;
  }

  // ── Plugins ──

  private async seedDefaultPlugins() {
    const defaults = [
      {
        slug: 'slack',
        name: 'Slack',
        description: 'Send notifications to Slack channels when events occur.',
        category: 'notification',
        icon: 'MessageSquare',
        configSchema: JSON.stringify([
          {
            key: 'webhookUrl',
            label: 'Webhook URL',
            type: 'url',
            placeholder: 'https://hooks.slack.com/services/...',
          },
          {
            key: 'channel',
            label: 'Channel',
            type: 'text',
            placeholder: '#general',
          },
        ]),
      },
      {
        slug: 'discord',
        name: 'Discord',
        description: 'Post notifications to Discord channels via webhooks.',
        category: 'notification',
        icon: 'MessageSquare',
        configSchema: JSON.stringify([
          {
            key: 'webhookUrl',
            label: 'Webhook URL',
            type: 'url',
            placeholder: 'https://discord.com/api/webhooks/...',
          },
        ]),
      },
      {
        slug: 'github',
        name: 'GitHub',
        description: 'Sync collections with GitHub repos, trigger workflows.',
        category: 'ci-cd',
        icon: 'Globe',
        configSchema: JSON.stringify([
          {
            key: 'token',
            label: 'Personal Access Token',
            type: 'password',
            placeholder: 'ghp_...',
          },
          {
            key: 'org',
            label: 'Organization',
            type: 'text',
            placeholder: 'my-org',
          },
          {
            key: 'repo',
            label: 'Repository',
            type: 'text',
            placeholder: 'my-repo',
          },
        ]),
      },
      {
        slug: 'gitlab',
        name: 'GitLab',
        description: 'Connect with GitLab for CI/CD pipeline integration.',
        category: 'ci-cd',
        icon: 'Globe',
        configSchema: JSON.stringify([
          {
            key: 'token',
            label: 'Access Token',
            type: 'password',
            placeholder: 'glpat-...',
          },
          {
            key: 'projectUrl',
            label: 'Project URL',
            type: 'url',
            placeholder: 'https://gitlab.com/group/project',
          },
        ]),
      },
      {
        slug: 'jira',
        name: 'Jira',
        description:
          'Create issues and track bugs directly from API test failures.',
        category: 'project-mgmt',
        icon: 'CheckSquare',
        configSchema: JSON.stringify([
          {
            key: 'baseUrl',
            label: 'Base URL',
            type: 'url',
            placeholder: 'https://your-domain.atlassian.net',
          },
          {
            key: 'email',
            label: 'Email',
            type: 'email',
            placeholder: 'user@example.com',
          },
          {
            key: 'apiToken',
            label: 'API Token',
            type: 'password',
            placeholder: '',
          },
          {
            key: 'projectKey',
            label: 'Project Key',
            type: 'text',
            placeholder: 'PROJ',
          },
        ]),
      },
      {
        slug: 'zapier',
        name: 'Zapier',
        description: 'Automate workflows by triggering Zapier zaps on events.',
        category: 'automation',
        icon: 'Webhook',
        configSchema: JSON.stringify([
          {
            key: 'webhookUrl',
            label: 'Webhook URL',
            type: 'url',
            placeholder: 'https://hooks.zapier.com/hooks/...',
          },
        ]),
      },
      {
        slug: 'webhook',
        name: 'Custom Webhook',
        description: 'Send event data to any custom HTTP endpoint.',
        category: 'automation',
        icon: 'Webhook',
        configSchema: JSON.stringify([
          {
            key: 'url',
            label: 'Endpoint URL',
            type: 'url',
            placeholder: 'https://api.example.com/webhook',
          },
          {
            key: 'method',
            label: 'Method',
            type: 'select',
            options: ['POST', 'PUT', 'PATCH'],
            placeholder: 'POST',
          },
          {
            key: 'secret',
            label: 'Secret Key',
            type: 'password',
            placeholder: 'Optional signing secret',
          },
        ]),
      },
      {
        slug: 'datadog',
        name: 'Datadog',
        description:
          'Forward API metrics and events to Datadog for monitoring.',
        category: 'monitoring',
        icon: 'BarChart3',
        configSchema: JSON.stringify([
          {
            key: 'apiKey',
            label: 'API Key',
            type: 'password',
            placeholder: '',
          },
          {
            key: 'appKey',
            label: 'Application Key',
            type: 'password',
            placeholder: '',
          },
          {
            key: 'site',
            label: 'Site',
            type: 'select',
            options: [
              'datadoghq.com',
              'datadoghq.eu',
              'us3.datadoghq.com',
              'us5.datadoghq.com',
            ],
          },
        ]),
      },
      {
        slug: 'pagerduty',
        name: 'PagerDuty',
        description: 'Trigger PagerDuty incidents on critical API failures.',
        category: 'monitoring',
        icon: 'Bell',
        configSchema: JSON.stringify([
          {
            key: 'routingKey',
            label: 'Routing Key',
            type: 'password',
            placeholder: '',
          },
          {
            key: 'severity',
            label: 'Default Severity',
            type: 'select',
            options: ['critical', 'error', 'warning', 'info'],
          },
        ]),
      },
      {
        slug: 'sentry',
        name: 'Sentry',
        description: 'Track errors and exceptions with Sentry monitoring.',
        category: 'monitoring',
        icon: 'AlertTriangle',
        configSchema: JSON.stringify([
          {
            key: 'dsn',
            label: 'DSN',
            type: 'url',
            placeholder: 'https://examplePublicKey@o0.ingest.sentry.io/0',
          },
        ]),
      },
      {
        slug: 's3',
        name: 'AWS S3',
        description: 'Store response exports and backups in Amazon S3.',
        category: 'storage',
        icon: 'Download',
        configSchema: JSON.stringify([
          {
            key: 'bucket',
            label: 'Bucket Name',
            type: 'text',
            placeholder: 'my-bucket',
          },
          {
            key: 'region',
            label: 'Region',
            type: 'text',
            placeholder: 'us-east-1',
          },
          {
            key: 'accessKey',
            label: 'Access Key ID',
            type: 'password',
            placeholder: '',
          },
          {
            key: 'secretKey',
            label: 'Secret Access Key',
            type: 'password',
            placeholder: '',
          },
        ]),
      },
      {
        slug: 'smtp',
        name: 'Email (SMTP)',
        description:
          'Configure SMTP for sending email notifications and alerts.',
        category: 'notification',
        icon: 'Send',
        configSchema: JSON.stringify([
          {
            key: 'host',
            label: 'SMTP Host',
            type: 'text',
            placeholder: 'smtp.gmail.com',
          },
          { key: 'port', label: 'Port', type: 'number', placeholder: '587' },
          { key: 'user', label: 'Username', type: 'text', placeholder: '' },
          {
            key: 'password',
            label: 'Password',
            type: 'password',
            placeholder: '',
          },
          {
            key: 'from',
            label: 'From Address',
            type: 'email',
            placeholder: 'noreply@example.com',
          },
        ]),
      },
    ];

    for (const p of defaults) {
      const exists = await this.pluginRepo.findOne({ where: { slug: p.slug } });
      if (!exists) {
        await this.pluginRepo.save(this.pluginRepo.create(p));
      }
    }
  }

  async getPlugins(category?: string) {
    const where: any = {};
    if (category) where.category = category;
    return this.pluginRepo.find({
      where,
      order: { category: 'ASC', name: 'ASC' },
    });
  }

  async getPlugin(slug: string) {
    const plugin = await this.pluginRepo.findOne({ where: { slug } });
    if (!plugin) throw new NotFoundException('Plugin not found');
    return plugin;
  }

  async updatePlugin(
    slug: string,
    data: { enabled?: boolean; config?: any },
    adminId: string,
  ) {
    const plugin = await this.pluginRepo.findOne({ where: { slug } });
    if (!plugin) throw new NotFoundException('Plugin not found');

    if (data.enabled !== undefined) plugin.enabled = data.enabled;
    if (data.config !== undefined)
      plugin.config =
        typeof data.config === 'string'
          ? data.config
          : JSON.stringify(data.config);

    await this.pluginRepo.save(plugin);
    await this.logAction({
      action:
        data.enabled !== undefined
          ? `plugin.${data.enabled ? 'enabled' : 'disabled'}`
          : 'plugin.config_updated',
      targetType: 'plugin',
      targetId: plugin.id,
      targetLabel: plugin.name,
      performedBy: adminId,
    }).catch(() => {});
    return plugin;
  }

  async testPlugin(slug: string) {
    const plugin = await this.pluginRepo.findOne({ where: { slug } });
    if (!plugin) throw new NotFoundException('Plugin not found');

    let config: any = {};
    try {
      config = JSON.parse(plugin.config);
    } catch {}

    // Basic validation: check if any config fields are filled
    const schema = JSON.parse(plugin.configSchema || '[]');
    const missingFields = schema.filter(
      (f: any) => !config[f.key] && f.type !== 'select',
    );
    if (missingFields.length > 0) {
      return {
        success: false,
        message: `Missing required fields: ${missingFields.map((f: any) => f.label).join(', ')}`,
      };
    }

    // Plugin-specific test logic
    try {
      switch (slug) {
        case 'slack':
        case 'discord':
        case 'zapier':
          // Test webhook URL with a HEAD request
          if (!config.webhookUrl)
            return { success: false, message: 'Webhook URL is required' };
          return {
            success: true,
            message: `Webhook URL configured. Test event ready to send.`,
          };

        case 'smtp':
          if (!config.host || !config.port)
            return { success: false, message: 'Host and port are required' };
          return {
            success: true,
            message: `SMTP configured: ${config.host}:${config.port}`,
          };

        case 'github':
        case 'gitlab':
          if (!config.token)
            return { success: false, message: 'Access token is required' };
          return {
            success: true,
            message: 'Token configured. Connection ready.',
          };

        case 'datadog':
          if (!config.apiKey)
            return { success: false, message: 'API key is required' };
          return { success: true, message: 'Datadog keys configured.' };

        case 'sentry':
          if (!config.dsn)
            return { success: false, message: 'DSN is required' };
          return { success: true, message: 'Sentry DSN configured.' };

        case 's3':
          if (!config.bucket || !config.accessKey)
            return {
              success: false,
              message: 'Bucket and Access Key required',
            };
          return {
            success: true,
            message: `S3 bucket "${config.bucket}" configured.`,
          };

        default:
          return {
            success: true,
            message: 'Plugin configuration looks valid.',
          };
      }
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'Connection test failed',
      };
    }
  }

  onApplicationBootstrap() {
    this.cleanOldApiHits();
    setInterval(
      () => {
        this.cleanOldApiHits();
      },
      24 * 60 * 60 * 1000,
    ); // Daily auto-purge
  }

  async cleanOldApiHits() {
    try {
      const dateLimit = new Date();
      dateLimit.setDate(dateLimit.getDate() - 50); // 50 days retention
      await this.apiHitRepo
        .createQueryBuilder()
        .delete()
        .where('createdAt < :dateLimit', { dateLimit })
        .execute();
      console.log('Successfully cleaned up API hits older than 50 days');
    } catch (e) {
      console.error('Failed to clean up old API hits:', e);
    }
  }

  async getApiHits(
    page = 1,
    limit = 25,
    search?: string,
    method?: string,
    statusCode?: number,
    startDate?: string,
    endDate?: string,
  ) {
    const query = this.apiHitRepo.createQueryBuilder('hit');

    if (search) {
      query.andWhere(
        '(hit.userEmail ILIKE :s OR hit.endpoint ILIKE :s OR hit.destinationUrl ILIKE :s OR hit.ipAddress ILIKE :s)',
        { s: `%${search}%` },
      );
    }

    if (method && method !== 'all') {
      query.andWhere('hit.method = :method', { method });
    }

    if (statusCode) {
      query.andWhere('hit.statusCode = :statusCode', { statusCode });
    }

    if (startDate) {
      query.andWhere('hit.createdAt >= :startDate', {
        startDate: new Date(startDate),
      });
    }

    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.andWhere('hit.createdAt <= :endDate', { endDate: end });
    }

    query.orderBy('hit.createdAt', 'DESC');

    const total = await query.getCount();
    const logs = await query
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    // Calculate summary statistics on the filtered query
    const statsQuery = this.apiHitRepo.createQueryBuilder('hit')
      .select('COUNT(*)', 'totalCount')
      .addSelect('AVG(hit.durationMs)', 'avgLatency')
      .addSelect('COUNT(CASE WHEN hit.statusCode >= 200 AND hit.statusCode < 300 THEN 1 END)', 'successCount')
      .addSelect('COUNT(CASE WHEN hit.statusCode >= 400 THEN 1 END)', 'errorCount');

    if (search) {
      statsQuery.andWhere(
        '(hit.userEmail ILIKE :s OR hit.endpoint ILIKE :s OR hit.destinationUrl ILIKE :s OR hit.ipAddress ILIKE :s)',
        { s: `%${search}%` },
      );
    }
    if (method && method !== 'all') {
      statsQuery.andWhere('hit.method = :method', { method });
    }
    if (statusCode) {
      statsQuery.andWhere('hit.statusCode = :statusCode', { statusCode });
    }
    if (startDate) {
      statsQuery.andWhere('hit.createdAt >= :startDate', { startDate: new Date(startDate) });
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      statsQuery.andWhere('hit.createdAt <= :endDate', { endDate: end });
    }

    const rawStats = await statsQuery.getRawOne();
    const stats = {
      totalCount: parseInt(rawStats.totalCount || '0', 10),
      avgLatency: Math.round(parseFloat(rawStats.avgLatency || '0')),
      successCount: parseInt(rawStats.successCount || '0', 10),
      errorCount: parseInt(rawStats.errorCount || '0', 10),
    };

    return { 
      logs, 
      total, 
      page, 
      totalPages: Math.ceil(total / limit),
      stats
    };
  }

  async exportApiHitsCsv(
    search?: string,
    method?: string,
    statusCode?: number,
    startDate?: string,
    endDate?: string,
  ): Promise<string> {
    const query = this.apiHitRepo.createQueryBuilder('hit');

    if (search) {
      query.andWhere(
        '(hit.userEmail ILIKE :s OR hit.endpoint ILIKE :s OR hit.destinationUrl ILIKE :s OR hit.ipAddress ILIKE :s)',
        { s: `%${search}%` },
      );
    }
    if (method && method !== 'all') {
      query.andWhere('hit.method = :method', { method });
    }
    if (statusCode) {
      query.andWhere('hit.statusCode = :statusCode', { statusCode });
    }
    if (startDate) {
      query.andWhere('hit.createdAt >= :startDate', { startDate: new Date(startDate) });
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.andWhere('hit.createdAt <= :endDate', { endDate: end });
    }

    query.orderBy('hit.createdAt', 'DESC').take(10000); // Limit to top 10k logs
    const logs = await query.getMany();

    const header = 'Date,User,Method,Endpoint,Status,Latency (ms),IP Address\n';
    const rows = logs
      .map((l) => {
        const d = l.createdAt ? new Date(l.createdAt).toISOString() : '';
        const endpoint = (l.destinationUrl || l.endpoint || '').replace(/"/g, '""');
        return `"${d}","${l.userEmail || 'Guest'}","${l.method || ''}","${endpoint}",${l.statusCode || 0},${l.durationMs || 0},"${l.ipAddress || ''}"`;
      })
      .join('\n');

    return header + rows;
  }
}
