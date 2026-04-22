import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { OrganizationsModule } from '../organizations/organizations.module';

@Module({
  imports: [
    UsersModule,
    OrganizationsModule,
    JwtModule.register({
      global: true,
      secret: 'YOUR_SECRET_KEY',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  providers: [AuthService],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
