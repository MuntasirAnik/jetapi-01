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
  ForbiddenException,
} from '@nestjs/common';
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

  @Get('pending')
  findPending(@Request() req: any) {
    return this.organizationsService.findAllPendingForUser(req.user.sub);
  }

  @Post('pending/:orgUserId/accept')
  acceptInvite(@Param('orgUserId') orgUserId: string, @Request() req: any) {
    return this.organizationsService.acceptInvite(orgUserId, req.user.sub);
  }

  @Post('pending/:orgUserId/decline')
  declineInvite(@Param('orgUserId') orgUserId: string, @Request() req: any) {
    return this.organizationsService.declineInvite(orgUserId, req.user.sub);
  }

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
  inviteUser(
    @Param('id') id: string,
    @Body('email') email: string,
    @Request() req: any,
  ) {
    return this.organizationsService.inviteUser(id, email, req.user.sub);
  }

  @Delete(':id/users/:userId')
  removeUser(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Request() req: any,
  ) {
    return this.organizationsService.removeUser(id, userId, req.user.sub);
  }
}
