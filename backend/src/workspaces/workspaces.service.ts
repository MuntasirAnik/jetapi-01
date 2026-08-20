import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Workspace } from './workspace.entity';
import { WorkspaceUser } from './workspace-user.entity';
import { OrganizationUser } from '../organizations/organization-user.entity';
import { User } from '../users/user.entity';

@Injectable()
export class WorkspacesService {
  constructor(
    @InjectRepository(Workspace)
    private readonly workspaceRepository: Repository<Workspace>,
    @InjectRepository(WorkspaceUser)
    private readonly wsUserRepo: Repository<WorkspaceUser>,
    @InjectRepository(OrganizationUser)
    private readonly orgUserRepo: Repository<OrganizationUser>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /**
   * Get the user's effective role on a workspace.
   * Priority: workspace-level role > org-level role fallback.
   * Org OWNER/ADMIN always get at least ADMIN access to all workspaces.
   */
  async getEffectiveRole(workspaceId: string, userId: string, workspace?: Workspace): Promise<'ADMIN' | 'EDITOR' | 'VIEWER' | null> {
    const ws = workspace || await this.workspaceRepository.findOne({ where: { id: workspaceId } });
    if (!ws) return null;

    // Check workspace-level membership first
    const wsMember = await this.wsUserRepo.findOne({ where: { workspaceId, userId } });
    
    // Check org-level membership
    const orgMember = await this.orgUserRepo.findOne({ where: { organizationId: ws.organizationId, userId } });

    // Org OWNER/ADMIN always have ADMIN access to all workspaces
    if (orgMember && (orgMember.role === 'OWNER' || orgMember.role === 'ADMIN')) {
      return 'ADMIN';
    }

    // Workspace-level role takes priority
    if (wsMember) {
      return wsMember.role as 'ADMIN' | 'EDITOR' | 'VIEWER';
    }

    // Org MEMBER with TEAM visibility gets EDITOR by default
    if (orgMember && ws.visibility === 'TEAM') {
      return 'EDITOR';
    }

    // PUBLIC workspaces give VIEWER access to org members
    if (orgMember && ws.visibility === 'PUBLIC') {
      return 'VIEWER';
    }

    return null;
  }

  async create(data: Partial<Workspace>, userId: string): Promise<Workspace> {
    const membership = await this.orgUserRepo.findOne({ where: { organizationId: data.organizationId, userId }});
    if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
      throw new ForbiddenException('Only owners and admins can create workspaces in this organization.');
    }
    const workspace = this.workspaceRepository.create({ ...data });
    return this.workspaceRepository.save(workspace);
  }

  async findAllByOrg(orgId: string, userId: string): Promise<Workspace[]> {
    const membership = await this.orgUserRepo.findOne({ where: { organizationId: orgId, userId }});
    if (!membership) throw new ForbiddenException('Access denied');

    const workspaces = await this.workspaceRepository.find({
      where: { organizationId: orgId }
    });

    if (workspaces.length === 0) return [];

    const workspaceIds = workspaces.map(w => w.id);
    const collections = await this.workspaceRepository.manager.getRepository('Collection').createQueryBuilder('col')
      .leftJoinAndSelect('col.shares', 'share')
      .leftJoinAndSelect('share.user', 'sharedUser')
      .where('col.workspaceId IN (:...workspaceIds)', { workspaceIds })
      .getMany();

    const collectionIds = collections.map(c => c.id);
    let requests: any[] = [];
    
    if (collectionIds.length > 0) {
      requests = await this.workspaceRepository.manager.getRepository('RequestItem').createQueryBuilder('req')
        .where('req.collectionId IN (:...collectionIds)', { collectionIds })
        .getMany();
    }

    collections.forEach(col => {
      col.requests = requests.filter(r => r.collectionId === col.id);
    });

    workspaces.forEach(ws => {
      ws.collections = collections.filter(c => c.workspaceId === ws.id) as any;
    });
    
    return workspaces;
  }

  async findOne(id: string, userId: string): Promise<Workspace> {
    const workspace = await this.workspaceRepository.findOne({
      where: { id }
    });

    if (!workspace) throw new NotFoundException('Workspace not found');

    const membership = await this.orgUserRepo.findOne({ where: { organizationId: workspace.organizationId, userId }});

    const collections = await this.workspaceRepository.manager.getRepository('Collection').createQueryBuilder('col')
      .leftJoinAndSelect('col.shares', 'share')
      .leftJoinAndSelect('share.user', 'sharedUser')
      .where('col.workspaceId = :id', { id })
      .getMany();

    const collectionIds = collections.map(c => c.id);
    let requests: any[] = [];
    if (collectionIds.length > 0) {
      requests = await this.workspaceRepository.manager.getRepository('RequestItem').createQueryBuilder('req')
        .where('req.collectionId IN (:...collectionIds)', { collectionIds })
        .getMany();
    }

    collections.forEach((col: any) => {
      col.requests = requests.filter(r => r.collectionId === col.id);
    });

    workspace.collections = collections as any;

    let hasAccess = !!membership;
    if (!hasAccess) {
      const hasSharedCollection = workspace.collections?.some((c: any) => 
         c.shares?.some((s: any) => s.userId === userId)
      );
      hasAccess = !!hasSharedCollection;
    }

    if (!hasAccess) throw new ForbiddenException('Access denied');

    if (!membership && workspace.collections) {
      workspace.collections = workspace.collections.filter((c: any) => c.shares?.some((s: any) => s.userId === userId)) as any;
    }

    return workspace;
  }

