import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
  Patch,
  UseGuards,
  Request,
} from '@nestjs/common';
import { RequestsService } from './requests.service';
import { RequestItem } from './request.entity';
import { AuthGuard } from '../auth/auth.guard';

@UseGuards(AuthGuard)
@Controller('requests')
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  @Post()
  async create(@Body() data: Partial<RequestItem>, @Request() req: any) {
    return this.requestsService.create(data, req.user.sub);
  }

  @Patch('move')
  async moveRequest(
    @Body()
    body: {
      requestId: string;
      newFolder: string | null;
      newCollectionId?: string;
    },
    @Request() req: any,
  ) {
    return this.requestsService.moveRequest(
      body.requestId,
      body.newFolder,
      req.user.sub,
      body.newCollectionId,
    );
  }

  @Patch('move-folder')
  async moveFolder(
    @Body()
    body: {
      collectionId: string;
      oldPath: string;
      newPath: string;
      targetCollectionId?: string;
    },
    @Request() req: any,
  ) {
    return this.requestsService.moveFolder(
      body.collectionId,
      body.oldPath,
      body.newPath,
      req.user.sub,
      body.targetCollectionId,
    );
  }

  @Get()
  findAll(@Request() req: any) {
    return this.requestsService.findAll(req.user.sub);
  }

  @Get('trash')
  findTrash(@Request() req: any) {
    return this.requestsService.findTrash(req.user.sub);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.requestsService.findOne(id, req.user.sub);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() data: Partial<RequestItem>,
    @Request() req: any,
  ) {
    return this.requestsService.update(id, data, req.user.sub);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.requestsService.remove(id, req.user.sub);
  }

  @Post(':id/restore')
  restore(@Param('id') id: string, @Request() req: any) {
    return this.requestsService.restore(id, req.user.sub);
  }

  @Delete(':id/permanent')
  permanentDelete(@Param('id') id: string, @Request() req: any) {
    return this.requestsService.permanentDelete(id, req.user.sub);
  }
}
