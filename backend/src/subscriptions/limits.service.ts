import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subscription } from './subscription.entity';
import { Collection } from '../collections/collection.entity';
import { RequestItem } from '../requests/request.entity';
import { OrganizationUser } from '../organizations/organization-user.entity';
import { Environment } from '../environments/environment.entity';
import { PlanId, PlanLimits, getPlanLimits } from './plans.config';
import { PlanOverride } from '../admin/plan-override.entity';

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
    @InjectRepository(PlanOverride)
    private overrideRepo: Repository<PlanOverride>,
  ) {}

  /** Get plan limits merged with any admin overrides from DB */
  private async getMergedLimits(planId: PlanId): Promise<PlanLimits> {
    const defaults = getPlanLimits(planId);
    try {
      const override = await this.overrideRepo.findOne({ where: { planId } });
      if (!override) return defaults;

      return {
        ...defaults,
        ...(override.maxCollections !== null && { maxCollections: override.maxCollections }),
        ...(override.maxRequestsPerCollection !== null && { maxRequestsPerCollection: override.maxRequestsPerCollection }),
        ...(override.maxMembers !== null && { maxMembers: override.maxMembers }),
        ...(override.maxEnvironments !== null && { maxEnvironments: override.maxEnvironments }),
        ...(override.historyDays !== null && { historyDays: override.historyDays }),
        ...(override.maxUploadMb !== null && { maxUploadMb: override.maxUploadMb }),
      };
    } catch {
      return defaults;
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

    return {
      plan,
      limits,
      usage: {
        collections,
        members,
        environments,
      },
    };
  }
}
