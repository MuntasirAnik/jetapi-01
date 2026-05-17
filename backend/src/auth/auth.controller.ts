import { Controller, Post, Body, UnauthorizedException, BadRequestException, HttpCode, HttpStatus, Get, UseGuards, Request, UseInterceptors, UploadedFile, Res, Param, NotFoundException } from '@nestjs/common';
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
    res.setHeader('Content-Type', user.avatarMimeType || 'image/jpeg');
    res.send(user.avatarData);
  }

  @UseGuards(AuthGuard)
  @Get('users')
  async getAllUsers() {
    return this.usersService.getAllUsers();
  }
}
