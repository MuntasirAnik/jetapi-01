import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
  UseGuards,
  Request,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { WorkspacesService } from './workspaces.service';
import { Workspace } from './workspace.entity';
import { AuthGuard } from '../auth/auth.guard';

@UseGuards(AuthGuard)
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Post()
  create(@Body() data: Partial<Workspace>, @Request() req: any) {
    if (!data.organizationId)
      throw new BadRequestException('organizationId is required');
    return this.workspacesService.create(data, req.user.sub);
  }

  @Get()
  findAll(@Query('organizationId') orgId: string, @Request() req: any) {
    if (!orgId)
      throw new BadRequestException(
        'organizationId query parameter is required',
      );
    return this.workspacesService.findAllByOrg(orgId, req.user.sub);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.workspacesService.findOne(id, req.user.sub);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() data: Partial<Workspace>,
    @Request() req: any,
  ) {
    return this.workspacesService.update(id, data, req.user.sub);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.workspacesService.remove(id, req.user.sub);
  }
}
