import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subscription } from './subscription.entity';
import { Collection } from '../collections/collection.entity';
import { RequestItem } from '../requests/request.entity';
import { OrganizationUser } from '../organizations/organization-user.entity';
import { Environment } from '../environments/environment.entity';
import { PlanId, PlanLimits, getDefaultPlanLimits } from './plans.config';
import { Plan } from './plan.entity';

@Injectable()
export class LimitsService {
  constructor(
    @InjectRepository(Subscription)
    private subscriptionRepo: Repository<Subscription>,
    @InjectRepository(Collection)
    private collectionRepo: Repository<Collection>,
    @InjectRepository(RequestItem)
    private requestRepo: Repository<RequestItem>,
    @InjectRepository(OrganizationUser)
    private orgUserRepo: Repository<OrganizationUser>,
    @InjectRepository(Environment)
    private environmentRepo: Repository<Environment>,
    @InjectRepository(Plan)
    private planRepo: Repository<Plan>,
  ) {}

  /** Get plan limits from the Plan DB table, falling back to hardcoded defaults */
  private async getMergedLimits(planId: PlanId): Promise<PlanLimits> {
    try {
      const plan = await this.planRepo.findOne({ where: { id: planId } });
      if (!plan) return getDefaultPlanLimits(planId);

      return {
        maxCollections: plan.maxCollections,
        maxRequestsPerCollection: plan.maxRequestsPerCollection,
        maxMembers: plan.maxMembers,
        maxCollaborators: plan.maxCollaborators,
        maxEnvironments: plan.maxEnvironments,
        sharedCollections: plan.sharedCollections,
        apiDocExport: plan.apiDocExport,
        historyDays: plan.historyDays,
        maxUploadMb: plan.maxUploadMb,
        analyticsAccess: plan.analyticsAccess,
      };
    } catch {
      return getDefaultPlanLimits(planId);
    }
  }

  async getUserPlan(userId: string): Promise<PlanId> {
    const sub = await this.subscriptionRepo.findOne({
      where: { userId, status: 'active' },
      order: { createdAt: 'DESC' },
    });
    return (sub?.plan as PlanId) || 'FREE';
  }

  async checkCollectionLimit(userId: string): Promise<void> {
    const plan = await this.getUserPlan(userId);
    const limits = await this.getMergedLimits(plan);
    if (limits.maxCollections === -1) return; // unlimited

    const count = await this.collectionRepo.count({
      where: { ownerId: userId },
    });

    if (count >= limits.maxCollections) {
      throw new ForbiddenException(
        `You've reached the maximum of ${limits.maxCollections} collections on the ${plan} plan. Upgrade to create more.`,
      );
    }
  }

  async checkRequestLimit(userId: string, collectionId: string): Promise<void> {
    const plan = await this.getUserPlan(userId);
    const limits = await this.getMergedLimits(plan);
    if (limits.maxRequestsPerCollection === -1) return;

    const count = await this.requestRepo.count({
      where: { collectionId },
    });

    if (count >= limits.maxRequestsPerCollection) {
      throw new ForbiddenException(
        `You've reached the maximum of ${limits.maxRequestsPerCollection} requests per collection on the ${plan} plan. Upgrade to add more.`,
      );
    }
  }

  async checkMemberLimit(organizationId: string, userId: string): Promise<void> {
    const plan = await this.getUserPlan(userId);
    const limits = await this.getMergedLimits(plan);
    if (limits.maxMembers === -1) return;

    const count = await this.orgUserRepo.count({
      where: { organizationId },
    });

    if (count >= limits.maxMembers) {
      throw new ForbiddenException(
        `You've reached the maximum of ${limits.maxMembers} members on the ${plan} plan. Upgrade to add more.`,
      );
    }
  }

  async checkEnvironmentLimit(userId: string, workspaceId: string): Promise<void> {
    const plan = await this.getUserPlan(userId);
    const limits = await this.getMergedLimits(plan);
    if (limits.maxEnvironments === -1) return;

    const count = await this.environmentRepo.count({
      where: { workspaceId },
    });

    if (count >= limits.maxEnvironments) {
      throw new ForbiddenException(
        `You've reached the maximum of ${limits.maxEnvironments} environments on the ${plan} plan. Upgrade to add more.`,
      );
    }
  }

  async getUsageSummary(userId: string) {
    const plan = await this.getUserPlan(userId);
    const limits = await this.getMergedLimits(plan);

    const collections = await this.collectionRepo.count({
      where: { ownerId: userId },
    });

    // Count team members: find the org where user is owner, then count members
    let members = 0;
    try {
      const orgUserEntry = await this.orgUserRepo.findOne({
        where: { userId, role: 'OWNER' },
      });
      if (orgUserEntry) {
        members = await this.orgUserRepo.count({
          where: { organizationId: orgUserEntry.organizationId },
        });
      }
    } catch (e) {
      // Fallback if query fails
      members = 0;
    }

    // Count environments owned by this user
    let environments = 0;
    try {
      environments = await this.environmentRepo.count({
        where: { ownerId: userId },
      });
    } catch (e) {
      environments = 0;
    }

    // Count total collaborators (shared users across all owned collections)
    let collaborators = 0;
    try {
      const ownedCollections = await this.collectionRepo.find({
        where: { ownerId: userId },
        relations: ['shares'],
      });
      for (const col of ownedCollections) {
        collaborators += (col as any).shares?.length || 0;
      }
    } catch {
      collaborators = 0;
    }

    return {
      plan,
      limits,
      usage: {
        collections,
        members,
        collaborators,
        environments,
      },
    };
  }

  async getUserReport(userId: string) {
    const plan = await this.getUserPlan(userId);
    const limits = await this.getMergedLimits(plan);

    // Collections with request counts
    const collections = await this.collectionRepo.find({
      where: { ownerId: userId },
      order: { createdAt: 'DESC' },
    });

    const collectionStats = await Promise.all(
      collections.map(async (c) => {
        const requestCount = await this.requestRepo.count({ where: { collectionId: c.id } });
        return { id: c.id, name: c.name, requestCount, createdAt: c.createdAt };
      }),
    );

    // Sort by request count desc for "top collections"
    const topCollections = [...collectionStats].sort((a, b) => b.requestCount - a.requestCount).slice(0, 10);

    // Total requests across all collections
    const totalRequests = collectionStats.reduce((s, c) => s + c.requestCount, 0);

    // Environments count
    let environments = 0;
    try {
      environments = await this.environmentRepo.count({ where: { ownerId: userId } });
    } catch { environments = 0; }

    // Collections per month (last 6 months)
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const collectionsByMonth = months.map(m => {
      const count = collections.filter(c => {
        const cm = `${c.createdAt.getFullYear()}-${String(c.createdAt.getMonth() + 1).padStart(2, '0')}`;
        return cm === m;
      }).length;
      return count;
    });

    return {
      plan,
      limits,
      summary: {
        totalCollections: collections.length,
        totalRequests,
        environments,
      },
      topCollections,
      months,
      collectionsByMonth,
    };
  }
}
