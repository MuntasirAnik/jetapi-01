import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrganizationUser } from '../organizations/organization-user.entity';
import { Workspace } from '../workspaces/workspace.entity';
import { Collection } from '../collections/collection.entity';
import { Environment } from '../environments/environment.entity';

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
    // PHASE 1 — All independent queries fire simultaneously.
    //   • orgUsers     → depends on nothing
    //   • colIds       → depends on nothing (single query replaces two)
    // ═══════════════════════════════════════════════════════════════
    const [orgUsers, accessibleColIds] = await Promise.all([
      this.orgUserRepo.find({
        where: { userId },
        relations: ['organization'],
      }),

      // Single query: owned OR shared — replaces two separate queries
      this.collectionRepo
        .createQueryBuilder('col')
        .leftJoin('col.sharedUsers', 'su')
        .select('col.id')
        .where('col.ownerId = :userId', { userId })
        .orWhere('su.id = :userId', { userId })
        .getMany(),
    ]);

    const organizations = orgUsers.map(ou => ou.organization);
    const orgIds = organizations.map(o => o.id);
    const colIds = [...new Set(accessibleColIds.map(c => c.id))];

    // Early exit — nothing to load
    if (orgIds.length === 0 && colIds.length === 0) {
      return { organizations, workspaces: [], sharedCollections: [], environments: [] };
    }

    // ═══════════════════════════════════════════════════════════════
    // PHASE 2 — Three queries in parallel, all depend only on Phase 1.
    //   • workspaces   → needs orgIds
    //   • collections  → needs colIds
    //   • requests     → needs colIds (independent of collections!)
    // ═══════════════════════════════════════════════════════════════
    const [workspaces, collections, requests] = await Promise.all([
      orgIds.length > 0
        ? this.workspaceRepo
            .createQueryBuilder('ws')
            .where('ws.organizationId IN (:...orgIds)', { orgIds })
            .getMany()
        : [],

      colIds.length > 0
        ? this.collectionRepo
            .createQueryBuilder('col')
            .leftJoinAndSelect('col.sharedUsers', 'su')
            .leftJoinAndSelect('col.owner', 'owner')
            .leftJoinAndSelect('col.workspace', 'ws')
            .where('col.id IN (:...colIds)', { colIds })
            .getMany()
        : [],

      colIds.length > 0
        ? this.collectionRepo.manager
            .getRepository('RequestItem')
            .createQueryBuilder('req')
            .where('req.collectionId IN (:...colIds)', { colIds })
            .getMany()
        : [],
    ]);

    // ═══════════════════════════════════════════════════════════════
    // PHASE 3 — Environments (needs workspace IDs from Phase 2)
    // ═══════════════════════════════════════════════════════════════
    const orgWsIds = workspaces.map(w => w.id);
    const sharedWsIds = collections
      .map(c => c.workspaceId)
      .filter(id => id && !orgWsIds.includes(id));
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

    // Shared collections: user is in sharedUsers but is NOT the owner
    const sharedCollections = collections.filter(c =>
      c.ownerId !== userId && c.sharedUsers?.some(su => su.id === userId)
    );

    return { organizations, workspaces: allWorkspaces, sharedCollections, environments };
  }
}
