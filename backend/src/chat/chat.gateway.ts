import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Workspace } from '../workspaces/workspace.entity';
import { OrganizationUser } from '../organizations/organization-user.entity';
import { SystemSetting } from '../admin/system-setting.entity';
import { ChatService } from './chat.service';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // Track online users in each room: roomName -> Set of userId
  private activeUsers = new Map<string, Set<string>>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly chatService: ChatService,
    @InjectRepository(Workspace)
    private readonly workspaceRepo: Repository<Workspace>,
    @InjectRepository(OrganizationUser)
    private readonly orgUserRepo: Repository<OrganizationUser>,
    @InjectRepository(SystemSetting)
    private readonly settingRepo: Repository<SystemSetting>,
  ) {}

  private async isMessagingEnabled(): Promise<boolean> {
    const setting = await this.settingRepo.findOne({
      where: { key: 'feature_flags' },
    });
    const flags: Record<string, boolean> = setting
      ? JSON.parse(setting.value)
      : {};
    return flags.allow_messaging !== undefined ? flags.allow_messaging : true;
  }

  async handleConnection(client: Socket) {
    try {
      // ── Admin Override Check ──
      const isEnabled = await this.isMessagingEnabled();
      if (!isEnabled) {
        client.disconnect();
        return;
      }

      const authHeader = client.handshake.headers.authorization;
      const token = authHeader?.split(' ')[1] || client.handshake.auth?.token;
      
      if (!token) {
        client.disconnect();
        return;
      }

      const payload = await this.jwtService.verifyAsync(token, {
        secret: 'YOUR_SECRET_KEY',
      });
      client.data.user = payload;
    } catch (err) {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const user = client.data.user;
    if (!user) return;

    // Clean up user from presence tracking across all rooms
    for (const [roomName, usersSet] of this.activeUsers.entries()) {
      if (usersSet.has(user.sub)) {
        usersSet.delete(user.sub);
        this.server.to(roomName).emit('presence_update', {
          room: roomName,
          onlineUsers: Array.from(usersSet),
        });
      }
    }
  }

  @SubscribeMessage('join_room')
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      type: 'team' | 'workspace' | 'dm';
      workspaceId?: string;
      organizationId?: string;
      recipientId?: string;
    },
  ) {
    const isEnabled = await this.isMessagingEnabled();
    if (!isEnabled) {
      client.emit('error', { message: 'Messaging is disabled by the administrator.' });
      return;
    }

    const user = client.data.user;
    if (!user || !data?.type) return;

    let roomName = '';
    let history: any[] = [];

    if (data.type === 'team' && data.organizationId) {
      const membership = await this.orgUserRepo.findOne({
        where: {
          organizationId: data.organizationId,
          userId: user.sub,
          status: 'ACCEPTED',
        },
      });
      if (!membership) return;

      roomName = `team_${data.organizationId}`;
      history = await this.chatService.getTeamMessages(data.organizationId);
    } else if (data.type === 'workspace' && data.workspaceId) {
      const workspace = await this.workspaceRepo.findOne({
        where: { id: data.workspaceId },
      });
      if (!workspace) return;

      const membership = await this.orgUserRepo.findOne({
        where: {
          organizationId: workspace.organizationId,
          userId: user.sub,
          status: 'ACCEPTED',
        },
      });
      if (!membership) return;

      roomName = `workspace_${data.workspaceId}`;
      history = await this.chatService.getWorkspaceMessages(data.workspaceId);
    } else if (data.type === 'dm' && data.recipientId && data.organizationId) {
      const senderMembership = await this.orgUserRepo.findOne({
        where: {
          organizationId: data.organizationId,
          userId: user.sub,
          status: 'ACCEPTED',
        },
      });
      const recipientMembership = await this.orgUserRepo.findOne({
        where: {
          organizationId: data.organizationId,
          userId: data.recipientId,
          status: 'ACCEPTED',
        },
      });
      if (!senderMembership || !recipientMembership) return;

      const ids = [user.sub, data.recipientId].sort();
      roomName = `dm_${ids[0]}_${ids[1]}`;
      history = await this.chatService.getDmMessages(user.sub, data.recipientId);
    }

    if (!roomName) return;

    client.join(roomName);

    let usersSet = this.activeUsers.get(roomName);
    if (!usersSet) {
      usersSet = new Set();
      this.activeUsers.set(roomName, usersSet);
    }
    usersSet.add(user.sub);

    client.emit('chat_history', history);

    this.server.to(roomName).emit('presence_update', {
      room: roomName,
      onlineUsers: Array.from(usersSet),
    });
  }

  @SubscribeMessage('leave_room')
  async handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomName: string },
  ) {
    const user = client.data.user;
    if (!user || !data?.roomName) return;

    client.leave(data.roomName);

    const usersSet = this.activeUsers.get(data.roomName);
    if (usersSet && usersSet.has(user.sub)) {
      usersSet.delete(user.sub);
      this.server.to(data.roomName).emit('presence_update', {
        room: data.roomName,
        onlineUsers: Array.from(usersSet),
      });
    }
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      type: 'team' | 'workspace' | 'dm';
      workspaceId?: string;
      organizationId?: string;
      recipientId?: string;
      content: string;
      codeSnippet?: string;
    },
  ) {
    const isEnabled = await this.isMessagingEnabled();
    if (!isEnabled) {
      client.emit('error', { message: 'Messaging is disabled by the administrator.' });
      return;
    }

    const user = client.data.user;
    if (!user || !data?.type || !data?.content) return;

    let roomName = '';
    if (data.type === 'team' && data.organizationId) {
      roomName = `team_${data.organizationId}`;
    } else if (data.type === 'workspace' && data.workspaceId) {
      roomName = `workspace_${data.workspaceId}`;
    } else if (data.type === 'dm' && data.recipientId) {
      const ids = [user.sub, data.recipientId].sort();
      roomName = `dm_${ids[0]}_${ids[1]}`;
    }

    if (!roomName) return;

    const isJoined = client.rooms.has(roomName);
    if (!isJoined) return;

    const savedMessage = await this.chatService.createMessage(
      user.sub,
      data.content,
      data.codeSnippet,
      data.workspaceId,
      data.organizationId,
      data.recipientId,
    );

    this.server.to(roomName).emit('new_message', savedMessage);

    // Also emit a notification for the dot indicator
    const notifyPayload = { room: roomName, sender: user.sub };
    if (data.type === 'team' && data.organizationId) {
      this.server.to(`notify_org_${data.organizationId}`).emit('notification', notifyPayload);
    } else if (data.type === 'workspace' && data.workspaceId) {
      this.server.to(`notify_workspace_${data.workspaceId}`).emit('notification', notifyPayload);
    } else if (data.type === 'dm' && data.recipientId) {
      this.server.to(`notify_user_${data.recipientId}`).emit('notification', notifyPayload);
    }
  }

  @SubscribeMessage('subscribe_notifications')
  async handleSubscribeNotifications(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { organizationId?: string; workspaceId?: string }
  ) {
    let user = client.data.user;
    if (!user) {
      try {
        const authHeader = client.handshake.headers.authorization;
        const token = authHeader?.split(' ')[1] || client.handshake.auth?.token;
        if (token) {
          user = await this.jwtService.verifyAsync(token, { secret: 'YOUR_SECRET_KEY' });
          client.data.user = user;
        }
      } catch (err) {}
    }
    if (!user) return;
    client.join(`notify_user_${user.sub}`);
    if (data.organizationId) client.join(`notify_org_${data.organizationId}`);
    if (data.workspaceId) client.join(`notify_workspace_${data.workspaceId}`);
  }

  @SubscribeMessage('edit_message')
  async handleEditMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { messageId: string; content: string; roomName: string },
  ) {
    const isEnabled = await this.isMessagingEnabled();
    if (!isEnabled) {
      client.emit('error', { message: 'Messaging is disabled by the administrator.' });
      return;
    }

    const user = client.data.user;
    if (!user || !data?.messageId || !data?.content || !data?.roomName) return;

    const isJoined = client.rooms.has(data.roomName);
    if (!isJoined) return;

    try {
      const updated = await this.chatService.editMessage(
        data.messageId,
        user.sub,
        data.content,
      );
      this.server.to(data.roomName).emit('message_edited', {
        messageId: data.messageId,
        content: updated.content,
        codeSnippet: updated.codeSnippet,
      });
    } catch (err) {
      client.emit('error', { message: err.message });
    }
  }

  @SubscribeMessage('delete_message')
  async handleDeleteMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { messageId: string; roomName: string },
  ) {
    const isEnabled = await this.isMessagingEnabled();
    if (!isEnabled) {
      client.emit('error', { message: 'Messaging is disabled by the administrator.' });
      return;
    }

    const user = client.data.user;
    if (!user || !data?.messageId || !data?.roomName) return;

    const isJoined = client.rooms.has(data.roomName);
    if (!isJoined) return;

    const success = await this.chatService.deleteMessage(data.messageId, user.sub);
    if (success) {
      this.server.to(data.roomName).emit('message_deleted', {
        messageId: data.messageId,
      });
    } else {
      client.emit('error', { message: 'Failed to delete message' });
    }
  }
}
