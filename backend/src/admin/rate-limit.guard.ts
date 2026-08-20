import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemSetting } from './system-setting.entity';
import { Subscription } from '../subscriptions/subscription.entity';

export interface RateLimitConfig {
  enabled: boolean;
  windowMs: number; // window size in ms (default 3600000 = 1 hour)
  limits: { FREE: number; PRO: number; TEAM: number };
  overrides: Record<string, number>; // userId -> custom limit
}

interface UserWindow {
  count: number;
  windowStart: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  enabled: false,
  windowMs: 3600000, // 1 hour
  limits: { FREE: 100, PRO: 1000, TEAM: 5000 },
  overrides: {},
};

@Injectable()
export class RateLimitGuard implements CanActivate {
  // In-memory sliding window counters
  private windows = new Map<string, UserWindow>();
  private configCache: RateLimitConfig | null = null;
  private configCacheTime = 0;
  private readonly CONFIG_CACHE_TTL = 5_000; // 5s cache — keeps config changes responsive

  constructor(
    @InjectRepository(SystemSetting)
    private settingRepo: Repository<SystemSetting>,
    @InjectRepository(Subscription)
    private subRepo: Repository<Subscription>,
  ) {}

  async getConfig(): Promise<RateLimitConfig> {
    const now = Date.now();
    if (
      this.configCache &&
      now - this.configCacheTime < this.CONFIG_CACHE_TTL
    ) {
      return this.configCache;
    }
    try {
      const setting = await this.settingRepo.findOne({
        where: { key: 'rate_limit_config' },
      });
      this.configCache = setting
        ? { ...DEFAULT_CONFIG, ...JSON.parse(setting.value) }
        : { ...DEFAULT_CONFIG };
    } catch {
      this.configCache = { ...DEFAULT_CONFIG };
    }
    this.configCacheTime = now;
    return this.configCache!;
  }

  /** Force refresh config cache and clear counters (called after admin updates) */
  invalidateCache() {
    this.configCache = null;
    this.configCacheTime = 0;
    this.windows.clear();
  }

  /** Get live usage stats for all active windows */
  getUsageStats(): Array<{
    userId: string;
    count: number;
    windowStart: number;
  }> {
    const now = Date.now();
    const windowMs = this.configCache?.windowMs || DEFAULT_CONFIG.windowMs;
    const result: Array<{
      userId: string;
      count: number;
      windowStart: number;
    }> = [];

    for (const [userId, window] of this.windows.entries()) {
      // Skip expired windows
      if (now - window.windowStart > windowMs) continue;
      result.push({
        userId,
        count: window.count,
        windowStart: window.windowStart,
      });
    }

    return result;
  }

  /** Clean up expired windows periodically */
  private cleanup(windowMs: number) {
    const now = Date.now();
    for (const [userId, window] of this.windows.entries()) {
      if (now - window.windowStart > windowMs * 2) {
        this.windows.delete(userId);
      }
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const config = await this.getConfig();

    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const userId = request.user?.sub;
    if (!userId) return true;

    // Determine user's plan
    let plan = 'FREE';
    try {
      const sub = await this.subRepo.findOne({
        where: { userId, status: 'active' },
        order: { createdAt: 'DESC' },
        select: ['plan'],
      });
      if (sub?.plan) plan = sub.plan;
    } catch {}

    // Get limit for this user
    const limit =
      config.overrides[userId] ||
      config.limits[plan as keyof typeof config.limits] ||
      config.limits.FREE;

    const now = Date.now();
    let window = this.windows.get(userId);

    // Reset window if expired
    if (!window || now - window.windowStart > config.windowMs) {
      window = { count: 0, windowStart: now };
      this.windows.set(userId, window);
    }

    window.count++;

    // Always send rate limit headers so user sees their usage
    const remaining = Math.max(0, limit - window.count);
    const resetTime = Math.ceil((window.windowStart + config.windowMs) / 1000);
    response.setHeader('X-RateLimit-Limit', String(limit));
    response.setHeader('X-RateLimit-Remaining', String(remaining));
    response.setHeader('X-RateLimit-Reset', String(resetTime));

    // Only enforce (block) when rate limiting is enabled
    if (config.enabled && window.count > limit) {
      const retryAfter = Math.ceil(
        (window.windowStart + config.windowMs - now) / 1000,
      );
      response.setHeader('Retry-After', String(retryAfter));
      throw new HttpException(
        {
          statusCode: 429,
          message: `Rate limit exceeded. You are allowed ${limit} requests per ${config.windowMs / 60000} minutes on the ${plan} plan. Try again in ${retryAfter} seconds.`,
          error: 'Too Many Requests',
        },
        429,
      );
    }

    // Periodic cleanup (every 100th request)
    if (window.count % 100 === 0) {
      this.cleanup(config.windowMs);
    }

    return true;
  }
}
