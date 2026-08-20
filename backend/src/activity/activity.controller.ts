import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ActivityService } from './activity.service';
import { AuthGuard } from '../auth/auth.guard';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Collection } from '../collections/collection.entity';

@UseGuards(AuthGuard)
@Controller('activity')
export class ActivityController {
  constructor(
    private readonly activityService: ActivityService,
    @InjectRepository(Collection)
    private collectionRepo: Repository<Collection>,
  ) {}

  @Get('collection/:collectionId')
  async findByCollection(
    @Param('collectionId') collectionId: string,
    @Query('take') take?: string,
  ) {
    return this.activityService.findByCollection(
      collectionId,
      take ? parseInt(take) : 50,
    );
  }

  @Get('recent')
  async findRecent(@Request() req: any) {
    const userId = req.user.sub;
    // Get all collections the user owns or has access to
    const owned = await this.collectionRepo.find({
      where: { ownerId: userId },
      select: ['id'],
    });
    const shared = await this.collectionRepo
      .createQueryBuilder('c')
      .innerJoin('c.shares', 's', 's.userId = :uid', { uid: userId })
      .select('c.id')
      .getMany();

    const allIds = [...owned.map((c) => c.id), ...shared.map((c) => c.id)];
    return this.activityService.findRecent(userId, allIds);
  }
}
