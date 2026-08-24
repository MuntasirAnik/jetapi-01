import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import { Workspace } from './workspace.entity';
import { OrganizationUser } from '../organizations/organization-user.entity';

@Injectable()
export class WorkspacesService {
  constructor(
    @InjectRepository(Workspace)
    private readonly workspaceRepository: Repository<Workspace>,
    @InjectRepository(OrganizationUser)
    private readonly orgUserRepo: Repository<OrganizationUser>,
  ) {}

  async create(data: Partial<Workspace>, userId: string): Promise<Workspace> {
    const membership = await this.orgUserRepo.findOne({
      where: { organizationId: data.organizationId, userId, status: 'ACCEPTED' },
    });
    if (
      !membership ||
      (membership.role !== 'OWNER' && membership.role !== 'ADMIN')
    ) {
      throw new ForbiddenException(
        'Only owners and admins can create workspaces in this organization.',
      );
    }
    const workspace = this.workspaceRepository.create({ ...data });
    return this.workspaceRepository.save(workspace);
  }

  async findAllByOrg(orgId: string, userId: string): Promise<Workspace[]> {
    const membership = await this.orgUserRepo.findOne({
      where: { organizationId: orgId, userId, status: 'ACCEPTED' },
    });
    if (!membership) throw new ForbiddenException('Access denied');

    const isOrgAdminOrOwner = membership.role === 'OWNER' || membership.role === 'ADMIN';

    // Retrieve collections for these workspaces based on role
    const collectionQuery = this.workspaceRepository.manager
      .getRepository('Collection')
      .createQueryBuilder('col')
      .leftJoinAndSelect('col.shares', 'share')
      .leftJoinAndSelect('share.user', 'sharedUser')
      .leftJoinAndSelect('col.orgShares', 'orgShare');

    if (!isOrgAdminOrOwner) {
      collectionQuery.where(
        new Brackets((qb) => {
          qb.where('col.ownerId = :userId', { userId })
            .orWhere('share.userId = :userId', { userId })
            .orWhere('orgShare.organizationId = :orgId', { orgId });
        }),
      );
    } else {
      // For admin/owner, just fetch collections belonging to organization's workspaces
      collectionQuery.where(
        'col."workspaceId" IN (SELECT w.id FROM workspace w WHERE w."organizationId" = :orgId)',
        { orgId },
      );
    }

    const collections = await collectionQuery.getMany();
    const accessibleWorkspaceIds = [...new Set(collections.map((c) => c.workspaceId).filter(Boolean))];

    // Find the workspaces
    let workspaces: Workspace[] = [];
    if (isOrgAdminOrOwner) {
      workspaces = await this.workspaceRepository.find({
        where: { organizationId: orgId },
      });
    } else {
      if (accessibleWorkspaceIds.length > 0) {
        workspaces = await this.workspaceRepository.createQueryBuilder('ws')
          .where('ws.organizationId = :orgId AND ws.id IN (:...accessibleWorkspaceIds)', { orgId, accessibleWorkspaceIds })
          .getMany();
      }
    }

    if (workspaces.length === 0) return [];

    const collectionIds = collections.map((c) => c.id);
    let requests: any[] = [];

    if (collectionIds.length > 0) {
      requests = await this.workspaceRepository.manager
        .getRepository('RequestItem')
        .createQueryBuilder('req')
        .where('req.collectionId IN (:...collectionIds)', { collectionIds })
        .getMany();
    }

    collections.forEach((col) => {
      col.requests = requests.filter((r) => r.collectionId === col.id);
    });

    workspaces.forEach((ws) => {
      ws.collections = collections.filter(
        (c) => c.workspaceId === ws.id,
      ) as any;
    });

    return workspaces;
  }

  async findOne(id: string, userId: string): Promise<Workspace> {
    const workspace = await this.workspaceRepository.findOne({
      where: { id },
    });

    if (!workspace) throw new NotFoundException('Workspace not found');

    const membership = await this.orgUserRepo.findOne({
      where: { organizationId: workspace.organizationId, userId, status: 'ACCEPTED' },
    });

    const isOrgAdminOrOwner = membership && (membership.role === 'OWNER' || membership.role === 'ADMIN');

    // Retrieve collections for this workspace
    const collectionQuery = this.workspaceRepository.manager
      .getRepository('Collection')
      .createQueryBuilder('col')
      .leftJoinAndSelect('col.shares', 'share')
      .leftJoinAndSelect('share.user', 'sharedUser')
      .leftJoinAndSelect('col.orgShares', 'orgShare')
      .leftJoinAndSelect('orgShare.organization', 'sharedOrg')
      .where('col.workspaceId = :id', { id });

    if (!isOrgAdminOrOwner) {
      collectionQuery.andWhere(
        new Brackets((qb) => {
          qb.where('col.ownerId = :userId', { userId })
            .orWhere('share.userId = :userId', { userId })
            .orWhere('orgShare.organizationId = :orgId', { orgId: workspace.organizationId });
        }),
      );
    }

    const collections = await collectionQuery.getMany();

    const userOrgs = await this.orgUserRepo.find({ where: { userId, status: 'ACCEPTED' } });
    const userOrgIds = userOrgs.map((ou) => ou.organizationId);

    // Access check: must be owner/admin OR must have access to at least one collection
    let hasAccess = isOrgAdminOrOwner;
    if (!hasAccess) {
      const hasSharedCollection = collections.some((c: any) =>
        c.ownerId === userId ||
        c.shares?.some((s: any) => s.userId === userId) ||
        c.orgShares?.some((os: any) => userOrgIds.includes(os.organizationId))
      );
      hasAccess = hasSharedCollection;
    }

    if (!hasAccess) throw new ForbiddenException('Access denied');

    const collectionIds = collections.map((c) => c.id);
    let requests: any[] = [];
    if (collectionIds.length > 0) {
      requests = await this.workspaceRepository.manager
        .getRepository('RequestItem')
        .createQueryBuilder('req')
        .where('req.collectionId IN (:...collectionIds)', { collectionIds })
        .getMany();
    }

    collections.forEach((col: any) => {
      col.requests = requests.filter((r) => r.collectionId === col.id);
    });

    workspace.collections = collections as any;

    return workspace;
  }

  async update(
    id: string,
    data: Partial<Workspace>,
    userId: string,
  ): Promise<Workspace> {
    const workspace = await this.findOne(id, userId);

    const membership = await this.orgUserRepo.findOne({
      where: { organizationId: workspace.organizationId, userId, status: 'ACCEPTED' },
    });
    if (
      !membership ||
      (membership.role !== 'OWNER' && membership.role !== 'ADMIN')
    ) {
      throw new ForbiddenException(
        'Only owners and admins can manage workspaces.',
      );
    }

    Object.assign(workspace, data);
    return this.workspaceRepository.save(workspace);
  }

  async remove(id: string, userId: string): Promise<void> {
    const workspace = await this.findOne(id, userId);

    const membership = await this.orgUserRepo.findOne({
      where: { organizationId: workspace.organizationId, userId, status: 'ACCEPTED' },
    });
    if (!membership || membership.role !== 'OWNER') {
      throw new ForbiddenException('Only owners can delete workspaces');
    }

    await this.workspaceRepository.remove(workspace);
  }
}
