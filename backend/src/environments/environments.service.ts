import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Environment } from './environment.entity';

@Injectable()
export class EnvironmentsService {
  constructor(
    @InjectRepository(Environment)
    private readonly environmentRepository: Repository<Environment>,
  ) {}

  async create(data: Partial<Environment>, userId: string): Promise<Environment> {
    const environment = this.environmentRepository.create({ ...data, ownerId: userId });
    return this.environmentRepository.save(environment);
  }

  private async canAccessWorkspace(workspaceId: string, userId: string): Promise<boolean> {
    if (!workspaceId) return false;
    
    const workspace = await this.environmentRepository.manager.getRepository('Workspace').findOne({ where: { id: workspaceId } });
    if (!workspace) return false;

    // Check organization membership
    const membership = await this.environmentRepository.manager.getRepository('OrganizationUser').findOne({ 
      where: { organizationId: workspace.organizationId, userId } 
    });
    
    if (membership) return true;

    // Check shared collections
    const workspaceCollections = await this.environmentRepository.manager.getRepository('Collection').find({
      where: { workspaceId },
      relations: ['shares']
    });

    const hasSharedCollection = workspaceCollections.some((c: any) => 
      c.shares?.some((s: any) => s.userId === userId)
    );

    return hasSharedCollection;
  }

  async findAllByWorkspace(workspaceId: string, userId: string): Promise<Environment[]> {
    const hasAccess = await this.canAccessWorkspace(workspaceId, userId);
    if (!hasAccess) return [];

    return this.environmentRepository.find({ 
      where: { workspaceId }
    });
  }

  async findOne(id: string, userId: string): Promise<Environment> {
    const environment = await this.environmentRepository.findOne({ where: { id } });
    if (!environment) throw new NotFoundException('Environment not found');

    const hasAccess = await this.canAccessWorkspace(environment.workspaceId, userId);
    if (!hasAccess) throw new NotFoundException('Environment not found or access denied');

    return environment;
  }

  async update(id: string, data: Partial<Environment>, userId: string): Promise<Environment> {
    const environment = await this.findOne(id, userId);
    Object.assign(environment, data);
    return this.environmentRepository.save(environment);
  }

  async remove(id: string, userId: string): Promise<void> {
    const environment = await this.findOne(id, userId);
    
    if (environment.ownerId && environment.ownerId !== userId) {
      const workspace = await this.environmentRepository.manager.getRepository('Workspace').findOne({ where: { id: environment.workspaceId } });
      if (workspace) {
        const membership = await this.environmentRepository.manager.getRepository('OrganizationUser').findOne({ 
          where: { organizationId: workspace.organizationId, userId } 
        });
        if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
          throw new ForbiddenException('Only workspace admins or the creator can delete this environment');
        }
      }
    }

    await this.environmentRepository.remove(environment);
  }
}
