import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { Organization } from '../organizations/organization.entity';
import { OrganizationUser } from '../organizations/organization-user.entity';
import { Collection } from '../collections/collection.entity';
import { Subscription } from '../subscriptions/subscription.entity';
import { PlanOverride } from './plan-override.entity';
import { Payment } from '../subscriptions/payment.entity';
import { PLANS, PlanId } from '../subscriptions/plans.config';

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
  ) {}

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

  // ── Users ──

  async getAllUsers(search?: string) {
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

    if (search) {
      query.where('user.email ILIKE :search OR user.name ILIKE :search', { search: `%${search}%` });
    }

    query.orderBy('user.createdAt', 'DESC');

    const users = await query.getMany();

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

    return result;
  }

  async updateUser(userId: string, data: { role?: string; name?: string }) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (data.role) user.role = data.role;
    if (data.name !== undefined) user.name = data.name;

    return this.userRepo.save(user);
  }

  async deleteUser(userId: string, requesterId: string) {
    if (userId === requesterId) throw new ForbiddenException('You cannot deactivate yourself.');
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    user.isActive = false;
    await this.userRepo.save(user);
    return { deactivated: true };
  }

  async toggleUserActive(userId: string, requesterId: string) {
    if (userId === requesterId) throw new ForbiddenException('You cannot deactivate yourself.');
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    user.isActive = !user.isActive;
    await this.userRepo.save(user);
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
}
