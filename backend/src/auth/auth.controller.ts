import { Controller, Post, Patch, Body, UnauthorizedException, BadRequestException, HttpCode, HttpStatus, Get, UseGuards, Request, UseInterceptors, UploadedFile, Res, Param, NotFoundException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { UsersService } from '../users/users.service';
import { FeatureFlagGuard, RequireFeature } from '../admin/feature-flag.guard';

@Controller('api/auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private usersService: UsersService
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() signInDto: Record<string, any>, @Request() req: any) {
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
    const user = await this.authService.validateUser(signInDto.email, signInDto.password, ip);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.authService.login(user);
  }

  @Get('password-policy')
  async getPasswordPolicy() {
    return this.authService.getPublicPasswordPolicy();
  }

  @Post('register')
  @UseGuards(FeatureFlagGuard)
  @RequireFeature('allow_signups')
  async register(@Body() signUpDto: Record<string, any>) {
    if (!signUpDto.email || !signUpDto.password || !signUpDto.name) {
       throw new UnauthorizedException('Name, Email and password required');
    }
    return this.authService.register(signUpDto.name, signUpDto.email, signUpDto.password);
  }

  @Post('forgot-password')
  async forgotPassword(@Body('email') email: string) {
    if (!email) throw new BadRequestException('Email is required');
    return this.authService.forgotPassword(email);
  }

  @Post('reset-password')
  async resetPassword(@Body() body: Record<string, any>) {
    if (!body.token || !body.newPassword) throw new BadRequestException('Token and password are required');
    return this.authService.resetPassword(body.token, body.newPassword);
  }

  @UseGuards(AuthGuard)
  @Post('change-password')
  async changePassword(@Body() body: Record<string, any>, @Request() req: any) {
    if (!body.currentPassword || !body.newPassword) throw new BadRequestException('Current and new password required');
    return this.authService.changePassword(req.user.sub, body.currentPassword, body.newPassword);
  }

  @UseGuards(AuthGuard)
  @Get('me')
  async getProfile(@Request() req: any) {
    const user = await this.usersService.findOneByEmail(req.user.email);
    if (!user) {
      throw new UnauthorizedException('User not found on database. Token invalidated.');
    }
    const { passwordHash, avatarData, ...cleanUser } = user as any;
    const stats = await this.usersService.getUserStats(user.id);
    return { user: cleanUser, stats };
  }

  @UseGuards(AuthGuard)
  @Patch('profile')
  async updateProfile(@Body() body: { name?: string; company?: string; location?: string; bio?: string; website?: string; phone?: string }, @Request() req: any) {
    const data: any = {};
    if (body.name !== undefined) data.name = body.name.trim();
    if (body.company !== undefined) data.company = body.company.trim() || null;
    if (body.location !== undefined) data.location = body.location.trim() || null;
    if (body.bio !== undefined) data.bio = body.bio.trim() || null;
    if (body.website !== undefined) data.website = body.website.trim() || null;
    if (body.phone !== undefined) data.phone = body.phone.trim() || null;
    if (!Object.keys(data).length) throw new BadRequestException('Nothing to update');
    const updated = await this.usersService.updateUser(req.user.sub, data);
    if (!updated) throw new BadRequestException('User not found');
    const { passwordHash, avatarData, ...cleanUser } = updated as any;
    return { user: cleanUser };
  }

  @UseGuards(AuthGuard)
  @Post('profile/avatar')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 3.5 * 1024 * 1024 } }))
  async updateAvatar(@Request() req: any, @UploadedFile() file: any) {
    if (!file) throw new BadRequestException('Avatar payload is required');
    const user = await this.usersService.updateAvatar(req.user.sub, file.buffer, file.mimetype);
    if (!user) throw new BadRequestException('User not found');
    const { passwordHash, avatarData, ...cleanUser } = user as any;
    return { user: cleanUser };
  }

  @Get('users/:id/avatar')
  async getAvatar(@Param('id') id: string, @Res() res: any) {
    const user = await this.usersService.findOneById(id);
    if (!user || !user.avatarData) {
      throw new NotFoundException('Avatar not found');
    }
    let data = user.avatarData;
    let mime = user.avatarMimeType || 'image/jpeg';

    // Compress on-the-fly if the stored avatar is too large (> 100KB)
    if (data.length > 100 * 1024) {
      try {
        const sharp = require('sharp');
        data = await sharp(data)
          .resize(256, 256, { fit: 'cover', withoutEnlargement: false })
          .webp({ quality: 80 })
          .toBuffer();
        mime = 'image/webp';
        // Cache the compressed version back to DB in background
        this.usersService.updateUser(id, { avatarData: data, avatarMimeType: mime } as any).catch(() => {});
      } catch {}
    }

    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Length', data.length);
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    res.send(data);
  }

  @UseGuards(AuthGuard)
  @Get('users')
  async getAllUsers() {
    return this.usersService.getAllUsers();
  }
}
