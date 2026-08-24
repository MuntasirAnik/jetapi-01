import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemSetting } from './system-setting.entity';

export const FEATURE_FLAG_KEY = 'feature_flag';
export const RequireFeature =
  (flag: string) => (target: any, key?: string, descriptor?: any) => {
    Reflect.defineMetadata(FEATURE_FLAG_KEY, flag, descriptor?.value || target);
    return descriptor || target;
  };

@Injectable()
export class FeatureFlagGuard implements CanActivate {
  constructor(
    @InjectRepository(SystemSetting)
    private settingRepo: Repository<SystemSetting>,
    private reflector: Reflector,
  ) {}

  private readonly DEFAULTS: Record<string, boolean> = {
    allow_signups: true,
    allow_api_execution: true,
    show_pricing: true,
    allow_subscriptions: true,
    require_email_verification: false,
    allow_collection_upload: true,
    allow_variable_upload: true,
    allow_messaging: true,
  };

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const flag = this.reflector.get<string>(
      FEATURE_FLAG_KEY,
      context.getHandler(),
    );
    if (!flag) return true;

    const setting = await this.settingRepo.findOne({
      where: { key: 'feature_flags' },
    });
    const flags: Record<string, boolean> = setting
      ? JSON.parse(setting.value)
      : {};
    const enabled =
      flags[flag] !== undefined ? flags[flag] : (this.DEFAULTS[flag] ?? true);

    if (!enabled) {
      throw new ForbiddenException(
        `This feature is currently disabled by the administrator.`,
      );
    }
    return true;
  }
}
