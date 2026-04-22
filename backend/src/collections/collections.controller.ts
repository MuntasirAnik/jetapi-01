import { Controller, Get, Post, Body, Param, Put, Delete, UseGuards, Request, Query } from '@nestjs/common';
import { CollectionsService } from './collections.service';
import { Collection } from './collection.entity';
import { AuthGuard } from '../auth/auth.guard';

@UseGuards(AuthGuard)
@Controller('collections')
export class CollectionsController {
  constructor(private readonly collectionsService: CollectionsService) {}

  @Post()
  create(@Body() data: Partial<Collection>, @Request() req: any) {
    return this.collectionsService.create(data, req.user.sub);
  }

  @Get()
  async findAll(@Request() req: any, @Query('workspaceId') workspaceId: string, @Query('includeRequests') includeRequests: string) {
    if (workspaceId) {
      return this.collectionsService.getCollectionsByWorkspace(workspaceId, req.user.sub);
    }
    const cols = await this.collectionsService.findAll(req.user.sub, includeRequests === 'true');
    console.log(`[DEBUG] GET /collections Returning ${cols.length} collections. First collection requests len: ${cols[0]?.requests?.length}`);
    return cols;
  }

  @Get(':id/export')
  export(@Param('id') id: string, @Request() req: any) {
    return this.collectionsService.export(id, req.user.sub);
  }

  @Post('import')
  import(@Body('workspaceId') workspaceId: string, @Body('data') data: any, @Request() req: any) {
    return this.collectionsService.import(workspaceId, data, req.user.sub);
  }

  @Post(':id/share')
  share(@Param('id') id: string, @Body('email') email: string, @Request() req: any) {
    return this.collectionsService.share(id, email, req.user.sub);
  }

  @Delete(':id/share/:userId')
  unshare(@Param('id') id: string, @Param('userId') userToUnshareId: string, @Request() req: any) {
    return this.collectionsService.unshare(id, userToUnshareId, req.user.sub);
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
