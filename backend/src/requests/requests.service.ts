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

  /** Get the user's effective role on a collection */
  private async getShareRole(collectionId: string, userId: string): Promise<'owner' | 'admin' | 'editor' | 'viewer' | null> {
    const collection = await this.requestRepository.manager.getRepository('Collection').findOne({
      where: { id: collectionId },
      relations: ['shares', 'workspace'],
    });
    if (!collection) return null;
    if (collection.ownerId === userId) return 'owner';

    // Check explicit share role first — it takes priority
    const share = (collection as any).shares?.find((s: any) => s.userId === userId);
    if (share) return share.role;

    // Fall back to org membership
    if (collection.workspace) {
      const membership = await this.requestRepository.manager.getRepository('OrganizationUser').findOne({
        where: { organizationId: collection.workspace.organizationId, userId }
      });
      if (membership && (membership.role === 'OWNER' || membership.role === 'ADMIN')) return 'owner';
      if (membership) return 'editor'; // org members without explicit share default to editor
    }

    return null;
  }

  /** Check if a role can edit (create/update/delete) */
  private canEdit(role: string | null): boolean {
    return role === 'owner' || role === 'admin' || role === 'editor';
  }

  async create(data: Partial<RequestItem>, userId: string): Promise<RequestItem> {
    // Enforce role: viewers cannot create endpoints
    if (data.collectionId) {
      const role = await this.getShareRole(data.collectionId, userId);
      if (role && !this.canEdit(role)) {
        throw new ForbiddenException('You have view-only access to this collection. You cannot add endpoints.');
      }
    }

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
      relations: ['collection', 'collection.workspace', 'collection.shares']
    });
    
    if (!request) throw new NotFoundException('Request not found');

    if (request.ownerId === userId || request.ownerId === null) return request;

    let hasAccess = false;
    if (request.collection) {
      if (request.collection.ownerId === userId) hasAccess = true;
      if ((request.collection as any).shares?.some((s: any) => s.userId === userId)) hasAccess = true;
      
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

    // Enforce role: viewers cannot edit endpoints
    if (request.collectionId) {
      const role = await this.getShareRole(request.collectionId, userId);
      if (role && !this.canEdit(role)) {
        throw new ForbiddenException('You have view-only access to this collection. You cannot edit endpoints.');
      }
    }

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

    // Enforce role: viewers cannot delete endpoints
    if (request.collectionId) {
      const role = await this.getShareRole(request.collectionId, userId);
      if (role && !this.canEdit(role)) {
        throw new ForbiddenException('You have view-only access to this collection. You cannot delete endpoints.');
      }
    }

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

  // Move a single request to a different folder (within same collection)
  async moveRequest(id: string, newFolder: string | null, userId: string): Promise<RequestItem> {
    const request = await this.findOne(id, userId);

    if (request.collectionId) {
      const role = await this.getShareRole(request.collectionId, userId);
      if (role && !this.canEdit(role)) {
        throw new ForbiddenException('You have view-only access to this collection.');
      }
    }

    request.folder = newFolder || ('' as any);
    const saved = await this.requestRepository.save(request);

    try {
      const user = await this.requestRepository.manager.getRepository('User').findOne({ where: { id: userId } });
      await this.activityService.log({
        userId,
        userName: user?.name || user?.email?.split('@')[0] || 'User',
        userEmail: user?.email || '',
        action: 'UPDATED',
        entityType: 'REQUEST',
        entityId: saved.id,
        entityName: `Moved "${saved.name}" to ${newFolder || 'root'}`,
        collectionId: saved.collectionId,
      });
    } catch {}

    return saved;
  }

  // Move an entire folder (and all its children) to a new parent folder
  async moveFolder(
    collectionId: string,
    oldPath: string,
    newPath: string,
    userId: string,
  ): Promise<{ updated: number }> {
    // Verify permission
    const role = await this.getShareRole(collectionId, userId);
    if (role && !this.canEdit(role)) {
      throw new ForbiddenException('You have view-only access to this collection.');
    }

    // Prevent moving a folder into itself
    if (newPath === oldPath || newPath.startsWith(oldPath + '/')) {
      throw new BadRequestException('Cannot move a folder into itself.');
    }

    // Find all requests in this folder and its subfolders
    const requests = await this.requestRepository
      .createQueryBuilder('req')
      .where('req.collectionId = :collectionId', { collectionId })
      .andWhere('(req.folder = :exact OR req.folder LIKE :prefix)', {
        exact: oldPath,
        prefix: `${oldPath}/%`,
      })
      .getMany();

    for (const req of requests) {
      if (req.folder === oldPath) {
        req.folder = newPath;
      } else {
        // Replace prefix: "oldPath/sub" → "newPath/sub"
        req.folder = newPath + req.folder.substring(oldPath.length);
      }
    }

    if (requests.length > 0) {
      await this.requestRepository.save(requests);
    }

    return { updated: requests.length };
  }
}
