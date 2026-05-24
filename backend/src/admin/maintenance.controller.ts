import { Controller, Get } from '@nestjs/common';
import { AdminService } from './admin.service';

@Controller('api/maintenance')
export class MaintenanceController {
  constructor(private adminService: AdminService) {}

  @Get()
  getStatus() {
    return this.adminService.getMaintenanceMode();
  }
}

@Controller('api/feature-flags')
export class FeatureFlagsController {
  constructor(private adminService: AdminService) {}

  @Get()
  getFlags() {
    return this.adminService.getPublicFeatureFlags();
  }
}

@Controller('api/changelog')
export class ChangelogController {
  constructor(private adminService: AdminService) {}

  @Get()
  getPublicChangelogs() {
    return this.adminService.getPublicChangelogs();
  }
}
