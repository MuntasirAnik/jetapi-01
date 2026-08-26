import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Message } from './message.entity';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
  ) {}

  private sanitizeMessage(message: Message): Message {
    if (!message) return message;
    if (message.sender) {
      const { passwordHash, avatarData, resetToken, resetTokenExpiry, ...cleanSender } = message.sender as any;
      message.sender = cleanSender as any;
    }
    return message;
  }

  async createMessage(
    senderId: string,
    content: string,
    codeSnippet?: string,
    workspaceId?: string,
    organizationId?: string,
    recipientId?: string,
  ): Promise<Message> {
    const message = this.messageRepo.create({
      senderId,
      content,
      codeSnippet,
      workspaceId,
      organizationId,
      recipientId,
    });
    const saved = await this.messageRepo.save(message);
    
    const result = await this.messageRepo.findOne({
      where: { id: saved.id },
      relations: ['sender'],
    });
    if (!result) {
      throw new Error('Message not found after save');
    }
    return this.sanitizeMessage(result);
  }

  async getWorkspaceMessages(workspaceId: string, limit = 50): Promise<Message[]> {
    const messages = await this.messageRepo.find({
      where: { workspaceId },
      relations: ['sender'],
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return messages.map((m) => this.sanitizeMessage(m)).reverse();
  }

  async getTeamMessages(organizationId: string, limit = 50): Promise<Message[]> {
    const messages = await this.messageRepo.find({
      where: {
        organizationId,
        workspaceId: IsNull(),
        recipientId: IsNull(),
      },
      relations: ['sender'],
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return messages.map((m) => this.sanitizeMessage(m)).reverse();
  }

  async getDmMessages(userA: string, userB: string, limit = 50): Promise<Message[]> {
    const messages = await this.messageRepo.find({
      where: [
        { senderId: userA, recipientId: userB },
        { senderId: userB, recipientId: userA },
      ],
      relations: ['sender'],
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return messages.map((m) => this.sanitizeMessage(m)).reverse();
  }

  async editMessage(messageId: string, senderId: string, content: string): Promise<Message> {
    const message = await this.messageRepo.findOne({
      where: { id: messageId, senderId },
      relations: ['sender'],
    });
    if (!message) {
      throw new Error('Message not found or unauthorized');
    }
    message.content = content;
    if (message.codeSnippet) {
      message.codeSnippet = content;
    }
    const saved = await this.messageRepo.save(message);
    return this.sanitizeMessage(saved);
  }

  async toggleReaction(messageId: string, userId: string, emoji: string): Promise<Message> {
    const message = await this.messageRepo.findOne({
      where: { id: messageId },
      relations: ['sender'],
    });
    if (!message) {
      throw new Error('Message not found');
    }
    const reactions: Record<string, string[]> = message.reactions ? { ...message.reactions } : {};
    let users = Array.isArray(reactions[emoji]) ? [...reactions[emoji]] : [];
    if (users.includes(userId)) {
      users = users.filter((id) => id !== userId);
      if (users.length === 0) {
        delete reactions[emoji];
      } else {
        reactions[emoji] = users;
      }
    } else {
      users.push(userId);
      reactions[emoji] = users;
    }
    message.reactions = reactions;
    const saved = await this.messageRepo.save(message);
    return this.sanitizeMessage(saved);
  }

  async deleteMessage(messageId: string, senderId: string): Promise<boolean> {
    const result = await this.messageRepo.delete({ id: messageId, senderId });
    return (result.affected || 0) > 0;
  }

  async markMessagesAsSeen(
    messageIds: string[],
    userId: string,
    userName?: string,
    userEmail?: string,
  ): Promise<{ id: string; seenBy: Record<string, { seenAt: string; name?: string; email?: string }> }[]> {
    if (!messageIds || messageIds.length === 0) return [];
    const messages = await this.messageRepo.find({
      where: messageIds.map((id) => ({ id })),
    });

    const updated: { id: string; seenBy: Record<string, { seenAt: string; name?: string; email?: string }> }[] = [];
    const now = new Date().toISOString();

    for (const msg of messages) {
      if (msg.senderId === userId) continue;
      const seenBy = msg.seenBy ? { ...msg.seenBy } : {};
      if (!seenBy[userId]) {
        seenBy[userId] = {
          seenAt: now,
          name: userName || 'Unknown',
          email: userEmail,
        };
        msg.seenBy = seenBy;
        await this.messageRepo.save(msg);
        updated.push({ id: msg.id, seenBy: msg.seenBy });
      }
    }

    return updated;
  }

  async markRoomAsSeen(
    roomType: 'team' | 'workspace' | 'dm',
    targetId: string,
    userId: string,
    userName?: string,
    userEmail?: string,
  ): Promise<{ id: string; seenBy: Record<string, { seenAt: string; name?: string; email?: string }> }[]> {
    let whereCondition: any;
    if (roomType === 'team') {
      whereCondition = { organizationId: targetId, workspaceId: IsNull(), recipientId: IsNull() };
    } else if (roomType === 'workspace') {
      whereCondition = { workspaceId: targetId };
    } else if (roomType === 'dm') {
      whereCondition = [
        { senderId: targetId, recipientId: userId },
      ];
    }

    if (!whereCondition) return [];

    const messages = await this.messageRepo.find({
      where: whereCondition,
      order: { createdAt: 'DESC' },
      take: 100,
    });

    const updated: { id: string; seenBy: Record<string, { seenAt: string; name?: string; email?: string }> }[] = [];
    const now = new Date().toISOString();

    for (const msg of messages) {
      if (msg.senderId === userId) continue;
      const seenBy = msg.seenBy ? { ...msg.seenBy } : {};
      if (!seenBy[userId]) {
        seenBy[userId] = {
          seenAt: now,
          name: userName || 'Unknown',
          email: userEmail,
        };
        msg.seenBy = seenBy;
        await this.messageRepo.save(msg);
        updated.push({ id: msg.id, seenBy: msg.seenBy });
      }
    }

    return updated;
  }
}
