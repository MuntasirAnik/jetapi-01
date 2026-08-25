import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrganizationUser } from '../organizations/organization-user.entity';
import { Workspace } from '../workspaces/workspace.entity';
import { Collection } from '../collections/collection.entity';
import { Environment } from '../environments/environment.entity';
import { User } from '../users/user.entity';
import { Organization } from '../organizations/organization.entity';

@Injectable()
export class InitService {
  constructor(
    @InjectRepository(OrganizationUser)
    private readonly orgUserRepo: Repository<OrganizationUser>,
    @InjectRepository(Workspace)
    private readonly workspaceRepo: Repository<Workspace>,
    @InjectRepository(Collection)
    private readonly collectionRepo: Repository<Collection>,
    @InjectRepository(Environment)
    private readonly environmentRepo: Repository<Environment>,
  ) {}

  async getInitData(userId: string) {
    // ═══════════════════════════════════════════════════════════════
    // PHASE 1 — All independent queries fire.
    // ═══════════════════════════════════════════════════════════════
    let orgUsers = await this.orgUserRepo.find({
      where: { userId, status: 'ACCEPTED' },
      relations: ['organization'],
    });

    if (orgUsers.length === 0) {
      const userRepo = this.orgUserRepo.manager.getRepository(User);
      const orgRepo = this.orgUserRepo.manager.getRepository(Organization);

      const user = await userRepo.findOne({ where: { id: userId } });
      const name = user?.name || user?.email?.split('@')[0] || 'Personal';

      const newOrg = orgRepo.create({
        name: `${name}'s Team`,
        subscriptionTier: 'FREE',
      });
      const savedOrg = await orgRepo.save(newOrg);

      const newOrgUser = this.orgUserRepo.create({
        userId,
        organizationId: savedOrg.id,
        role: 'OWNER',
        status: 'ACCEPTED',
      });
      await this.orgUserRepo.save(newOrgUser);

      const newWs = this.workspaceRepo.create({
        name: 'Default Workspace',
        organizationId: savedOrg.id,
      });
      await this.workspaceRepo.save(newWs);

      orgUsers = await this.orgUserRepo.find({
        where: { userId, status: 'ACCEPTED' },
        relations: ['organization'],
      });
    }

    const organizations = orgUsers.map((ou) => ou.organization);
    const orgIds = [...new Set(organizations.map((o) => o.id))];

    const adminOrgIds = [...new Set(orgUsers
      .filter((ou) => ou.role === 'OWNER' || ou.role === 'ADMIN')
      .map((ou) => ou.organizationId))];

    const memberOrgIds = [...new Set(orgUsers
      .filter((ou) => ou.role === 'MEMBER')
      .map((ou) => ou.organizationId))];

    const colQuery = this.collectionRepo
      .createQueryBuilder('col')
      .leftJoin('col.shares', 'share')
      .leftJoin('col.orgShares', 'orgShare')
      .select('col.id');

    colQuery.where('col.ownerId = :userId', { userId })
      .orWhere('share.userId = :userId', { userId });

    if (adminOrgIds.length > 0) {
      colQuery.orWhere('col."workspaceId" IN (SELECT w.id FROM workspace w WHERE w."organizationId" IN (:...adminOrgIds))', { adminOrgIds });
    }

    if (memberOrgIds.length > 0) {
      colQuery.orWhere('orgShare.organizationId IN (:...memberOrgIds)', { memberOrgIds });
    }

    const accessibleColIds = await colQuery.getMany();
    const colIds = [...new Set(accessibleColIds.map((c) => c.id))];

    // Early exit — nothing to load
    if (orgIds.length === 0 && colIds.length === 0) {
      return {
        organizations,
        workspaces: [],
        sharedCollections: [],
        environments: [],
      };
    }

    // ═══════════════════════════════════════════════════════════════
    // PHASE 2 — Three queries in parallel, all depend only on Phase 1.
    //   • workspaces   → needs orgIds
    //   • collections  → needs colIds
    //   • requests     → needs colIds (independent of collections!)
    // ═══════════════════════════════════════════════════════════════
    const [workspaces, collections, requests]: [Workspace[], Collection[], any[]] = await Promise.all([
      orgIds.length > 0
        ? (async () => {
            if (adminOrgIds.length === 0 && colIds.length === 0) {
              return [];
            }

            const query = this.workspaceRepo.createQueryBuilder('ws');
            let hasCondition = false;

            if (adminOrgIds.length > 0) {
              query.where('ws.organizationId IN (:...adminOrgIds)', { adminOrgIds });
              hasCondition = true;
            }

            if (memberOrgIds.length > 0 && colIds.length > 0) {
              const memberWsClause = 'ws.organizationId IN (:...memberOrgIds) AND ws.id IN (SELECT col."workspaceId" FROM collection col WHERE col.id IN (:...colIds))';
              const params = { memberOrgIds, colIds };
              if (hasCondition) {
                query.orWhere(memberWsClause, params);
              } else {
                query.where(memberWsClause, params);
              }
            }

            return query.getMany();
          })()
        : Promise.resolve([]),

      colIds.length > 0
        ? this.collectionRepo
            .createQueryBuilder('col')
            .leftJoinAndSelect('col.shares', 'share')
            .leftJoin('share.user', 'sharedUser')
            .addSelect([
              'sharedUser.id',
              'sharedUser.email',
              'sharedUser.name',
              'sharedUser.avatarMimeType',
            ])
            .leftJoinAndSelect('col.orgShares', 'orgShare')
            .leftJoinAndSelect('orgShare.organization', 'sharedOrg')
            .leftJoin('col.owner', 'owner')
            .addSelect([
              'owner.id',
              'owner.email',
              'owner.name',
              'owner.avatarMimeType',
            ])
            .leftJoinAndSelect('col.workspace', 'ws')
            .where('col.id IN (:...colIds)', { colIds })
            .getMany()
            .then((cols) =>
              cols.map((c) => {
                // Hydrate virtual sharedUsers from shares for backward compat
                c.sharedUsers = (c.shares || []).map((s) => ({
                  ...s.user,
                  shareRole: s.role,
                })) as any;
                // Hydrate virtual sharedOrganizations from orgShares
                c.sharedOrganizations = (c.orgShares || []).map((os) => ({
                  ...os.organization,
                  shareRole: os.role,
                })) as any;
                // Strip shares array to reduce payload
                delete (c as any).shares;
                delete (c as any).orgShares;
                return c;
              }),
            )
        : [],

      colIds.length > 0
        ? this.collectionRepo.manager
            .getRepository('RequestItem')
            .createQueryBuilder('req')
            .select([
              'req.id',
              'req.name',
              'req.method',
              'req.url',
              'req.folder',
              'req.collectionId',
            ])
            .where('req.collectionId IN (:...colIds)', { colIds })
            .getMany()
        : [],
    ]);

    // ═══════════════════════════════════════════════════════════════
    // PHASE 3 — Environments (needs workspace IDs from Phase 2)
    // ═══════════════════════════════════════════════════════════════
    const orgWsIds = workspaces.map((w) => w.id);
    const sharedWsIds = collections
      .map((c) => c.workspaceId)
      .filter((id) => id && !orgWsIds.includes(id));
    const uniqueSharedWsIds = [...new Set(sharedWsIds)];
    const allWsIds = [...new Set([...orgWsIds, ...uniqueSharedWsIds])];

    // Fetch shared workspaces + environments in parallel
    const [sharedWorkspaces, environments] = await Promise.all([
      uniqueSharedWsIds.length > 0
        ? this.workspaceRepo
            .createQueryBuilder('ws')
            .where('ws.id IN (:...wsIds)', { wsIds: uniqueSharedWsIds })
            .getMany()
        : [],

      allWsIds.length > 0
        ? this.environmentRepo
            .createQueryBuilder('env')
            .where('env.workspaceId IN (:...wsIds)', { wsIds: allWsIds })
            .getMany()
        : [],
    ]);

    // ═══════════════════════════════════════════════════════════════
    // ASSEMBLY — Pure in-memory, zero DB hits. Uses Map for O(1) lookups.
    // ═══════════════════════════════════════════════════════════════

    // Group requests by collectionId — O(n) build, O(1) per-collection lookup
    const requestsByCol = new Map<string, any[]>();
    for (const req of requests) {
      const cid = (req as any).collectionId;
      if (!requestsByCol.has(cid)) requestsByCol.set(cid, []);
      requestsByCol.get(cid)!.push(req);
    }
    for (const col of collections) {
      col.requests = (requestsByCol.get(col.id) || []) as any;
    }

    // Merge org workspaces + shared workspaces
    const allWorkspaces = [...workspaces, ...sharedWorkspaces];

    // Group collections by workspaceId
    const colsByWs = new Map<string, any[]>();
    for (const col of collections) {
      if (!col.workspaceId) continue;
      if (!colsByWs.has(col.workspaceId)) colsByWs.set(col.workspaceId, []);
      colsByWs.get(col.workspaceId)!.push(col);
    }
    for (const ws of allWorkspaces) {
      ws.collections = (colsByWs.get(ws.id) || []) as any;
    }

    // Shared collections: user has a share record OR team share but is NOT the owner
    const sharedCollections = collections.filter(
      (c) => c.ownerId !== userId && (
        c.sharedUsers?.some((s: any) => s.id === userId) ||
        c.sharedOrganizations?.some((so: any) => orgIds.includes(so.id))
      ),
    );

    const uniqueOrgs = organizations.filter((org, index, self) =>
      self.findIndex((o) => o.id === org.id) === index
    );

    const uniqueWorkspaces = allWorkspaces.filter((ws, index, self) =>
      self.findIndex((w) => w.id === ws.id) === index
    );

    return {
      organizations: uniqueOrgs,
      workspaces: uniqueWorkspaces,
      sharedCollections,
      environments,
    };
  }
}
