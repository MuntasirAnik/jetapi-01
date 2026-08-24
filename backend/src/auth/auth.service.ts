import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { SystemSetting } from '../admin/system-setting.entity';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSpecial: boolean;
}

const DEFAULT_POLICY: PasswordPolicy = {
  minLength: 6,
  requireUppercase: false,
  requireLowercase: false,
  requireNumber: false,
  requireSpecial: false,
};

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private organizationsService: OrganizationsService,
    private jwtService: JwtService,
    private configService: ConfigService,
    @InjectRepository(SystemSetting)
    private settingRepo: Repository<SystemSetting>,
  ) {}

  private async getPasswordPolicy(): Promise<PasswordPolicy> {
    try {
      const setting = await this.settingRepo.findOne({
        where: { key: 'password_policy' },
      });
      if (setting) return { ...DEFAULT_POLICY, ...JSON.parse(setting.value) };
    } catch {}
    return DEFAULT_POLICY;
  }

  async getPublicPasswordPolicy() {
    return this.getPasswordPolicy();
  }

  private validatePasswordPolicy(
    password: string,
    policy: PasswordPolicy,
  ): string | null {
    if (password.length < policy.minLength)
      return `Password must be at least ${policy.minLength} characters`;
    if (policy.requireUppercase && !/[A-Z]/.test(password))
      return 'Password must contain an uppercase letter';
    if (policy.requireLowercase && !/[a-z]/.test(password))
      return 'Password must contain a lowercase letter';
    if (policy.requireNumber && !/[0-9]/.test(password))
      return 'Password must contain a number';
    if (
      policy.requireSpecial &&
      !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
    )
      return 'Password must contain a special character';
    return null;
  }

  async validateUser(email: string, pass: string, ip?: string): Promise<any> {
    const user = await this.usersService.findOneByEmail(email);
    if (!user) return null;

    // Check if account is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw new UnauthorizedException(
        `Account is locked. Try again in ${mins} minute(s).`,
      );
    }

    if (!user.isActive) {
      throw new UnauthorizedException(
        'Your account has been deactivated. Please contact the administrator.',
      );
    }

    if (await bcrypt.compare(pass, user.passwordHash)) {
      // Successful login — reset failed attempts and record login info
      await this.usersService.updateUser(user.id, {
        failedLoginAttempts: 0,
        lockedUntil: null as any,
        lastLoginAt: new Date(),
        lastLoginIp: ip || undefined,
      });

      const { passwordHash, ...result } = user;
      return result;
    }

    // Failed login — increment attempts
    const attempts = (user.failedLoginAttempts || 0) + 1;
    const updateData: any = { failedLoginAttempts: attempts };

    if (attempts >= 5) {
      updateData.lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 min lockout
    }

    await this.usersService.updateUser(user.id, updateData);

    if (attempts >= 5) {
      throw new UnauthorizedException(
        'Too many failed attempts. Account locked for 15 minutes.',
      );
    }

    return null;
  }

  async login(user: any) {
    const payload = {
      email: user.email,
      sub: user.id,
      name: user.name,
      role: user.role || 'USER',
      tokenVersion: user.tokenVersion || 0,
    };
    return {
      access_token: await this.jwtService.signAsync(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role || 'USER',
        avatarMimeType: user.avatarMimeType || null,
      },
    };
  }

  async register(name: string, email: string, pass: string) {
    const existing = await this.usersService.findOneByEmail(email);
    
    // Enforce password policy
    const policy = await this.getPasswordPolicy();
    const policyError = this.validatePasswordPolicy(pass, policy);
    if (policyError) throw new BadRequestException(policyError);

    if (existing) {
      if (existing.passwordHash === 'external-invite-no-password') {
        const passwordHash = await bcrypt.hash(pass, 10);
        await this.usersService.updateUser(existing.id, {
          name,
          passwordHash,
        });
        const updatedUser = await this.usersService.findOneById(existing.id);
        if (!updatedUser) throw new BadRequestException('User not found');

        // Auto-provision Personal Organization
        await this.organizationsService.create(
          { name: 'My Team', subscriptionTier: 'FREE' },
          updatedUser.id,
        );

        return this.login(updatedUser);
      }
      throw new BadRequestException('User already exists');
    }

    const passwordHash = await bcrypt.hash(pass, 10);
    const user = await this.usersService.create({ name, email, passwordHash });

    // Auto-provision Personal Organization
    await this.organizationsService.create(
      { name: 'My Team', subscriptionTier: 'FREE' },
      user.id,
    );

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

    await this.usersService.updateUser(user.id, {
      resetToken,
      resetTokenExpiry,
    });

    // In a real app, send an email here. We simulate for MVP:
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    console.log(
      `\n\n[DEV]: Password Reset Link for ${email}:\n${frontendUrl}/reset-password?token=${resetToken}\n\n`,
    );

    return {
      message: 'Reset link generated. (Check server logs)',
      dev_token: resetToken,
    };
  }

  async resetPassword(token: string, newPassword: string) {
    const user = await this.usersService.findByResetToken(token);

    if (!user || user.resetTokenExpiry < new Date()) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    // Enforce password policy
    const policy = await this.getPasswordPolicy();
    const policyError = this.validatePasswordPolicy(newPassword, policy);
    if (policyError) throw new BadRequestException(policyError);

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.usersService.updateUser(user.id, {
      passwordHash,
      resetToken: null as any,
      resetTokenExpiry: null as any,
    });

    return { message: 'Password has been successfully reset.' };
  }

  async changePassword(userId: string, currentPass: string, newPass: string) {
    const user = await this.usersService.findOneById(userId);
    if (!user) throw new BadRequestException('User not found');

    const isValid = await bcrypt.compare(currentPass, user.passwordHash);
    if (!isValid)
      throw new UnauthorizedException('Current password is incorrect');

    // Enforce password policy
    const policy = await this.getPasswordPolicy();
    const policyError = this.validatePasswordPolicy(newPass, policy);
    if (policyError) throw new BadRequestException(policyError);

    const passwordHash = await bcrypt.hash(newPass, 10);
    await this.usersService.updateUser(user.id, { passwordHash });

    return { message: 'Password changed successfully.' };
  }
}
