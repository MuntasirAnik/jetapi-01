import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Collection } from './collection.entity';
import { UsersService } from '../users/users.service';
import { Workspace } from '../workspaces/workspace.entity';
import { OrganizationUser } from '../organizations/organization-user.entity';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class CollectionsService {
  constructor(
    @InjectRepository(Collection)
    private readonly collectionRepository: Repository<Collection>,
    private readonly usersService: UsersService,
    @InjectRepository(Workspace)
    private readonly workspaceRepository: Repository<Workspace>,
    @InjectRepository(OrganizationUser)
    private readonly orgUserRepo: Repository<OrganizationUser>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(data: Partial<Collection>, userId: string): Promise<Collection> {
    const collection = this.collectionRepository.create({ ...data, ownerId: userId });
    return this.collectionRepository.save(collection);
  }

  async getCollectionsByWorkspace(workspaceId: string, userId: string): Promise<Collection[]> {
    const workspace = await this.workspaceRepository.findOne({ where: { id: workspaceId } });
    if (!workspace) throw new NotFoundException('Workspace not found');
    const membership = await this.orgUserRepo.findOne({ where: { organizationId: workspace.organizationId, userId }});
    if (!membership) throw new ForbiddenException('Access denied');

    return this.collectionRepository.createQueryBuilder('collection')
      .leftJoinAndSelect('collection.sharedUsers', 'sharedUsers')
      .leftJoinAndSelect('collection.owner', 'owner')
      .loadRelationCountAndMap('collection.requestsCount', 'collection.requests')
      .where('collection.workspaceId = :workspaceId', { workspaceId })
      .getMany();
  }

  async findAll(userId: string, includeRequests: boolean = false): Promise<Collection[]> {
    // Phase 1: Rapid scalar extraction to avoid N:N parsing filter bugs in TypeORM find()
    const ownedCols = await this.collectionRepository.find({ where: { ownerId: userId }, select: ['id'] });
    const sharedCols = await this.collectionRepository.createQueryBuilder('collection')
      .innerJoin('collection.sharedUsers', 'su')
      .where('su.id = :userId', { userId })
      .select('collection.id')
      .getMany();

    const allowedIds = [...new Set([...ownedCols.map(c => c.id), ...sharedCols.map(c => c.id)])];
    if (allowedIds.length === 0) return [];

    // Phase 2: Safe bounded explicit Object mapping without relational conditionals
    // Phase 2: Fetch Collections without cartesian joins
    const collections = await this.collectionRepository.createQueryBuilder('collection')
      .leftJoinAndSelect('collection.sharedUsers', 'sharedUsers')
      .leftJoinAndSelect('collection.owner', 'owner')
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

    return collections;
  }

  async findOne(id: string, userId: string): Promise<{ collection: Collection, membership: OrganizationUser }> {
    const collection = await this.collectionRepository.findOne({
      where: { id },
      relationLoadStrategy: 'query',
      relations: ['requests', 'sharedUsers', 'workspace'],
    });

    if (!collection) throw new NotFoundException('Collection not found');
    const workspace = await this.workspaceRepository.findOne({ where: { id: collection.workspace.id } });
    if (!workspace) throw new NotFoundException('Workspace not found');
    const membership = await this.orgUserRepo.findOne({ where: { organizationId: workspace.organizationId, userId }});
    if (!membership) throw new ForbiddenException('Access denied');

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
    if (membership.role !== 'ADMIN' && membership.role !== 'OWNER' && !isOwner) {
      throw new ForbiddenException('Only Admins or the Owner can delete this collection');
    }
    await this.collectionRepository.remove(collection);
  }

  async share(id: string, email: string, userId: string): Promise<Collection> {
    const { collection, membership } = await this.findOne(id, userId);
    const isOwner = collection.ownerId === userId;
    if (membership.role !== 'ADMIN' && membership.role !== 'OWNER' && !isOwner) {
      throw new ForbiddenException('Only Admins or the Owner can share this collection');
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
    
    collection.sharedUsers = collection.sharedUsers || [];
    if (!collection.sharedUsers.some(u => u.id === userToShareWith.id)) {
      collection.sharedUsers.push(userToShareWith);
      await this.collectionRepository.save(collection);
      
      // Dispatch notification
      await this.notificationsService.create(
        userToShareWith.id,
        `You have been given access to collection '${collection.name}'`
      );
    }
    return collection;
  }

  async unshare(id: string, userToUnshareId: string, userId: string): Promise<Collection> {
    const { collection, membership } = await this.findOne(id, userId);
    const isOwner = collection.ownerId === userId;
    if (membership.role !== 'ADMIN' && membership.role !== 'OWNER' && !isOwner) {
      throw new ForbiddenException('Only Admins or the Owner can manage access to this collection');
    }
    
    if (collection.sharedUsers) {
      const userExists = collection.sharedUsers.some(u => u.id === userToUnshareId);
      collection.sharedUsers = collection.sharedUsers.filter(u => u.id !== userToUnshareId);
      await this.collectionRepository.save(collection);
      
      if (userExists) {
        // Dispatch notification
        await this.notificationsService.create(
          userToUnshareId,
          `Your access to collection '${collection.name}' has been revoked`
        );
      }
    }
    return collection;
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
        let parsedBody = {};
        let parsedUrl = req.url || '';
        try { if (req.headers) parsedHeaders = JSON.parse(req.headers); } catch(e){}
        try { if (req.body) parsedBody = JSON.parse(req.body); } catch(e){}

        const postmanReq = {
          name: req.name,
          request: {
            method: req.method,
            url: { raw: parsedUrl },
            header: parsedHeaders,
            body: Object.keys(parsedBody).length > 0 ? { mode: 'raw', raw: typeof parsedBody === 'string' ? parsedBody : JSON.stringify(parsedBody) } : undefined
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
            body: item.request.body?.raw || '',
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
