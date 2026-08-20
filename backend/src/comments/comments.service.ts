import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Comment } from './comment.entity';
import { ActivityService } from '../activity/activity.service';

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment)
    private commentRepo: Repository<Comment>,
    private activityService: ActivityService,
  ) {}

  async findByRequest(requestId: string): Promise<Comment[]> {
    return this.commentRepo.find({
      where: { requestId },
      order: { createdAt: 'ASC' },
    });
  }

  async create(data: {
    userId: string;
    userName: string;
    userEmail: string;
    requestId: string;
    collectionId: string;
    content: string;
  }): Promise<Comment> {
    const comment = this.commentRepo.create(data);
    const saved = await this.commentRepo.save(comment);

    // Log activity
    await this.activityService.log({
      userId: data.userId,
      userName: data.userName,
      userEmail: data.userEmail,
      action: 'COMMENTED',
      entityType: 'COMMENT',
      entityId: saved.id,
      entityName: data.content.substring(0, 80),
      collectionId: data.collectionId,
      metadata: { requestId: data.requestId },
    });

    return saved;
  }

  async remove(id: string, userId: string): Promise<void> {
    const comment = await this.commentRepo.findOne({ where: { id } });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.userId !== userId)
      throw new ForbiddenException("Cannot delete another user's comment");
    await this.commentRepo.remove(comment);
  }

  async countByRequest(requestId: string): Promise<number> {
    return this.commentRepo.count({ where: { requestId } });
  }
}
