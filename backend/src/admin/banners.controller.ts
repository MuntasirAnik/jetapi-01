import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AdminService } from './admin.service';

@Controller('api/banners')
@UseGuards(AuthGuard)
export class BannersController {
  constructor(private adminService: AdminService) {}

  @Get('active')
  getActiveBanners() {
    return this.adminService.getActiveBanners();
  }
}
