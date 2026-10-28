import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AuthService } from './auth.service';
import type { AuthProfile, AuthSession } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Exchange an email and password for a new session' })
  login(@Body() loginDto: LoginDto): Promise<AuthSession> {
    return this.authService.login(loginDto);
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate a refresh token into a new session' })
  refresh(@Body() dto: RefreshTokenDto): Promise<AuthSession> {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Revoke a refresh token' })
  logout(@Body() dto: RefreshTokenDto): Promise<{ message: string }> {
    return this.authService.logout(dto.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "The current user's profile, roles, and permissions",
  })
  me(@CurrentUser() user: AuthenticatedUser): Promise<AuthProfile> {
    return this.authService.getProfile(user.id);
  }
}
