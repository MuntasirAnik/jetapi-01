import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from './organization.entity';
import { OrganizationUser } from './organization-user.entity';
import { User } from '../users/user.entity';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization)
    private orgRepo: Repository<Organization>,
    @InjectRepository(OrganizationUser)
    private orgUserRepo: Repository<OrganizationUser>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(
    data: Partial<Organization>,
    userId: string,
  ): Promise<Organization> {
    const org = this.orgRepo.create({ ...data, ownerId: userId });
    const savedOrg = await this.orgRepo.save(org);

    // Auto-join the creator as OWNER
    const orgUser = this.orgUserRepo.create({
      organizationId: savedOrg.id,
      userId: userId,
      role: 'OWNER',
      status: 'ACCEPTED',
    });
    await this.orgUserRepo.save(orgUser);

    return savedOrg;
  }

  async findAllForUser(userId: string): Promise<Organization[]> {
    const orgUsers = await this.orgUserRepo.find({
      where: { userId, status: 'ACCEPTED' },
      relations: ['organization'],
    });
    return orgUsers.map((ou) => ou.organization);
  }

  async findOne(orgId: string, userId: string): Promise<Organization> {
    const membership = await this.orgUserRepo.findOne({
      where: { organizationId: orgId, userId, status: 'ACCEPTED' },
    });
    if (!membership) {
      throw new ForbiddenException(
        'You do not have access to this organization.',
      );
    }
    const org = await this.orgRepo.findOne({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async update(
    orgId: string,
    data: Partial<Organization>,
    currentUserId: string,
  ): Promise<Organization> {
    const org = await this.findOne(orgId, currentUserId);
    const membership = await this.orgUserRepo.findOne({
      where: { organizationId: orgId, userId: currentUserId },
    });
    if (
      !membership ||
      (membership.role !== 'OWNER' && membership.role !== 'ADMIN')
    ) {
      throw new ForbiddenException(
        'Only admins or owners can update the team.',
      );
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
      relations: ['user'],
    });

    return memberships.map((m) => ({
      id: m.userId,
      email: m.user.email,
      name: m.user.name,
      role: m.role,
      joinedAt: m.joinedAt,
      avatarMimeType: m.user.avatarMimeType,
    }));
  }

  async inviteUser(
    orgId: string,
    email: string,
    currentUserId: string,
  ): Promise<any> {
    const org = await this.findOne(orgId, currentUserId);

    const membership = await this.orgUserRepo.findOne({
      where: { organizationId: orgId, userId: currentUserId },
    });
    if (!membership) {
      throw new ForbiddenException(
        'You are not a member of this organization.',
      );
    }
    if (membership.role !== 'OWNER' && membership.role !== 'ADMIN') {
      throw new ForbiddenException('Only admins or owners can invite users.');
    }

    // Billing check (respect per-org maxMembers setting)
    const activeUsersCount = await this.orgUserRepo.count({
      where: { organizationId: orgId },
    });
    if (activeUsersCount >= org.maxMembers) {
      throw new HttpException(
        `This team is limited to ${org.maxMembers} members. Update the limit in Team Settings to add more.`,
        402,
      );
    }

    let targetUser = await this.userRepo.findOne({ where: { email } });
    if (!targetUser) {
      targetUser = this.userRepo.create({
        email,
        name: email.split('@')[0],
        passwordHash: 'external-invite-no-password',
      });
      targetUser = await this.userRepo.save(targetUser);
    }

    const existingMembership = await this.orgUserRepo.findOne({
      where: { organizationId: orgId, userId: targetUser.id },
    });
    if (existingMembership) {
      throw new BadRequestException(
        'User is already a member of this organization.',
      );
    }

    const newOrgUser = this.orgUserRepo.create({
      organizationId: orgId,
      userId: targetUser.id,
      role: 'MEMBER',
      status: 'PENDING',
      invitedById: currentUserId,
    });

    const savedOrgUser = await this.orgUserRepo.save(newOrgUser);

    try {
      const sender = await this.userRepo.findOne({ where: { id: currentUserId } });
      const senderName = sender?.name || sender?.email || 'Someone';
      await this.notificationsService.create(
        targetUser.id,
        `You have been invited to join the team "${org.name}" by ${senderName}.`,
      );
    } catch (err) {
      console.error('Failed to create invitation notification:', err);
    }

    return savedOrgUser;
  }

  async findAllPendingForUser(userId: string): Promise<any[]> {
    const orgUsers = await this.orgUserRepo.find({
      where: { userId, status: 'PENDING' },
      relations: ['organization'],
    });
    return orgUsers.map((ou) => ({
      id: ou.id,
      organization: ou.organization,
      role: ou.role,
      joinedAt: ou.joinedAt,
    }));
  }

  async acceptInvite(orgUserId: string, userId: string): Promise<any> {
    const orgUser = await this.orgUserRepo.findOne({
      where: { id: orgUserId, userId },
      relations: ['organization'],
    });
    if (!orgUser) {
      throw new NotFoundException('Invitation not found.');
    }

    // Billing check (respect per-org maxMembers setting)
    const activeUsersCount = await this.orgUserRepo.count({
      where: { organizationId: orgUser.organizationId, status: 'ACCEPTED' },
    });
    if (activeUsersCount >= orgUser.organization.maxMembers) {
      throw new HttpException(
        `This team is limited to ${orgUser.organization.maxMembers} members. Upgrades are required to accept.`,
        402,
      );
    }

    orgUser.status = 'ACCEPTED';
    const saved = await this.orgUserRepo.save(orgUser);

    if (orgUser.invitedById) {
      try {
        const acceptingUser = await this.userRepo.findOne({ where: { id: userId } });
        const nameOrEmail = acceptingUser?.name || acceptingUser?.email || 'A user';
        await this.notificationsService.create(
          orgUser.invitedById,
          `${nameOrEmail} has accepted your invitation to join the team "${orgUser.organization.name}".`,
        );
      } catch (err) {
        console.error('Failed to send acceptance notification:', err);
      }
    }

    return saved;
  }

  async declineInvite(orgUserId: string, userId: string): Promise<void> {
    const orgUser = await this.orgUserRepo.findOne({
      where: { id: orgUserId, userId },
      relations: ['organization'],
    });
    if (!orgUser) {
      throw new NotFoundException('Invitation not found.');
    }
    const invitedById = orgUser.invitedById;
    const orgName = orgUser.organization?.name;

    await this.orgUserRepo.remove(orgUser);

    if (invitedById) {
      try {
        const decliningUser = await this.userRepo.findOne({ where: { id: userId } });
        const nameOrEmail = decliningUser?.name || decliningUser?.email || 'A user';
        await this.notificationsService.create(
          invitedById,
          `${nameOrEmail} has rejected your invitation to join the team "${orgName}".`,
        );
      } catch (err) {
        console.error('Failed to send decline notification:', err);
      }
    }
  }

  async removeUser(
    orgId: string,
    targetUserId: string,
    currentUserId: string,
  ): Promise<void> {
    await this.findOne(orgId, currentUserId); // bounds check

    const membership = await this.orgUserRepo.findOne({
      where: { organizationId: orgId, userId: currentUserId },
    });
    if (!membership)
      throw new ForbiddenException(
        'You are not a member of this organization.',
      );
    if (membership.role !== 'OWNER' && membership.role !== 'ADMIN') {
      throw new ForbiddenException('Only owners and admins can remove users.');
    }

    const targetMembership = await this.orgUserRepo.findOne({
      where: { organizationId: orgId, userId: targetUserId },
    });
    if (!targetMembership)
      throw new NotFoundException('User is not in organization.');

    if (membership.role === 'ADMIN' && targetMembership.role === 'OWNER') {
      throw new ForbiddenException('Admins cannot remove owners.');
    }

    await this.orgUserRepo.remove(targetMembership);
  }

  async updateRole(
    orgId: string,
    targetUserId: string,
    newRole: string,
    currentUserId: string,
  ): Promise<OrganizationUser> {
    await this.findOne(orgId, currentUserId);
    const membership = await this.orgUserRepo.findOne({
      where: { organizationId: orgId, userId: currentUserId },
    });
    if (!membership || membership.role !== 'OWNER') {
      throw new ForbiddenException('Only owners can assign roles.');
    }
    const targetMembership = await this.orgUserRepo.findOne({
      where: { organizationId: orgId, userId: targetUserId },
    });
    if (!targetMembership) throw new NotFoundException('User not found.');
    // Check if downgrading the last owner? We'll skip complex logic for now.
    targetMembership.role = newRole.toUpperCase();
    return this.orgUserRepo.save(targetMembership);
  }
}
