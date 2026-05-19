import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
    const membership = await this.orgUserRepo.findOne({ where: { organizationId: data.organizationId, userId }});
    if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
      throw new ForbiddenException('Only owners and admins can create workspaces in this organization.');
    }
    const workspace = this.workspaceRepository.create({ ...data });
    return this.workspaceRepository.save(workspace);
  }

  async findAllByOrg(orgId: string, userId: string): Promise<Workspace[]> {
    const membership = await this.orgUserRepo.findOne({ where: { organizationId: orgId, userId }});
    if (!membership) throw new ForbiddenException('Access denied');

    const workspaces = await this.workspaceRepository.find({
      where: { organizationId: orgId }
    });

    if (workspaces.length === 0) return [];

    const workspaceIds = workspaces.map(w => w.id);
    const collections = await this.workspaceRepository.manager.getRepository('Collection').createQueryBuilder('col')
      .leftJoinAndSelect('col.shares', 'share')
      .leftJoinAndSelect('share.user', 'sharedUser')
      .where('col.workspaceId IN (:...workspaceIds)', { workspaceIds })
      .getMany();

    const collectionIds = collections.map(c => c.id);
    let requests: any[] = [];
    
    if (collectionIds.length > 0) {
      requests = await this.workspaceRepository.manager.getRepository('RequestItem').createQueryBuilder('req')
        .where('req.collectionId IN (:...collectionIds)', { collectionIds })
        .getMany();
    }

    collections.forEach(col => {
      col.requests = requests.filter(r => r.collectionId === col.id);
    });

    workspaces.forEach(ws => {
      ws.collections = collections.filter(c => c.workspaceId === ws.id) as any;
    });
    
    return workspaces;
  }

  async findOne(id: string, userId: string): Promise<Workspace> {
    const workspace = await this.workspaceRepository.findOne({
      where: { id }
    });

    if (!workspace) throw new NotFoundException('Workspace not found');

    const membership = await this.orgUserRepo.findOne({ where: { organizationId: workspace.organizationId, userId }});

    const collections = await this.workspaceRepository.manager.getRepository('Collection').createQueryBuilder('col')
      .leftJoinAndSelect('col.shares', 'share')
      .leftJoinAndSelect('share.user', 'sharedUser')
      .where('col.workspaceId = :id', { id })
      .getMany();

    const collectionIds = collections.map(c => c.id);
    let requests: any[] = [];
    if (collectionIds.length > 0) {
      requests = await this.workspaceRepository.manager.getRepository('RequestItem').createQueryBuilder('req')
        .where('req.collectionId IN (:...collectionIds)', { collectionIds })
        .getMany();
    }

    collections.forEach((col: any) => {
      col.requests = requests.filter(r => r.collectionId === col.id);
    });

    workspace.collections = collections as any;

    let hasAccess = !!membership;
    if (!hasAccess) {
      const hasSharedCollection = workspace.collections?.some((c: any) => 
         c.shares?.some((s: any) => s.userId === userId)
      );
      hasAccess = !!hasSharedCollection;
    }

    if (!hasAccess) throw new ForbiddenException('Access denied');

    if (!membership && workspace.collections) {
      workspace.collections = workspace.collections.filter((c: any) => c.shares?.some((s: any) => s.userId === userId)) as any;
    }

    return workspace;
  }

  async update(id: string, data: Partial<Workspace>, userId: string): Promise<Workspace> {
    const workspace = await this.findOne(id, userId);
    
    const membership = await this.orgUserRepo.findOne({ where: { organizationId: workspace.organizationId, userId }});
    if (!membership || membership.role !== 'OWNER' && membership.role !== 'ADMIN') {
       throw new ForbiddenException('Only owners and admins can manage workspaces.');
    }
    
    Object.assign(workspace, data);
    return this.workspaceRepository.save(workspace);
  }

  async remove(id: string, userId: string): Promise<void> {
    const workspace = await this.findOne(id, userId);
    
    const membership = await this.orgUserRepo.findOne({ where: { organizationId: workspace.organizationId, userId }});
    if (!membership || membership.role !== 'OWNER') {
      throw new ForbiddenException('Only owners can delete workspaces');
    }
    
    await this.workspaceRepository.remove(workspace);
  }
}
