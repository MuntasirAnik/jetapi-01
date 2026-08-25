import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { Workspace } from '../workspaces/workspace.entity';
import { Collection } from '../collections/collection.entity';
import { RequestItem } from '../requests/request.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Workspace)
    private readonly workspaceRepository: Repository<Workspace>,
    @InjectRepository(Collection)
    private readonly collectionRepository: Repository<Collection>,
    @InjectRepository(RequestItem)
    private readonly requestRepository: Repository<RequestItem>,
  ) {}

  async findOneByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOneBy({ email });
  }

  async findOneById(id: string): Promise<User | null> {
    return this.userRepository.findOneBy({ id });
  }

  async findOneWithAvatar(id: string): Promise<User | null> {
    return this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.avatarData')
      .where('user.id = :id', { id })
      .getOne();
  }

  async create(user: Partial<User>): Promise<User> {
    const newUser = this.userRepository.create(user);
    return this.userRepository.save(user);
  }

  async findByResetToken(token: string): Promise<User | null> {
    return this.userRepository.findOneBy({ resetToken: token });
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | null> {
    await this.userRepository.update(id, data);
    return this.findOneById(id);
  }

  async updateAvatar(
    id: string,
    avatarData: Buffer,
    avatarMimeType: string,
  ): Promise<User | null> {
    // Compress and resize avatar to max 256x256, convert to WebP
    let compressedData = avatarData;
    let finalMimeType = avatarMimeType;
    try {
      const sharp = require('sharp');
      compressedData = await sharp(avatarData)
        .resize(256, 256, { fit: 'cover', withoutEnlargement: false })
        .webp({ quality: 80 })
        .toBuffer();
      finalMimeType = 'image/webp';
    } catch (err) {
      // If sharp fails, store the original
      console.warn(
        '[Avatar] sharp compression failed, storing original:',
        err?.message,
      );
    }
    await this.userRepository.update(id, {
      avatarData: compressedData,
      avatarMimeType: finalMimeType,
    });
    return this.findOneById(id);
  }

  async getAllUsers(): Promise<User[]> {
    return this.userRepository.find({
      select: ['id', 'email', 'name', 'avatarMimeType'],
    });
  }

  async getUserStats(userId: string) {
    const [collections, requests, workspaces, sharedCollections] =
      await Promise.all([
        this.collectionRepository.count({ where: { ownerId: userId } }),
        this.requestRepository.count({ where: { ownerId: userId } }),
        this.workspaceRepository
          .createQueryBuilder('ws')
          .innerJoin(
            'organization',
            'org',
            'org.id::text = ws."organizationId"::text',
          )
          .where('org."ownerId" = :userId', { userId })
          .getCount(),
        this.collectionRepository
          .createQueryBuilder('col')
          .innerJoin(
            'collection_shared_users',
            'csu',
            'csu."collectionId" = col.id',
          )
          .where('csu."userId" = :userId', { userId })
          .getCount(),
      ]);
    return { workspaces, collections, requests, sharedCollections };
  }
}
