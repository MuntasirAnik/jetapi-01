import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AdminService } from './admin.service';

@Controller('feedback')
@UseGuards(AuthGuard)
export class FeedbackController {
  constructor(private adminService: AdminService) {}

  @Post()
  createTicket(
    @Body() body: { subject: string; description: string; type?: string; priority?: string; tags?: string },
    @Req() req: any,
  ) {
    return this.adminService.createTicket(body, req.user.sub);
  }

  @Get('my-tickets')
  getMyTickets(@Req() req: any) {
    return this.adminService.getUserTickets(req.user.sub);
  }
}
