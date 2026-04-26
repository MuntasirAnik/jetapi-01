import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private organizationsService: OrganizationsService,
    private jwtService: JwtService
  ) {}

  async validateUser(email: string, pass: string): Promise<any> {
    const user = await this.usersService.findOneByEmail(email);
    if (user && await bcrypt.compare(pass, user.passwordHash)) {
      const { passwordHash, ...result } = user;
      return result;
    }
    return null;
  }

  async login(user: any) {
    const payload = { email: user.email, sub: user.id, name: user.name, role: user.role || 'USER' };
    return {
      access_token: await this.jwtService.signAsync(payload),
      user: { id: user.id, email: user.email, name: user.name, role: user.role || 'USER' }
    };
  }

  async register(name: string, email: string, pass: string) {
    const existing = await this.usersService.findOneByEmail(email);
    if (existing) throw new BadRequestException('User already exists');
    const passwordHash = await bcrypt.hash(pass, 10);
    const user = await this.usersService.create({ name, email, passwordHash });
    
    // Auto-provision Personal Organization
    await this.organizationsService.create({ name: 'My Team', subscriptionTier: 'FREE' }, user.id);

    return this.login(user);
  }

  async forgotPassword(email: string) {
    const user = await this.usersService.findOneByEmail(email);
    if (!user) {
      // Return a 200 to prevent email enumeration attacks
      return { message: 'If that email exists, a reset link was generated.' };
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour

    await this.usersService.updateUser(user.id, { resetToken, resetTokenExpiry });

    // In a real app, send an email here. We simulate for MVP:
    console.log(`\n\n[DEV]: Password Reset Link for ${email}:\nhttp://localhost:3000/reset-password?token=${resetToken}\n\n`);

    return { message: 'Reset link generated. (Check server logs)', dev_token: resetToken };
  }

  async resetPassword(token: string, newPassword: string) {
    const user = await this.usersService.findByResetToken(token);
    
    if (!user || user.resetTokenExpiry < new Date()) {
       throw new BadRequestException('Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.usersService.updateUser(user.id, { passwordHash, resetToken: null as any, resetTokenExpiry: null as any });
    
    return { message: 'Password has been successfully reset.' };
  }

  async changePassword(userId: string, currentPass: string, newPass: string) {
    const user = await this.usersService.findOneById(userId);
    if (!user) throw new BadRequestException('User not found');

    const isValid = await bcrypt.compare(currentPass, user.passwordHash);
    if (!isValid) throw new UnauthorizedException('Current password is incorrect');

    const passwordHash = await bcrypt.hash(newPass, 10);
    await this.usersService.updateUser(user.id, { passwordHash });

    return { message: 'Password changed successfully.' };
  }
}
