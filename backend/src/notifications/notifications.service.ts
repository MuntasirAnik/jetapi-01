import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './notification.entity';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
  ) {}

  async create(userId: string, message: string): Promise<Notification> {
    const notification = this.notificationRepository.create({ userId, message });
    return this.notificationRepository.save(notification);
  }

  async findAllForUser(userId: string): Promise<Notification[]> {
    return this.notificationRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async markAsRead(id: string, userId: string): Promise<Notification | null> {
    const notification = await this.notificationRepository.findOne({ where: { id, userId } });
    if (notification) {
      notification.isRead = true;
      return this.notificationRepository.save(notification);
    }
    return null;
  }

  async markAllAsRead(userId: string): Promise<void> {
    await this.notificationRepository.update({ userId, isRead: false }, { isRead: true });
  }
}
