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
  maxHttpBufferSize: 1e8, // 100MB
  path: '/api/socket.io',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // Track socket to user mapping: socketId -> { userId: string, orgIds: Set<string>, rooms: Set<string> }
  private socketData = new Map<string, { userId: string; orgIds: Set<string>; rooms: Set<string> }>();

  // Track user to socket count: userId -> Set of socketIds
  private userSockets = new Map<string, Set<string>>();

  // Track online users per organization: orgId -> Set of userIds
  private orgOnlineUsers = new Map<string, Set<string>>();

  // Track online users per room: roomName -> Set of userIds
  private roomOnlineUsers = new Map<string, Set<string>>();

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

  private async authenticateSocket(client: Socket): Promise<any> {
    if (client.data.user) return client.data.user;
    try {
      const authHeader = client.handshake.headers.authorization;
      const token = authHeader?.split(' ')[1] || client.handshake.auth?.token;
      if (!token) return null;

      const payload = await this.jwtService.verifyAsync(token, {
        secret: 'YOUR_SECRET_KEY',
      });
      client.data.user = payload;
      return payload;
    } catch {
      return null;
    }
  }

  private registerUserSocket(socketId: string, userId: string, orgId?: string) {
    let sData = this.socketData.get(socketId);
    if (!sData) {
      sData = { userId, orgIds: new Set<string>(), rooms: new Set<string>() };
      this.socketData.set(socketId, sData);
    }
    if (orgId) {
      sData.orgIds.add(orgId);
      let orgUsers = this.orgOnlineUsers.get(orgId);
      if (!orgUsers) {
        orgUsers = new Set<string>();
        this.orgOnlineUsers.set(orgId, orgUsers);
      }
      orgUsers.add(userId);
    }

    let sockets = this.userSockets.get(userId);
    if (!sockets) {
      sockets = new Set<string>();
      this.userSockets.set(userId, sockets);
    }
    sockets.add(socketId);
  }

  private broadcastOrgPresence(orgId: string) {
    const online = Array.from(this.orgOnlineUsers.get(orgId) || []);
    const payload = {
      organizationId: orgId,
      room: `team_${orgId}`,
      onlineUsers: online,
    };
    this.server.to(`notify_org_${orgId}`).emit('presence_update', payload);
    this.server.to(`team_${orgId}`).emit('presence_update', payload);
  }

  async handleConnection(client: Socket) {
    try {
      const isEnabled = await this.isMessagingEnabled();
      if (!isEnabled) {
        client.disconnect();
        return;
      }

      const user = await this.authenticateSocket(client);
      if (!user) {
        client.disconnect();
        return;
      }

      this.registerUserSocket(client.id, user.sub);
    } catch (err) {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const sData = this.socketData.get(client.id);
    if (!sData) return;

    const { userId, orgIds, rooms } = sData;
    this.socketData.delete(client.id);

    // Remove socket from userSockets
    const sockets = this.userSockets.get(userId);
    if (sockets) {
      sockets.delete(client.id);
      if (sockets.size === 0) {
        this.userSockets.delete(userId);

        // User is fully offline: remove from all orgs and rooms
        for (const orgId of orgIds) {
          const orgUsers = this.orgOnlineUsers.get(orgId);
          if (orgUsers) {
            orgUsers.delete(userId);
            this.broadcastOrgPresence(orgId);
          }
        }

        for (const roomName of rooms) {
          const roomUsers = this.roomOnlineUsers.get(roomName);
          if (roomUsers) {
            roomUsers.delete(userId);
            this.server.to(roomName).emit('presence_update', {
              room: roomName,
              onlineUsers: Array.from(roomUsers),
            });
          }
        }
      }
    }
  }

  @SubscribeMessage('subscribe_notifications')
  async handleSubscribeNotifications(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { organizationId?: string; workspaceId?: string }
  ) {
    const user = await this.authenticateSocket(client);
    if (!user) return;

    this.registerUserSocket(client.id, user.sub, data.organizationId);

    client.join(`notify_user_${user.sub}`);
    if (data.organizationId) {
      client.join(`notify_org_${data.organizationId}`);
      this.broadcastOrgPresence(data.organizationId);
    }
    if (data.workspaceId) {
      client.join(`notify_workspace_${data.workspaceId}`);
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

    const user = await this.authenticateSocket(client);
    if (!user || !data?.type) return;

    this.registerUserSocket(client.id, user.sub, data.organizationId);

    let roomName = '';
    let history: any[] = [];
    let effectiveOrgId = data.organizationId;

    if (data.type === 'team' && data.organizationId) {
      const membership = await this.orgUserRepo.findOne({
        where: [
          { organizationId: data.organizationId, userId: user.sub },
          { organizationId: data.organizationId, user: { id: user.sub } },
        ],
      });
      if (!membership) return;

      roomName = `team_${data.organizationId}`;
      history = await this.chatService.getTeamMessages(data.organizationId);
    } else if (data.type === 'workspace' && data.workspaceId) {
      const workspace = await this.workspaceRepo.findOne({
        where: { id: data.workspaceId },
      });
      if (!workspace) return;

      effectiveOrgId = workspace.organizationId;
      const membership = await this.orgUserRepo.findOne({
        where: [
          { organizationId: workspace.organizationId, userId: user.sub },
          { organizationId: workspace.organizationId, user: { id: user.sub } },
        ],
      });
      if (!membership) return;

      roomName = `workspace_${data.workspaceId}`;
      history = await this.chatService.getWorkspaceMessages(data.workspaceId);
    } else if (data.type === 'dm' && data.recipientId && data.organizationId) {
      const senderMembership = await this.orgUserRepo.findOne({
        where: [
          { organizationId: data.organizationId, userId: user.sub },
          { organizationId: data.organizationId, user: { id: user.sub } },
        ],
      });
      const recipientMembership = await this.orgUserRepo.findOne({
        where: [
          { organizationId: data.organizationId, userId: data.recipientId },
          { organizationId: data.organizationId, user: { id: data.recipientId } },
        ],
      });
      if (!senderMembership || !recipientMembership) return;

      const ids = [user.sub, data.recipientId].sort();
      roomName = `dm_${ids[0]}_${ids[1]}`;
      history = await this.chatService.getDmMessages(user.sub, data.recipientId);
    }

    if (!roomName) return;

    client.join(roomName);

    // Track room membership for socket
    const sData = this.socketData.get(client.id);
    if (sData) {
      sData.rooms.add(roomName);
    }

    let roomUsers = this.roomOnlineUsers.get(roomName);
    if (!roomUsers) {
      roomUsers = new Set<string>();
      this.roomOnlineUsers.set(roomName, roomUsers);
    }
    roomUsers.add(user.sub);

    // Emit chat history directly to the client
    client.emit('chat_history', { roomName, history });

    // Broadcast presence: For team chat, use the full list of online members in the organization
    const orgOnline = effectiveOrgId
      ? Array.from(this.orgOnlineUsers.get(effectiveOrgId) || [user.sub])
      : Array.from(roomUsers);

    this.server.to(roomName).emit('presence_update', {
      room: roomName,
      organizationId: effectiveOrgId,
      onlineUsers: orgOnline,
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

    const sData = this.socketData.get(client.id);
    if (sData) {
      sData.rooms.delete(data.roomName);
    }

    const roomUsers = this.roomOnlineUsers.get(data.roomName);
    if (roomUsers) {
      roomUsers.delete(user.sub);
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

    const user = await this.authenticateSocket(client);
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

    // Ensure client has joined room
    client.join(roomName);

    const savedMessage = await this.chatService.createMessage(
      user.sub,
      data.content,
      data.codeSnippet,
      data.workspaceId,
      data.organizationId,
      data.recipientId,
    );

    // Attach roomName to payload for seamless frontend dispatching
    const messagePayload = {
      ...savedMessage,
      roomName,
    };

    this.server.to(roomName).emit('new_message', messagePayload);

    // Also emit a notification for the dot indicator
    const notifyPayload = { room: roomName, sender: user.sub, message: messagePayload };
    if (data.type === 'team' && data.organizationId) {
      this.server.to(`notify_org_${data.organizationId}`).emit('notification', notifyPayload);
    } else if (data.type === 'workspace' && data.workspaceId) {
      this.server.to(`notify_workspace_${data.workspaceId}`).emit('notification', notifyPayload);
    } else if (data.type === 'dm' && data.recipientId) {
      this.server.to(`notify_user_${data.recipientId}`).emit('notification', notifyPayload);
    }
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

    const user = await this.authenticateSocket(client);
    if (!user || !data?.messageId || !data?.content || !data?.roomName) return;

    client.join(data.roomName);

    try {
      const updated = await this.chatService.editMessage(
        data.messageId,
        user.sub,
        data.content,
      );
      this.server.to(data.roomName).emit('message_edited', {
        roomName: data.roomName,
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

    const user = await this.authenticateSocket(client);
    if (!user || !data?.messageId || !data?.roomName) return;

    client.join(data.roomName);

    const success = await this.chatService.deleteMessage(data.messageId, user.sub);
    if (success) {
      this.server.to(data.roomName).emit('message_deleted', {
        roomName: data.roomName,
        messageId: data.messageId,
      });
    } else {
      client.emit('error', { message: 'Failed to delete message' });
    }
  }

  @SubscribeMessage('react_message')
  async handleReactMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { messageId: string; emoji: string; roomName: string },
  ) {
    const isEnabled = await this.isMessagingEnabled();
    if (!isEnabled) {
      client.emit('error', { message: 'Messaging is disabled by the administrator.' });
      return;
    }

    const user = await this.authenticateSocket(client);
    if (!user || !data?.messageId || !data?.emoji || !data?.roomName) return;

    client.join(data.roomName);

    try {
      const updated = await this.chatService.toggleReaction(
        data.messageId,
        user.sub,
        data.emoji,
      );
      this.server.to(data.roomName).emit('message_reacted', {
        roomName: data.roomName,
        messageId: data.messageId,
        reactions: updated.reactions,
      });
    } catch (err) {
      client.emit('error', { message: err.message });
    }
  }
}
