import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not } from 'typeorm';
import { RequestItem } from './request.entity';
import { ActivityService } from '../activity/activity.service';

@Injectable()
export class RequestsService {
  constructor(
    @InjectRepository(RequestItem)
    private readonly requestRepository: Repository<RequestItem>,
    private readonly activityService: ActivityService,
  ) {}

  async create(data: Partial<RequestItem>, userId: string): Promise<RequestItem> {
    if (data.name && data.collectionId) {
      const existing = await this.requestRepository.findOne({
        where: { name: data.name, collectionId: data.collectionId }
      });
      if (existing) {
        throw new BadRequestException('An endpoint with this name already exists in this collection.');
      }
    }
    const request = this.requestRepository.create({ ...data, ownerId: userId });
    const saved = await this.requestRepository.save(request);

    // Log activity
    try {
      const user = await this.requestRepository.manager.getRepository('User').findOne({ where: { id: userId } });
      await this.activityService.log({
        userId,
        userName: user?.name || user?.email?.split('@')[0] || 'User',
        userEmail: user?.email || '',
        action: 'CREATED',
        entityType: 'REQUEST',
        entityId: saved.id,
        entityName: saved.name,
        collectionId: saved.collectionId,
      });
    } catch {}

    return saved;
  }

  async findAll(userId: string): Promise<RequestItem[]> {
    return this.requestRepository.find({ 
      where: [
        { ownerId: userId },
        { ownerId: IsNull() as any }
      ] 
    });
  }

  async findOne(id: string, userId: string): Promise<RequestItem> {
    const request = await this.requestRepository.findOne({ 
      where: { id },
      relations: ['collection', 'collection.workspace', 'collection.sharedUsers']
    });
    
    if (!request) throw new NotFoundException('Request not found');

    if (request.ownerId === userId || request.ownerId === null) return request;

    let hasAccess = false;
    if (request.collection) {
      if (request.collection.ownerId === userId) hasAccess = true;
      if (request.collection.sharedUsers?.some(su => su.id === userId)) hasAccess = true;
      
      if (!hasAccess && request.collection.workspace) {
         const membership = await this.requestRepository.manager.getRepository('OrganizationUser').findOne({
            where: { organizationId: request.collection.workspace.organizationId, userId }
         });
         if (membership) hasAccess = true;
      }
    }

    if (!hasAccess) {
      throw new ForbiddenException('Access denied to this request');
    }
    
    return request;
  }

  async update(id: string, data: Partial<RequestItem>, userId: string): Promise<RequestItem> {
    const request = await this.findOne(id, userId);

    if (data.name && data.name !== request.name) {
      const existing = await this.requestRepository.findOne({
        where: { name: data.name, collectionId: request.collectionId }
      });
      if (existing) {
        throw new BadRequestException('An endpoint with this name already exists in this collection.');
      }
    }

    Object.assign(request, data);
    const saved = await this.requestRepository.save(request);

    // Log activity
    try {
      const user = await this.requestRepository.manager.getRepository('User').findOne({ where: { id: userId } });
      await this.activityService.log({
        userId,
        userName: user?.name || user?.email?.split('@')[0] || 'User',
        userEmail: user?.email || '',
        action: 'UPDATED',
        entityType: 'REQUEST',
        entityId: saved.id,
        entityName: saved.name,
        collectionId: saved.collectionId,
      });
    } catch {}

    return saved;
  }

  // Soft-delete: sets deletedAt timestamp and records who deleted it
  async remove(id: string, userId: string): Promise<void> {
    const request = await this.findOne(id, userId);
    // Look up deleter name
    try {
      const user = await this.requestRepository.manager.getRepository('User').findOne({ where: { id: userId } });
      request.deletedByName = user?.name || user?.email || 'Unknown';
    } catch {
      request.deletedByName = 'Unknown';
    }
    await this.requestRepository.save(request);
    await this.requestRepository.softRemove(request);

    // Log activity
    try {
      await this.activityService.log({
        userId,
        userName: request.deletedByName || 'User',
        userEmail: '',
        action: 'DELETED',
        entityType: 'REQUEST',
        entityId: request.id,
        entityName: request.name,
        collectionId: request.collectionId,
      });
    } catch {}
  }

  // List all soft-deleted requests for the user
  async findTrash(userId: string): Promise<RequestItem[]> {
    return this.requestRepository.createQueryBuilder('req')
      .withDeleted()
      .leftJoinAndSelect('req.collection', 'collection')
      .where('req.deletedAt IS NOT NULL')
      .andWhere('req.ownerId = :userId', { userId })
      .orderBy('req.deletedAt', 'DESC')
      .getMany();
  }

  // Restore a soft-deleted request
  async restore(id: string, userId: string): Promise<RequestItem> {
    const request = await this.requestRepository.findOne({
      withDeleted: true,
      where: { id },
    });
    if (!request) throw new NotFoundException('Request not found in trash');
    if (request.ownerId !== userId) throw new ForbiddenException('Access denied');
    if (!request.deletedAt) throw new BadRequestException('Request is not in trash');

    await this.requestRepository.recover(request);
    return this.requestRepository.findOne({ where: { id } }) as Promise<RequestItem>;
  }

  // Permanently delete a trashed request
  async permanentDelete(id: string, userId: string): Promise<void> {
    const request = await this.requestRepository.findOne({
      withDeleted: true,
      where: { id },
    });
    if (!request) throw new NotFoundException('Request not found');
    if (request.ownerId !== userId) throw new ForbiddenException('Access denied');
    
    await this.requestRepository.remove(request);
  }
}
