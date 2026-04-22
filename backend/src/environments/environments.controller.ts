import { Controller, Get, Post, Body, Param, Put, Delete, Query, UseGuards, Request } from '@nestjs/common';
import { EnvironmentsService } from './environments.service';
import { Environment } from './environment.entity';
import { AuthGuard } from '../auth/auth.guard';

@UseGuards(AuthGuard)
@Controller('environments')
export class EnvironmentsController {
  constructor(private readonly environmentsService: EnvironmentsService) {}

  @Post()
  create(@Body() data: Partial<Environment>, @Request() req: any) {
    return this.environmentsService.create(data, req.user.sub);
  }

  @Get()
  findAll(@Query('workspaceId') workspaceId: string, @Request() req: any) {
    if (!workspaceId) {
      throw new Error('workspaceId query parameter is required');
    }
    return this.environmentsService.findAllByWorkspace(workspaceId, req.user.sub);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.environmentsService.findOne(id, req.user.sub);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() data: Partial<Environment>, @Request() req: any) {
    return this.environmentsService.update(id, data, req.user.sub);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.environmentsService.remove(id, req.user.sub);
  }
}
