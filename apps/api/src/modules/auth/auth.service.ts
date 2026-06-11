import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { randomUUID } from 'crypto'
import * as bcrypt from 'bcrypt'
import { PrismaService } from '../../prisma/prisma.service'
import { LoginDto } from './dto/login.dto'
import { RefreshTokenDto } from './dto/refresh-token.dto'
import { ForgotPasswordDto } from './dto/forgot-password.dto'
import { ResetPasswordDto } from './dto/reset-password.dto'

@Injectable()
export class AuthService {
  private readonly REFRESH_TOKEN_EXPIRY_DAYS = 7

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    })

    if (!user) {
      throw new UnauthorizedException('Invalid email or password')
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password)
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password')
    }

    if (user.status !== 'active') {
      throw new UnauthorizedException('Account is not active')
    }

    const tokens = await this.generateTokens(user.id, user.email)

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        status: user.status,
        role: user.role,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
      },
      ...tokens,
    }
  }

  async logout(userId: string) {
    await this.prisma.refreshToken.deleteMany({
      where: { userId },
    })

    return { message: 'Logged out successfully' }
  }

  async refresh(dto: RefreshTokenDto) {
    const storedToken = await this.prisma.refreshToken.findFirst({
      where: {
        token: dto.refreshToken,
        expiresAt: { gt: new Date() },
      },
    })

    if (!storedToken) {
      throw new UnauthorizedException('Invalid or expired refresh token')
    }

    // Delete old refresh token
    await this.prisma.refreshToken.deleteMany({
      where: { id: storedToken.id },
    })

    // Get user
    const user = await this.prisma.user.findUnique({
      where: { id: storedToken.userId },
    })

    if (!user) {
      throw new UnauthorizedException('User not found')
    }

    const tokens = await this.generateTokens(user.id, user.email)

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    }
  }

  async forgotPassword(_dto: ForgotPasswordDto) {
    // Stub: Always return success to avoid email enumeration
    return { message: 'Password reset email sent' }
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    })

    if (!user) {
      throw new UnauthorizedException('Invalid reset request')
    }

    // TODO: Validate the reset token from DB
    const hashedPassword = await bcrypt.hash(dto.newPassword, 12)

    await this.prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    })

    return { message: 'Password reset successfully' }
  }

  private async generateTokens(userId: string, email: string) {
    const payload = { sub: userId, email }

    const accessToken = this.jwtService.sign(payload)

    const refreshToken = randomUUID()
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + this.REFRESH_TOKEN_EXPIRY_DAYS)

    await this.prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId,
        expiresAt,
      },
    })

    return { accessToken, refreshToken }
  }
}
