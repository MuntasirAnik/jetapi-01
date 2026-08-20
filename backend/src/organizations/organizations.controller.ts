import { Controller, Get, Post, Body, Param, Put, Delete, Patch, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { AuthGuard } from '../auth/auth.guard';

@UseGuards(AuthGuard)
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post()
  create(@Body() data: any, @Request() req: any) {
    return this.organizationsService.create(data, req.user.sub);
  }

  @Get()
  findAll(@Request() req: any) {
    return this.organizationsService.findAllForUser(req.user.sub);
  }

  // ── Static routes MUST come before :id param routes ──

  @Get('invitations/mine')
  getMyPendingInvitations(@Request() req: any) {
    return this.organizationsService.getMyPendingInvitations(req.user.sub);
  }

  @Post('invitations/:invitationId/accept')
  acceptInvitation(@Param('invitationId') invitationId: string, @Request() req: any) {
    return this.organizationsService.acceptInvitation(invitationId, req.user.sub);
  }

  @Post('invitations/:invitationId/decline')
  declineInvitation(@Param('invitationId') invitationId: string, @Request() req: any) {
    return this.organizationsService.declineInvitation(invitationId, req.user.sub);
  }

  @Post('join/:token')
  joinViaInviteLink(@Param('token') token: string, @Request() req: any) {
    return this.organizationsService.joinViaInviteLink(token, req.user.sub);
  }

  // ── Parameterized :id routes ──

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.organizationsService.findOne(id, req.user.sub);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() data: any, @Request() req: any) {
    return this.organizationsService.update(id, data, req.user.sub);
  }

  @Get(':id/users')
  getUsers(@Param('id') id: string, @Request() req: any) {
    return this.organizationsService.getUsers(id, req.user.sub);
  }

  @Post(':id/invite')
  inviteUser(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.organizationsService.inviteUser(id, body.email, req.user.sub);
  }

  @Patch(':id/users/:userId/role')
  updateRole(@Param('id') id: string, @Param('userId') userId: string, @Body() body: any, @Request() req: any) {
    return this.organizationsService.updateRole(id, userId, body.role, req.user.sub);
  }

  @Delete(':id/users/:userId')
  removeUser(@Param('id') id: string, @Param('userId') userId: string, @Request() req: any) {
    return this.organizationsService.removeUser(id, userId, req.user.sub);
  }

  @Delete(':id/leave')
  leaveTeam(@Param('id') id: string, @Request() req: any) {
    return this.organizationsService.leaveTeam(id, req.user.sub);
  }

  // ── Invite Links ──

  @Post(':id/invite-link')
  generateInviteLink(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.organizationsService.generateInviteLink(id, req.user.sub, {
      expiresInDays: body.expiresInDays,
      maxUses: body.maxUses,
    });
  }

  @Get(':id/invite-links')
  getInviteLinks(@Param('id') id: string, @Request() req: any) {
    return this.organizationsService.getInviteLinks(id, req.user.sub);
  }

  @Delete(':id/invite-links/:linkId')
  revokeInviteLink(@Param('id') id: string, @Param('linkId') linkId: string, @Request() req: any) {
    return this.organizationsService.revokeInviteLink(id, linkId, req.user.sub);
  }

  // ── Pending Invitations (org-scoped) ──

  @Post(':id/invitations')
  createInvitation(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.organizationsService.createInvitation(id, body.email, body.role, req.user.sub);
  }

  @Get(':id/invitations')
  getInvitations(@Param('id') id: string, @Request() req: any) {
    return this.organizationsService.getInvitations(id, req.user.sub);
  }

  @Delete(':id/invitations/:invitationId')
  cancelInvitation(@Param('id') id: string, @Param('invitationId') invitationId: string, @Request() req: any) {
    return this.organizationsService.cancelInvitation(id, invitationId, req.user.sub);
  }
}