  async update(id: string, data: Partial<Workspace>, userId: string): Promise<Workspace> {
    const workspace = await this.findOne(id, userId);
    
    const role = await this.getEffectiveRole(id, userId, workspace);
    if (!role || role === 'VIEWER' || role === 'EDITOR') {
      throw new ForbiddenException('Only workspace admins can manage workspace settings.');
    }
    
    Object.assign(workspace, data);
    return this.workspaceRepository.save(workspace);
  }

  async remove(id: string, userId: string): Promise<void> {
    const workspace = await this.findOne(id, userId);
    
    const membership = await this.orgUserRepo.findOne({ where: { organizationId: workspace.organizationId, userId }});
    if (!membership || membership.role !== 'OWNER') {
      throw new ForbiddenException('Only owners can delete workspaces');
    }
    
    await this.workspaceRepository.remove(workspace);
  }

  // ──────────────────────────────────────────
  // Workspace Member Management
  // ──────────────────────────────────────────

  async getMembers(workspaceId: string, userId: string): Promise<any[]> {
    await this.findOne(workspaceId, userId); // verify access

    const members = await this.wsUserRepo.find({
      where: { workspaceId },
      relations: ['user'],
      order: { addedAt: 'ASC' },
    });

    return members.map(m => ({
      id: m.id,
      userId: m.userId,
      email: m.user?.email || '',
      name: m.user?.name || null,
      role: m.role,
      addedAt: m.addedAt,
      avatarMimeType: m.user?.avatarMimeType || null,
    }));
  }

  async addMember(workspaceId: string, targetEmail: string, role: string, currentUserId: string): Promise<any> {
    const workspace = await this.findOne(workspaceId, currentUserId);
    
    const effectiveRole = await this.getEffectiveRole(workspaceId, currentUserId, workspace);
    if (!effectiveRole || effectiveRole !== 'ADMIN') {
      throw new ForbiddenException('Only workspace admins can add members.');
    }

    const targetUser = await this.userRepo.findOne({ where: { email: targetEmail } });
    if (!targetUser) throw new NotFoundException('User with that email not found.');

    // Must be an org member
    const orgMember = await this.orgUserRepo.findOne({ where: { organizationId: workspace.organizationId, userId: targetUser.id } });
    if (!orgMember) throw new BadRequestException('User must be a member of the team first.');

    const existing = await this.wsUserRepo.findOne({ where: { workspaceId, userId: targetUser.id } });
    if (existing) throw new BadRequestException('User is already a member of this workspace.');

    const normalizedRole = (role || 'EDITOR').toUpperCase();
    if (!['ADMIN', 'EDITOR', 'VIEWER'].includes(normalizedRole)) {
      throw new BadRequestException('Invalid role. Must be ADMIN, EDITOR, or VIEWER.');
    }

    const member = this.wsUserRepo.create({
      workspaceId,
      userId: targetUser.id,
      role: normalizedRole,
    });
    return this.wsUserRepo.save(member);
  }

  async removeMember(workspaceId: string, memberId: string, currentUserId: string): Promise<void> {
    const workspace = await this.findOne(workspaceId, currentUserId);
    
    const effectiveRole = await this.getEffectiveRole(workspaceId, currentUserId, workspace);
    if (!effectiveRole || effectiveRole !== 'ADMIN') {
      throw new ForbiddenException('Only workspace admins can remove members.');
    }

    const member = await this.wsUserRepo.findOne({ where: { id: memberId, workspaceId } });
    if (!member) throw new NotFoundException('Member not found.');

    await this.wsUserRepo.remove(member);
  }

  async updateMemberRole(workspaceId: string, memberId: string, newRole: string, currentUserId: string): Promise<WorkspaceUser> {
    const workspace = await this.findOne(workspaceId, currentUserId);
    
    const effectiveRole = await this.getEffectiveRole(workspaceId, currentUserId, workspace);
    if (!effectiveRole || effectiveRole !== 'ADMIN') {
      throw new ForbiddenException('Only workspace admins can change member roles.');
    }

    const normalizedRole = newRole.toUpperCase();
    if (!['ADMIN', 'EDITOR', 'VIEWER'].includes(normalizedRole)) {
      throw new BadRequestException('Invalid role. Must be ADMIN, EDITOR, or VIEWER.');
    }

    const member = await this.wsUserRepo.findOne({ where: { id: memberId, workspaceId } });
    if (!member) throw new NotFoundException('Member not found.');

    member.role = normalizedRole;
    return this.wsUserRepo.save(member);
  }
}
