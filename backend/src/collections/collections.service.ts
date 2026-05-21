import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Collection } from './collection.entity';
import { CollectionShare } from './collection-share.entity';
import { UsersService } from '../users/users.service';
import { Workspace } from '../workspaces/workspace.entity';
import { OrganizationUser } from '../organizations/organization-user.entity';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class CollectionsService {
  constructor(
    @InjectRepository(Collection)
    private readonly collectionRepository: Repository<Collection>,
    @InjectRepository(CollectionShare)
    private readonly shareRepository: Repository<CollectionShare>,
    private readonly usersService: UsersService,
    @InjectRepository(Workspace)
    private readonly workspaceRepository: Repository<Workspace>,
    @InjectRepository(OrganizationUser)
    private readonly orgUserRepo: Repository<OrganizationUser>,
    private readonly notificationsService: NotificationsService,
  ) {}

  /** Hydrate sharedUsers from shares relation for backward compat */
  private hydrateSharedUsers(collection: Collection): Collection {
    if (collection.shares) {
      collection.sharedUsers = collection.shares.map(s => {
        const { avatarData, passwordHash, resetToken, resetTokenExpiry, ...safeUser } = (s.user || {}) as any;
        return {
          ...safeUser,
          shareRole: s.role,
        };
      }) as any;
    }
    return collection;
  }

  async create(data: Partial<Collection>, userId: string): Promise<Collection> {
    const collection = this.collectionRepository.create({ ...data, ownerId: userId });
    return this.collectionRepository.save(collection);
  }

  async getCollectionsByWorkspace(workspaceId: string, userId: string): Promise<Collection[]> {
    const workspace = await this.workspaceRepository.findOne({ where: { id: workspaceId } });
    if (!workspace) throw new NotFoundException('Workspace not found');
    const membership = await this.orgUserRepo.findOne({ where: { organizationId: workspace.organizationId, userId }});
    if (!membership) throw new ForbiddenException('Access denied');

    const collections = await this.collectionRepository.createQueryBuilder('collection')
      .leftJoinAndSelect('collection.shares', 'shares')
      .leftJoin('shares.user', 'sharedUser')
      .addSelect(['sharedUser.id', 'sharedUser.email', 'sharedUser.name', 'sharedUser.avatarMimeType'])
      .leftJoin('collection.owner', 'owner')
      .addSelect(['owner.id', 'owner.email', 'owner.name', 'owner.avatarMimeType'])
      .loadRelationCountAndMap('collection.requestsCount', 'collection.requests')
      .where('collection.workspaceId = :workspaceId', { workspaceId })
      .getMany();

    return collections.map(c => this.hydrateSharedUsers(c));
  }

  async findAll(userId: string, includeRequests: boolean = false): Promise<Collection[]> {
    // Phase 1: Find IDs of owned + shared collections
    const ownedCols = await this.collectionRepository.find({ where: { ownerId: userId }, select: ['id'] });
    const sharedCols = await this.shareRepository.find({ where: { userId }, select: ['collectionId'] });

    const allowedIds = [...new Set([...ownedCols.map(c => c.id), ...sharedCols.map(c => c.collectionId)])];
    if (allowedIds.length === 0) return [];

    // Phase 2: Fetch collections with shares
    const collections = await this.collectionRepository.createQueryBuilder('collection')
      .leftJoinAndSelect('collection.shares', 'shares')
      .leftJoin('shares.user', 'sharedUser')
      .addSelect(['sharedUser.id', 'sharedUser.email', 'sharedUser.name', 'sharedUser.avatarMimeType'])
      .leftJoin('collection.owner', 'owner')
      .addSelect(['owner.id', 'owner.email', 'owner.name', 'owner.avatarMimeType'])
      .leftJoinAndSelect('collection.workspace', 'workspace')
      .loadRelationCountAndMap('collection.requestsCount', 'collection.requests')
      .where('collection.id IN (:...allowedIds)', { allowedIds })
      .getMany();

    if (includeRequests && collections.length > 0) {
      const collectionIds = collections.map(c => c.id);
      const requests = await this.collectionRepository.manager.getRepository('RequestItem')
        .createQueryBuilder('req')
        .where('req.collectionId IN (:...collectionIds)', { collectionIds })
        .getMany();
      
      collections.forEach(col => {
        col.requests = requests.filter((r: any) => r.collectionId === col.id) as any;
      });
    }

    return collections.map(c => this.hydrateSharedUsers(c));
  }

  async findOne(id: string, userId: string): Promise<{ collection: Collection, membership: OrganizationUser | null }> {
    const collection = await this.collectionRepository.findOne({
      where: { id },
      relationLoadStrategy: 'query',
      relations: ['requests', 'shares', 'shares.user', 'workspace'],
    });

    if (!collection) throw new NotFoundException('Collection not found');
    this.hydrateSharedUsers(collection);
    const workspace = await this.workspaceRepository.findOne({ where: { id: collection.workspace.id } });
    if (!workspace) throw new NotFoundException('Workspace not found');
    const membership = await this.orgUserRepo.findOne({ where: { organizationId: workspace.organizationId, userId }});
    
    // Allow access if user is an org member OR has a share on this collection
    const hasShare = collection.shares?.some(s => s.userId === userId);
    const isOwner = collection.ownerId === userId;
    if (!membership && !hasShare && !isOwner) {
      throw new ForbiddenException('Access denied');
    }

    return { collection, membership };
  }

  async update(id: string, data: Partial<Collection>, userId: string): Promise<Collection> {
    const { collection } = await this.findOne(id, userId);
    Object.assign(collection, data);
    return this.collectionRepository.save(collection);
  }

  async remove(id: string, userId: string): Promise<void> {
    const { collection, membership } = await this.findOne(id, userId);
    const isOwner = collection.ownerId === userId;
    if (membership?.role !== 'ADMIN' && membership?.role !== 'OWNER' && !isOwner) {
      throw new ForbiddenException('Only Admins or the Owner can delete this collection');
    }
    await this.collectionRepository.remove(collection);
  }

  async toggleActive(id: string, isActive: boolean, userId: string): Promise<Collection> {
    const { collection, membership } = await this.findOne(id, userId);
    if (!this.canManageSharing(collection, membership, userId)) {
      throw new ForbiddenException('Only Owners or Admins can enable/disable this collection');
    }
    collection.isActive = isActive;
    await this.collectionRepository.save(collection);
    const { collection: updated } = await this.findOne(id, userId);
    return updated;
  }

  /** Check if a user can manage sharing (is owner, org admin, or collection-level admin) */
  private canManageSharing(collection: Collection, membership: OrganizationUser | null, userId: string): boolean {
    const isOwner = collection.ownerId === userId;
    const isOrgAdmin = membership?.role === 'ADMIN' || membership?.role === 'OWNER';
    const shareRecord = collection.shares?.find(s => s.userId === userId);
    const isCollectionAdmin = shareRecord?.role === 'admin';
    return isOwner || isOrgAdmin || isCollectionAdmin;
  }

  async share(id: string, email: string, userId: string, role: 'viewer' | 'editor' | 'admin' = 'viewer'): Promise<Collection> {
    const { collection, membership } = await this.findOne(id, userId);
    
    if (!this.canManageSharing(collection, membership, userId)) {
      throw new ForbiddenException('You do not have permission to share this collection');
    }

    let userToShareWith = await this.usersService.findOneByEmail(email);
    if (!userToShareWith) {
      // Auto-create a stub user for external sharing
      userToShareWith = await this.usersService.create({ 
        email, 
        name: email.split('@')[0],
        passwordHash: 'external-invite-no-password' 
      });
    }
    
    // Check if share already exists
    const existing = await this.shareRepository.findOne({ 
      where: { collectionId: id, userId: userToShareWith.id } 
    });
    
    if (existing) {
      // Update role if different
      if (existing.role !== role) {
        existing.role = role;
        await this.shareRepository.save(existing);
      }
    } else {
      const share = this.shareRepository.create({
        collectionId: id,
        userId: userToShareWith.id,
        role,
      });
      await this.shareRepository.save(share);
      
      // Dispatch notification
      await this.notificationsService.create(
        userToShareWith.id,
        `You have been given access to collection '${collection.name}'`
      );
    }

    // Re-fetch to return updated data
    const { collection: updated } = await this.findOne(id, userId);
    return updated;
  }

  async unshare(id: string, userToUnshareId: string, userId: string): Promise<Collection> {
    const { collection, membership } = await this.findOne(id, userId);
    
    if (!this.canManageSharing(collection, membership, userId)) {
      throw new ForbiddenException('You do not have permission to manage access to this collection');
    }
    
    const shareRecord = await this.shareRepository.findOne({
      where: { collectionId: id, userId: userToUnshareId }
    });

    if (shareRecord) {
      await this.shareRepository.remove(shareRecord);
      
      // Dispatch notification
      await this.notificationsService.create(
        userToUnshareId,
        `Your access to collection '${collection.name}' has been revoked`
      );
    }

    const { collection: updated } = await this.findOne(id, userId);
    return updated;
  }

  async updateShareRole(id: string, targetUserId: string, newRole: 'viewer' | 'editor' | 'admin', userId: string): Promise<Collection> {
    const { collection, membership } = await this.findOne(id, userId);
    
    if (!this.canManageSharing(collection, membership, userId)) {
      throw new ForbiddenException('You do not have permission to change roles on this collection');
    }

    // Cannot change your own role
    if (targetUserId === userId) {
      throw new BadRequestException('You cannot change your own role');
    }

    // Cannot change owner's role
    if (targetUserId === collection.ownerId) {
      throw new BadRequestException('Cannot change the owner\'s role');
    }

    const shareRecord = await this.shareRepository.findOne({
      where: { collectionId: id, userId: targetUserId }
    });

    if (!shareRecord) {
      throw new NotFoundException('User is not shared on this collection');
    }

    shareRecord.role = newRole;
    await this.shareRepository.save(shareRecord);

    const { collection: updated } = await this.findOne(id, userId);
    return updated;
  }

  async export(id: string, userId: string): Promise<any> {
    const { collection } = await this.findOne(id, userId);
    const rootItems: any[] = [];
    const folderMap = new Map<string, any>();

    const getFolder = (folderPath: string) => {
      if (folderMap.has(folderPath)) return folderMap.get(folderPath);
      
      const parts = folderPath.split('/');
      let currentRoot = rootItems;
      let currentPath = '';

      for (const part of parts) {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        if (!folderMap.has(currentPath)) {
          const newFolder = { name: part, item: [] };
          folderMap.set(currentPath, newFolder);
          
          if (currentPath === part) {
            currentRoot.push(newFolder);
          } else {
            const parentPath = currentPath.substring(0, currentPath.lastIndexOf('/'));
            const parent = folderMap.get(parentPath);
            parent.item.push(newFolder);
          }
        }
        currentRoot = folderMap.get(currentPath).item;
      }
      return folderMap.get(folderPath);
    };

    if (collection.requests) {
      for (const req of collection.requests) {
        let parsedHeaders = [];
        let parsedBody: any = null;
        let parsedUrl = req.url || '';
        let parsedParams = [];
        try { if (req.headers) parsedHeaders = typeof req.headers === 'string' ? JSON.parse(req.headers) : req.headers; } catch(e){}
        try { if (req.body) parsedBody = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch(e){}
        try { if (req.params) parsedParams = typeof req.params === 'string' ? JSON.parse(req.params) : req.params; } catch(e){}

        // Convert internal body format to Postman export format
        let postmanBody: any = undefined;
        if (parsedBody && typeof parsedBody === 'object' && parsedBody.mode) {
          const mode = parsedBody.mode;
          if (mode === 'raw' && parsedBody.raw) {
            postmanBody = {
              mode: 'raw',
              raw: typeof parsedBody.raw === 'object' ? (parsedBody.raw.data || '') : parsedBody.raw,
              options: {
                raw: { language: parsedBody.raw?.language || 'json' }
              }
            };
          } else if (mode === 'formdata' && parsedBody.formdata) {
            postmanBody = {
              mode: 'formdata',
              formdata: (parsedBody.formdata || []).map((fd: any) => ({
                key: fd.key || '',
                value: fd.value || '',
                type: fd.type || 'text',
                description: fd.description || '',
                disabled: fd.enabled === false,
              }))
            };
          } else if (mode === 'urlencoded' && parsedBody.urlencoded) {
            postmanBody = {
              mode: 'urlencoded',
              urlencoded: (parsedBody.urlencoded || []).map((ue: any) => ({
                key: ue.key || '',
                value: ue.value || '',
                description: ue.description || '',
                disabled: ue.enabled === false,
              }))
            };
          } else if (mode === 'graphql' && parsedBody.graphql) {
            postmanBody = {
              mode: 'graphql',
              graphql: {
                query: parsedBody.graphql.query || '',
                variables: parsedBody.graphql.variables || '',
              }
            };
          } else if (mode !== 'none') {
            // Fallback: try to serialize as raw
            postmanBody = { mode: 'raw', raw: JSON.stringify(parsedBody) };
          }
        } else if (parsedBody && typeof parsedBody === 'string') {
          postmanBody = { mode: 'raw', raw: parsedBody };
        }

        // Build query params for Postman URL format
        const queryParams = (parsedParams || [])
          .filter((p: any) => p.key && p.enabled !== false)
          .map((p: any) => ({ key: p.key, value: p.value || '' }));

        const postmanReq = {
          name: req.name,
          request: {
            method: req.method,
            url: {
              raw: parsedUrl,
              ...(queryParams.length > 0 ? { query: queryParams } : {}),
            },
            header: (parsedHeaders || []).map((h: any) => ({ key: h.key, value: h.value, disabled: h.enabled === false })),
            body: postmanBody,
          }
        };

        if (req.folder) {
          const folderObj = getFolder(req.folder);
          folderObj.item.push(postmanReq);
        } else {
          rootItems.push(postmanReq);
        }
      }
    }

    return {
      info: {
        name: collection.name,
        description: collection.description,
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
      },
      item: rootItems
    };
  }

  async import(workspaceId: string, importData: any, userId: string): Promise<Collection> {
    const isPostmanFormat = !!importData?.info?.name && !!importData?.item;
    if (!importData || (!importData.name && !isPostmanFormat)) {
      throw new Error('Invalid collection format');
    }

    const collectionName = isPostmanFormat ? importData.info.name : importData.name;
    const collectionDesc = isPostmanFormat ? importData.info.description : importData.description;

    const parsePostmanItems = (items: any[], currentPath: string = ''): any[] => {
      let flatRequests: any[] = [];
      for (const item of items) {
        if (item.item) {
          const newPath = currentPath ? `${currentPath}/${item.name}` : item.name;
          flatRequests.push(...parsePostmanItems(item.item, newPath));
        } else if (item.request) {
          flatRequests.push({
            name: item.name || 'Unnamed Request',
            method: item.request.method || 'GET',
            url: typeof item.request.url === 'string' ? item.request.url : (item.request.url?.raw || ''),
            headers: item.request.header?.map((h: any) => ({ key: h.key, value: h.value })) || [],
            params: item.request.url?.query?.map((q: any) => ({ key: q.key, value: q.value })) || [],
            body: item.request.body ? JSON.stringify({
              mode: item.request.body.mode || (item.request.body.raw ? 'raw' : 'none'),
              raw: { language: item.request.body.options?.raw?.language || 'json', data: typeof item.request.body.raw === 'string' ? item.request.body.raw : '' },
              formdata: (item.request.body.formdata || []).map((fd: any) => ({
                key: fd.key || '',
                value: fd.type === 'file' ? (typeof fd.src === 'string' ? fd.src : (Array.isArray(fd.src) ? fd.src.join(', ') : '')) : (fd.value || ''),
                type: fd.type || 'text',
                description: fd.description || '',
                enabled: fd.disabled !== true
              })),
              urlencoded: (item.request.body.urlencoded || []).map((urlc: any) => ({
                key: urlc.key || '',
                value: urlc.value || '',
                description: urlc.description || '',
                enabled: urlc.disabled !== true
              })),
              graphql: item.request.body.graphql || { query: '', variables: '' }
            }) : '',
            folder: currentPath || null,
          });
        }
      }
      return flatRequests;
    };

    const requestsData = isPostmanFormat 
      ? parsePostmanItems(importData.item || [])
      : (importData.requests?.map((req: any) => ({
          name: req.name || 'Imported Request',
          method: req.method || 'GET',
          url: req.url || '',
          headers: req.headers,
          params: req.params,
          body: req.body,
          folder: req.folder || null,
        })) || []);

    const newCollection = this.collectionRepository.create({
      name: collectionName + ' (Imported)',
      description: collectionDesc,
      workspace: { id: workspaceId },
      ownerId: userId,
      requests: requestsData,
    });

    return this.collectionRepository.save(newCollection);
  }
}
