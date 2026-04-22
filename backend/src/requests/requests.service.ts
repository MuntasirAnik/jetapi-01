import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RequestItem } from './request.entity';

@Injectable()
export class RequestsService {
  constructor(
    @InjectRepository(RequestItem)
    private readonly requestRepository: Repository<RequestItem>,
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
    return this.requestRepository.save(request);
  }

  async findAll(userId: string): Promise<RequestItem[]> {
    return this.requestRepository.find({ 
      where: [
        { ownerId: userId },
        { ownerId: null as any }
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
    return this.requestRepository.save(request);
  }

  async remove(id: string, userId: string): Promise<void> {
    const request = await this.findOne(id, userId);
    await this.requestRepository.remove(request);
  }
}
