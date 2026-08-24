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
    return result;
  }

  async getWorkspaceMessages(workspaceId: string, limit = 50): Promise<Message[]> {
    const messages = await this.messageRepo.find({
      where: { workspaceId },
      relations: ['sender'],
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return messages.reverse();
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
    return messages.reverse();
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
    return messages.reverse();
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
    // If it was a code snippet, we don't necessarily modify codeSnippet flag, or we can also update it:
    if (message.codeSnippet) {
      message.codeSnippet = content;
    }
    return this.messageRepo.save(message);
  }

  async deleteMessage(messageId: string, senderId: string): Promise<boolean> {
    const result = await this.messageRepo.delete({ id: messageId, senderId });
    return (result.affected || 0) > 0;
  }
}
