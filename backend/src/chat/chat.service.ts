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

  async deleteMessage(messageId: string, senderId: string): Promise<boolean> {
    const result = await this.messageRepo.delete({ id: messageId, senderId });
    return (result.affected || 0) > 0;
  }
}
