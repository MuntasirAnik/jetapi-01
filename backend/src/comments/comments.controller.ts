import { Controller, Get, Post, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { CommentsService } from './comments.service';
import { AuthGuard } from '../auth/auth.guard';

@UseGuards(AuthGuard)
@Controller('comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get('request/:requestId')
  findByRequest(@Param('requestId') requestId: string) {
    return this.commentsService.findByRequest(requestId);
  }

  @Post()
  create(@Body() data: { requestId: string; collectionId: string; content: string }, @Request() req: any) {
    return this.commentsService.create({
      userId: req.user.sub,
      userName: req.user.name || req.user.email?.split('@')[0] || 'User',
      userEmail: req.user.email,
      requestId: data.requestId,
      collectionId: data.collectionId,
      content: data.content,
    });
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.commentsService.remove(id, req.user.sub);
  }

  @Get('request/:requestId/count')
  count(@Param('requestId') requestId: string) {
    return this.commentsService.countByRequest(requestId);
  }
}
