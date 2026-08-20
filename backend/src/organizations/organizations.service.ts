import { Injectable, NotFoundException, ForbiddenException, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from './organization.entity';
import { OrganizationUser } from './organization-user.entity';
import { InviteLink } from './invite-link.entity';
import { Invitation } from './invitation.entity';
import { User } from '../users/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import * as crypto from 'crypto';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization)
    private orgRepo: Repository<Organization>,
    @InjectRepository(OrganizationUser)
    private orgUserRepo: Repository<OrganizationUser>,
    @InjectRepository(InviteLink)
    private inviteLinkRepo: Repository<InviteLink>,
    @InjectRepository(Invitation)
    private invitationRepo: Repository<Invitation>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private notificationsService: NotificationsService,
  ) {}

  async create(data: Partial<Organization>, userId: string): Promise<Organization> {
    const org = this.orgRepo.create({ ...data, ownerId: userId });
    const savedOrg = await this.orgRepo.save(org);

    // Auto-join the creator as OWNER
    const orgUser = this.orgUserRepo.create({
      organizationId: savedOrg.id,
      userId: userId,
      role: 'OWNER'
    });
    await this.orgUserRepo.save(orgUser);

    return savedOrg;
  }

  async findAllForUser(userId: string): Promise<Organization[]> {
    const orgUsers = await this.orgUserRepo.find({
      where: { userId },
      relations: ['organization']
    });
    return orgUsers.map(ou => ou.organization);
  }

  async findOne(orgId: string, userId: string): Promise<Organization> {
    const membership = await this.orgUserRepo.findOne({ where: { organizationId: orgId, userId } });
    if (!membership) {
      throw new ForbiddenException('You do not have access to this organization.');
    }
    const org = await this.orgRepo.findOne({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async update(orgId: string, data: Partial<Organization>, currentUserId: string): Promise<Organization> {
    const org = await this.findOne(orgId, currentUserId);
    const membership = await this.orgUserRepo.findOne({ where: { organizationId: orgId, userId: currentUserId } });
    if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
      throw new ForbiddenException('Only admins or owners can update the team.');
    }
    if (data.name) {
      org.name = data.name;
    }
    if (data.maxMembers !== undefined && data.maxMembers >= 1) {
      org.maxMembers = data.maxMembers;
    }
    return this.orgRepo.save(org);
  }

  async getUsers(orgId: string, userId: string): Promise<any[]> {
    await this.findOne(orgId, userId); // verify access

    const memberships = await this.orgUserRepo.find({
      where: { organizationId: orgId },
      relations: ['user']
    });

    return memberships.map(m => ({
      id: m.userId,
      email: m.user.email,
      name: m.user.name || null,
      role: m.role,
      joinedAt: m.joinedAt,
      avatarMimeType: m.user.avatarMimeType || null,
    }));
  }

  async inviteUser(orgId: string, email: string, currentUserId: string): Promise<any> {
    const org = await this.findOne(orgId, currentUserId);
    
    const membership = await this.orgUserRepo.findOne({ where: { organizationId: orgId, userId: currentUserId } });
    if (!membership) {
      throw new ForbiddenException('You are not a member of this organization.');
    }
    if (membership.role !== 'OWNER' && membership.role !== 'ADMIN') {
      throw new ForbiddenException('Only admins or owners can invite users.');
    }

    // Billing check (respect per-org maxMembers setting)
    const activeUsersCount = await this.orgUserRepo.count({ where: { organizationId: orgId } });
    if (activeUsersCount >= org.maxMembers) {
      throw new HttpException(`This team is limited to ${org.maxMembers} members. Update the limit in Team Settings to add more.`, 402);
    }

    const targetUser = await this.userRepo.findOne({ where: { email } });
    if (!targetUser) {
      throw new NotFoundException('User with that email does not exist. They must create an account first.');
    }

    const existingMembership = await this.orgUserRepo.findOne({ where: { organizationId: orgId, userId: targetUser.id }});
    if (existingMembership) {
      throw new BadRequestException('User is already a member of this organization.');
    }

    // Check if there's already a pending invitation
    const existingInvitation = await this.invitationRepo.findOne({
      where: { email, organizationId: orgId, status: 'PENDING' },
    });
    if (existingInvitation) {
      throw new BadRequestException('An invitation has already been sent to this email.');
    }

    // Create a pending invitation instead of directly adding
    const invitation = this.invitationRepo.create({
      email,
      organizationId: orgId,
      role: 'MEMBER',
      invitedBy: currentUserId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });
    await this.invitationRepo.save(invitation);

    // Get inviter info for the notification message
    const inviter = await this.userRepo.findOne({ where: { id: currentUserId } });
    const inviterName = inviter?.name || inviter?.email || 'Someone';

    // Create a notification for the invited user
    await this.notificationsService.create(
      targetUser.id,
      `${inviterName} invited you to join the team "${org.name}".`,
      'TEAM_INVITE',
      { invitationId: invitation.id, organizationName: org.name, organizationId: orgId }
    );

    return { message: 'Invitation sent successfully', email, status: 'PENDING' };
  }

  async removeUser(orgId: string, targetUserId: string, currentUserId: string): Promise<void> {
    await this.findOne(orgId, currentUserId); // bounds check
    
    const membership = await this.orgUserRepo.findOne({ where: { organizationId: orgId, userId: currentUserId } });
    if (!membership) throw new ForbiddenException('You are not a member of this organization.');
    if (membership.role !== 'OWNER' && membership.role !== 'ADMIN') {
       throw new ForbiddenException('Only owners and admins can remove users.');
    }

    const targetMembership = await this.orgUserRepo.findOne({ where: { organizationId: orgId, userId: targetUserId }});
    if (!targetMembership) throw new NotFoundException('User is not in organization.');
    
    if (membership.role === 'ADMIN' && targetMembership.role === 'OWNER') {
       throw new ForbiddenException('Admins cannot remove owners.');
    }

    await this.orgUserRepo.remove(targetMembership);
  }

  async updateRole(orgId: string, targetUserId: string, newRole: string, currentUserId: string): Promise<OrganizationUser> {
    await this.findOne(orgId, currentUserId);
    const membership = await this.orgUserRepo.findOne({ where: { organizationId: orgId, userId: currentUserId } });
    if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
       throw new ForbiddenException('Only owners and admins can change roles.');
    }

    const normalizedRole = newRole.toUpperCase();
    if (!['OWNER', 'ADMIN', 'MEMBER'].includes(normalizedRole)) {
      throw new BadRequestException('Invalid role. Must be OWNER, ADMIN, or MEMBER.');
    }

    // Only OWNER can assign OWNER role
    if (normalizedRole === 'OWNER' && membership.role !== 'OWNER') {
      throw new ForbiddenException('Only the current owner can transfer ownership.');
    }

    // ADMIN cannot change another ADMIN's or OWNER's role
    if (membership.role === 'ADMIN') {
      const targetMembership = await this.orgUserRepo.findOne({ where: { organizationId: orgId, userId: targetUserId }});
      if (targetMembership && (targetMembership.role === 'OWNER' || targetMembership.role === 'ADMIN')) {
        throw new ForbiddenException('Admins cannot change the role of other admins or owners.');
      }
    }

    const targetMembership = await this.orgUserRepo.findOne({ where: { organizationId: orgId, userId: targetUserId }});
    if (!targetMembership) throw new NotFoundException('User not found.');

    // Handle ownership transfer: demote current owner to ADMIN
    if (normalizedRole === 'OWNER' && membership.role === 'OWNER') {
      membership.role = 'ADMIN';
      await this.orgUserRepo.save(membership);
      // Also update the org's ownerId
      const org = await this.orgRepo.findOne({ where: { id: orgId } });
      if (org) {
        org.ownerId = targetUserId;
        await this.orgRepo.save(org);
      }
    }

    targetMembership.role = normalizedRole;
    return this.orgUserRepo.save(targetMembership);
  }

  async leaveTeam(orgId: string, userId: string): Promise<void> {
    const membership = await this.orgUserRepo.findOne({ where: { organizationId: orgId, userId } });
    if (!membership) throw new NotFoundException('You are not a member of this organization.');
    
    if (membership.role === 'OWNER') {
      // Check if there are other members who could take over
      const memberCount = await this.orgUserRepo.count({ where: { organizationId: orgId } });
      if (memberCount > 1) {
        throw new BadRequestException('You must transfer ownership before leaving the team. Assign another member as OWNER first.');
      }
      // If sole member, allow leaving (org becomes orphaned)
    }

    await this.orgUserRepo.remove(membership);
  }

  // ──────────────────────────────────────────
  // Invite Links
  // ──────────────────────────────────────────

  async generateInviteLink(orgId: string, currentUserId: string, options?: { expiresInDays?: number; maxUses?: number }): Promise<InviteLink> {
    await this.findOne(orgId, currentUserId);
    const membership = await this.orgUserRepo.findOne({ where: { organizationId: orgId, userId: currentUserId } });
    if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
      throw new ForbiddenException('Only owners and admins can generate invite links.');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const link = this.inviteLinkRepo.create({
      token,
      organizationId: orgId,
      createdBy: currentUserId,
      expiresAt: options?.expiresInDays ? new Date(Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000) : null,
      maxUses: options?.maxUses || 0,
    });
    return this.inviteLinkRepo.save(link);
  }

  async getInviteLinks(orgId: string, currentUserId: string): Promise<InviteLink[]> {
    await this.findOne(orgId, currentUserId);
    return this.inviteLinkRepo.find({
      where: { organizationId: orgId, isActive: true },
      order: { createdAt: 'DESC' },
    });
  }

  async revokeInviteLink(orgId: string, linkId: string, currentUserId: string): Promise<void> {
    await this.findOne(orgId, currentUserId);
    const membership = await this.orgUserRepo.findOne({ where: { organizationId: orgId, userId: currentUserId } });
    if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
      throw new ForbiddenException('Only owners and admins can revoke invite links.');
    }
    const link = await this.inviteLinkRepo.findOne({ where: { id: linkId, organizationId: orgId } });
    if (!link) throw new NotFoundException('Invite link not found.');
    link.isActive = false;
    await this.inviteLinkRepo.save(link);
  }

  async joinViaInviteLink(token: string, userId: string): Promise<any> {
    const link = await this.inviteLinkRepo.findOne({ where: { token }, relations: ['organization'] });
    if (!link) throw new NotFoundException('Invalid invite link.');
    if (!link.isActive) throw new BadRequestException('This invite link has been revoked.');
    if (link.expiresAt && new Date() > link.expiresAt) throw new BadRequestException('This invite link has expired.');
    if (link.maxUses > 0 && link.usedCount >= link.maxUses) throw new BadRequestException('This invite link has reached its usage limit.');

    // Check if already a member
    const existing = await this.orgUserRepo.findOne({ where: { organizationId: link.organizationId, userId } });
    if (existing) throw new BadRequestException('You are already a member of this team.');

    // Check seat limit
    const org = await this.orgRepo.findOne({ where: { id: link.organizationId } });
    if (org) {
      const memberCount = await this.orgUserRepo.count({ where: { organizationId: link.organizationId } });
      if (memberCount >= org.maxMembers) {
        throw new HttpException('This team has reached its member limit.', 402);
      }
    }

    // Join
    const newMember = this.orgUserRepo.create({
      organizationId: link.organizationId,
      userId,
      role: 'MEMBER',
    });
    await this.orgUserRepo.save(newMember);

    // Increment usage
    link.usedCount += 1;
    await this.inviteLinkRepo.save(link);

    return { organizationId: link.organizationId, organizationName: link.organization?.name || 'Team' };
  }

  // ──────────────────────────────────────────
  // Pending Invitations
  // ──────────────────────────────────────────

  async createInvitation(orgId: string, email: string, role: string, currentUserId: string): Promise<Invitation> {
    await this.findOne(orgId, currentUserId);
    const membership = await this.orgUserRepo.findOne({ where: { organizationId: orgId, userId: currentUserId } });
    if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
      throw new ForbiddenException('Only owners and admins can send invitations.');
    }

    // Check if already invited (pending)
    const existing = await this.invitationRepo.findOne({
      where: { email, organizationId: orgId, status: 'PENDING' },
    });
    if (existing) throw new BadRequestException('An invitation has already been sent to this email.');

    // Check if already a member
    const user = await this.userRepo.findOne({ where: { email } });
    if (user) {
      const alreadyMember = await this.orgUserRepo.findOne({ where: { organizationId: orgId, userId: user.id } });
      if (alreadyMember) throw new BadRequestException('This user is already a member of the team.');
    }

    const invitation = this.invitationRepo.create({
      email,
      organizationId: orgId,
      role: role || 'MEMBER',
      invitedBy: currentUserId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });
    return this.invitationRepo.save(invitation);
  }

  async getInvitations(orgId: string, currentUserId: string): Promise<any[]> {
    await this.findOne(orgId, currentUserId);
    const invitations = await this.invitationRepo.find({
      where: { organizationId: orgId, status: 'PENDING' },
      order: { createdAt: 'DESC' },
    });

    // Expire old invitations automatically
    const now = new Date();
    const result: any[] = [];
    for (const inv of invitations) {
      if (inv.expiresAt && now > inv.expiresAt) {
        inv.status = 'EXPIRED';
        await this.invitationRepo.save(inv);
      } else {
        result.push(inv);
      }
    }
    return result;
  }

  async cancelInvitation(orgId: string, invitationId: string, currentUserId: string): Promise<void> {
    await this.findOne(orgId, currentUserId);
    const membership = await this.orgUserRepo.findOne({ where: { organizationId: orgId, userId: currentUserId } });
    if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
      throw new ForbiddenException('Only owners and admins can cancel invitations.');
    }
    const invitation = await this.invitationRepo.findOne({ where: { id: invitationId, organizationId: orgId } });
    if (!invitation) throw new NotFoundException('Invitation not found.');
    invitation.status = 'CANCELLED';
    await this.invitationRepo.save(invitation);
  }

  async getMyPendingInvitations(userId: string): Promise<any[]> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) return [];

    const invitations = await this.invitationRepo.find({
      where: { email: user.email, status: 'PENDING' },
      relations: ['organization'],
      order: { createdAt: 'DESC' },
    });

    const now = new Date();
    return invitations
      .filter(inv => !inv.expiresAt || now <= inv.expiresAt)
      .map(inv => ({
        id: inv.id,
        organizationId: inv.organizationId,
        organizationName: inv.organization?.name || 'Unknown Team',
        role: inv.role,
        createdAt: inv.createdAt,
        expiresAt: inv.expiresAt,
      }));
  }

  async acceptInvitation(invitationId: string, userId: string): Promise<any> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found.');

    const invitation = await this.invitationRepo.findOne({
      where: { id: invitationId, email: user.email, status: 'PENDING' },
      relations: ['organization'],
    });
    if (!invitation) throw new NotFoundException('Invitation not found or already processed.');
    if (invitation.expiresAt && new Date() > invitation.expiresAt) {
      invitation.status = 'EXPIRED';
      await this.invitationRepo.save(invitation);
      throw new BadRequestException('This invitation has expired.');
    }

    // Check if already a member
    const existing = await this.orgUserRepo.findOne({ where: { organizationId: invitation.organizationId, userId } });
    if (existing) {
      invitation.status = 'ACCEPTED';
      await this.invitationRepo.save(invitation);
      throw new BadRequestException('You are already a member of this team.');
    }

    // Check seat limit
    const org = await this.orgRepo.findOne({ where: { id: invitation.organizationId } });
    if (org) {
      const memberCount = await this.orgUserRepo.count({ where: { organizationId: invitation.organizationId } });
      if (memberCount >= org.maxMembers) {
        throw new HttpException('This team has reached its member limit.', 402);
      }
    }

    // Join
    const newMember = this.orgUserRepo.create({
      organizationId: invitation.organizationId,
      userId,
      role: invitation.role || 'MEMBER',
    });
    await this.orgUserRepo.save(newMember);

    invitation.status = 'ACCEPTED';
    await this.invitationRepo.save(invitation);

    // Notify the inviter that the invitation was accepted
    if (invitation.invitedBy) {
      await this.notificationsService.create(
        invitation.invitedBy,
        `${user.name || user.email} accepted your invitation to join "${invitation.organization?.name || 'the team'}".`,
        'TEAM_INVITE_ACCEPTED',
        { organizationId: invitation.organizationId }
      );
    }

    return { organizationId: invitation.organizationId, organizationName: invitation.organization?.name || 'Team' };
  }

  async declineInvitation(invitationId: string, userId: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found.');

    const invitation = await this.invitationRepo.findOne({
      where: { id: invitationId, email: user.email, status: 'PENDING' },
      relations: ['organization'],
    });
    if (!invitation) throw new NotFoundException('Invitation not found.');
    invitation.status = 'DECLINED';
    await this.invitationRepo.save(invitation);

    // Notify the inviter that the invitation was declined
    if (invitation.invitedBy) {
      const orgName = invitation.organization?.name || 'the team';
      await this.notificationsService.create(
        invitation.invitedBy,
        `${user.name || user.email} declined your invitation to join "${orgName}".`,
        'TEAM_INVITE_DECLINED',
        { organizationId: invitation.organizationId }
      );
    }
  }
}
