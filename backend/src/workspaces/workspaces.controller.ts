import { Controller, Get, Post, Body, Param, Put, Delete, Patch, UseGuards, Request, Query, BadRequestException } from '@nestjs/common';
import { WorkspacesService } from './workspaces.service';
import { Workspace } from './workspace.entity';
import { AuthGuard } from '../auth/auth.guard';

@UseGuards(AuthGuard)
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Post()
  create(@Body() data: Partial<Workspace>, @Request() req: any) {
    if (!data.organizationId) throw new BadRequestException('organizationId is required');
    return this.workspacesService.create(data, req.user.sub);
  }

  @Get()
  findAll(@Query('organizationId') orgId: string, @Request() req: any) {
    if (!orgId) throw new BadRequestException('organizationId query parameter is required');
    return this.workspacesService.findAllByOrg(orgId, req.user.sub);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.workspacesService.findOne(id, req.user.sub);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() data: Partial<Workspace>, @Request() req: any) {
    return this.workspacesService.update(id, data, req.user.sub);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.workspacesService.remove(id, req.user.sub);
  }

  // ── Workspace Members ──

  @Get(':id/members')
  getMembers(@Param('id') id: string, @Request() req: any) {
    return this.workspacesService.getMembers(id, req.user.sub);
  }

  @Post(':id/members')
  addMember(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.workspacesService.addMember(id, body.email, body.role, req.user.sub);
  }

  @Delete(':id/members/:memberId')
  removeMember(@Param('id') id: string, @Param('memberId') memberId: string, @Request() req: any) {
    return this.workspacesService.removeMember(id, memberId, req.user.sub);
  }

  @Patch(':id/members/:memberId/role')
  updateMemberRole(@Param('id') id: string, @Param('memberId') memberId: string, @Body('role') role: string, @Request() req: any) {
    return this.workspacesService.updateMemberRole(id, memberId, role, req.user.sub);
  }
}

