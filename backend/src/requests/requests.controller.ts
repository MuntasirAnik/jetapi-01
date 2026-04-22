import { Controller, Get, Post, Body, Param, Put, Delete, UseGuards, Request } from '@nestjs/common';
import { RequestsService } from './requests.service';
import { RequestItem } from './request.entity';
import { AuthGuard } from '../auth/auth.guard';

@UseGuards(AuthGuard)
@Controller('requests')
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  @Post()
  create(@Body() data: Partial<RequestItem>, @Request() req: any) {
    return this.requestsService.create(data, req.user.sub);
  }

  @Get()
  findAll(@Request() req: any) {
    return this.requestsService.findAll(req.user.sub);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.requestsService.findOne(id, req.user.sub);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() data: Partial<RequestItem>, @Request() req: any) {
    return this.requestsService.update(id, data, req.user.sub);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.requestsService.remove(id, req.user.sub);
  }
}
