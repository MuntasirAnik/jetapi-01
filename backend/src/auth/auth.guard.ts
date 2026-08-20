import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);
    if (!token) {
      throw new UnauthorizedException();
    }
    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: 'YOUR_SECRET_KEY',
      });

      // Check if user is still active and token is not revoked
      const user = await this.usersService.findOneById(payload.sub);
      if (!user || !user.isActive) {
        throw new UnauthorizedException(
          'Your account has been deactivated. Please contact the administrator.',
        );
      }

      // Check token version — force logout invalidates old tokens
      if (
        payload.tokenVersion !== undefined &&
        user.tokenVersion !== undefined
      ) {
        if (payload.tokenVersion !== user.tokenVersion) {
          throw new UnauthorizedException(
            'Session expired. Please log in again.',
          );
        }
      }

      request['user'] = payload;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException();
    }
    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
