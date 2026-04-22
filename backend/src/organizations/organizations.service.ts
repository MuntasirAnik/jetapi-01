import { Injectable, NotFoundException, ForbiddenException, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from './organization.entity';
import { OrganizationUser } from './organization-user.entity';
import { User } from '../users/user.entity';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization)
    private orgRepo: Repository<Organization>,
    @InjectRepository(OrganizationUser)
    private orgUserRepo: Repository<OrganizationUser>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
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
      role: m.role,
      joinedAt: m.joinedAt,
      avatarMimeType: m.user.avatarMimeType
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
      throw new NotFoundException('User with that email does not exist.');
    }

    const existingMembership = await this.orgUserRepo.findOne({ where: { organizationId: orgId, userId: targetUser.id }});
    if (existingMembership) {
      throw new BadRequestException('User is already a member of this organization.');
    }

    const newOrgUser = this.orgUserRepo.create({
      organizationId: orgId,
      userId: targetUser.id,
      role: 'MEMBER'
    });
    
    return this.orgUserRepo.save(newOrgUser);
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
    if (!membership || membership.role !== 'OWNER') {
       throw new ForbiddenException('Only owners can assign roles.');
    }
    const targetMembership = await this.orgUserRepo.findOne({ where: { organizationId: orgId, userId: targetUserId }});
    if (!targetMembership) throw new NotFoundException('User not found.');
    // Check if downgrading the last owner? We'll skip complex logic for now.
    targetMembership.role = newRole.toUpperCase();
    return this.orgUserRepo.save(targetMembership);
  }
}
