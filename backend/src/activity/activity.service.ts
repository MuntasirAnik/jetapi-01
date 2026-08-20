import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Activity } from './activity.entity';

@Injectable()
export class ActivityService {
  constructor(
    @InjectRepository(Activity)
    private activityRepo: Repository<Activity>,
  ) {}

  async log(data: {
    userId: string;
    userName: string;
    userEmail: string;
    action: string;
    entityType: string;
    entityId?: string;
    entityName?: string;
    collectionId?: string;
    metadata?: any;
  }): Promise<Activity> {
    const activity = this.activityRepo.create(data);
    return this.activityRepo.save(activity);
  }

  async findByCollection(collectionId: string, take = 50): Promise<Activity[]> {
    return this.activityRepo.find({
      where: { collectionId },
      order: { createdAt: 'DESC' },
      take,
    });
  }

  async findRecent(
    userId: string,
    collectionIds: string[],
    take = 30,
  ): Promise<Activity[]> {
    if (!collectionIds.length) return [];

    const qb = this.activityRepo
      .createQueryBuilder('activity')
      .where('activity.collectionId IN (:...ids)', { ids: collectionIds })
      .orderBy('activity.createdAt', 'DESC')
      .take(take);

    return qb.getMany();
  }
}
