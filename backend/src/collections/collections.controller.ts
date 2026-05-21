import { Controller, Get, Post, Body, Param, Put, Patch, Delete, UseGuards, Request, Query } from '@nestjs/common';
import { CollectionsService } from './collections.service';
import { Collection } from './collection.entity';
import { AuthGuard } from '../auth/auth.guard';
import { LimitsService } from '../subscriptions/limits.service';

@UseGuards(AuthGuard)
@Controller('collections')
export class CollectionsController {
  constructor(
    private readonly collectionsService: CollectionsService,
    private readonly limitsService: LimitsService,
  ) {}

  @Post()
  async create(@Body() data: Partial<Collection>, @Request() req: any) {
    await this.limitsService.checkCollectionLimit(req.user.sub);
    return this.collectionsService.create(data, req.user.sub);
  }

  @Get()
  async findAll(@Request() req: any, @Query('workspaceId') workspaceId: string, @Query('includeRequests') includeRequests: string) {
    if (workspaceId) {
      return this.collectionsService.getCollectionsByWorkspace(workspaceId, req.user.sub);
    }
    const cols = await this.collectionsService.findAll(req.user.sub, includeRequests === 'true');
    return cols;
  }

  @Get(':id/export')
  export(@Param('id') id: string, @Request() req: any) {
    return this.collectionsService.export(id, req.user.sub);
  }

  @Post('import')
  async import(@Body('workspaceId') workspaceId: string, @Body('data') data: any, @Request() req: any) {
    await this.limitsService.checkCollectionLimit(req.user.sub);
    return this.collectionsService.import(workspaceId, data, req.user.sub);
  }

  @Post(':id/share')
  share(
    @Param('id') id: string, 
    @Body('email') email: string, 
    @Body('role') role: 'viewer' | 'editor' | 'admin',
    @Request() req: any,
  ) {
    return this.collectionsService.share(id, email, req.user.sub, role || 'viewer');
  }

  @Put(':id/share/:userId')
  updateShareRole(
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
    @Body('role') role: 'viewer' | 'editor' | 'admin',
    @Request() req: any,
  ) {
    return this.collectionsService.updateShareRole(id, targetUserId, role, req.user.sub);
  }

  @Delete(':id/share/:userId')
  unshare(@Param('id') id: string, @Param('userId') userToUnshareId: string, @Request() req: any) {
    return this.collectionsService.unshare(id, userToUnshareId, req.user.sub);
  }

  @Patch(':id/toggle-active')
  toggleActive(
    @Param('id') id: string,
    @Body('isActive') isActive: boolean,
    @Request() req: any,
  ) {
    return this.collectionsService.toggleActive(id, isActive, req.user.sub);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.collectionsService.findOne(id, req.user.sub);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() data: Partial<Collection>, @Request() req: any) {
    return this.collectionsService.update(id, data, req.user.sub);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.collectionsService.remove(id, req.user.sub);
  }
}
