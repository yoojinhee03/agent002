import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  decryptCredential,
  encryptCredential,
  lastFourOf,
  maskCredentialValue,
} from '../../common/credential-cipher'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateCredentialDto } from './dto/create-credential.dto'
import { UpdateCredentialDto } from './dto/update-credential.dto'

type Kind = 'provider' | 'tool' | 'mcp'
type Status = 'active' | 'invalid' | 'expired'

interface CredentialRow {
  id: string
  userId: string
  kind: Kind
  targetId: string
  label: string
  valueEnc: string
  metadata: unknown
  status: Status
  lastVerifiedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

@Injectable()
export class MeCredentialsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, kind?: Kind) {
    const rows = await this.prisma.userCredential.findMany({
      where: { userId, ...(kind ? { kind } : {}) },
      orderBy: { createdAt: 'desc' },
    })
    return rows.map((r) => this.toMaskedDto(r as CredentialRow))
  }

  async create(userId: string, dto: CreateCredentialDto) {
    const label = dto.label?.trim() ?? ''
    const valueEnc = encryptCredential(dto.value)

    try {
      const created = await this.prisma.userCredential.create({
        data: {
          userId,
          kind: dto.kind,
          targetId: dto.targetId,
          label,
          valueEnc,
          metadata: (dto.metadata as object) ?? null,
          status: 'active',
        },
      })
      return this.toMaskedDto(created as CredentialRow, dto.value)
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw new ConflictException(
          '이미 동일한 자격증명이 등록되어 있습니다 (kind+targetId+label 조합 중복).',
        )
      }
      throw err
    }
  }

  async update(userId: string, id: string, dto: UpdateCredentialDto) {
    const cred = await this.assertOwnership(userId, id)
    const data: Record<string, unknown> = {}
    if (dto.label !== undefined) data.label = dto.label.trim()
    if (dto.value !== undefined) data.valueEnc = encryptCredential(dto.value)
    if (dto.metadata !== undefined) data.metadata = dto.metadata as object

    if (Object.keys(data).length === 0) return this.toMaskedDto(cred)

    try {
      const updated = await this.prisma.userCredential.update({ where: { id }, data })
      const newPlain = dto.value ?? this.tryDecryptForDisplay(cred.valueEnc) ?? ''
      return this.toMaskedDto(updated as CredentialRow, newPlain)
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw new ConflictException(
          '동일한 자격증명이 이미 존재해 라벨을 변경할 수 없습니다.',
        )
      }
      throw err
    }
  }

  async delete(userId: string, id: string) {
    await this.assertOwnership(userId, id)
    await this.prisma.userCredential.delete({ where: { id } })
    return { id }
  }

  async test(userId: string, id: string) {
    const cred = await this.assertOwnership(userId, id)
    const plain = this.tryDecryptForDisplay(cred.valueEnc)
    if (!plain) {
      return { ok: false, status: 'invalid' as Status, message: 'decrypt failed' }
    }
    const result = await this.verifyByKind(cred.kind, cred.targetId, plain)
    await this.prisma.userCredential.update({
      where: { id },
      data: {
        status: result.ok ? 'active' : 'invalid',
        lastVerifiedAt: new Date(),
      },
    })
    return { ok: result.ok, status: result.ok ? 'active' : 'invalid', message: result.message }
  }

  // ----------------------------------------------------------------
  // helpers
  // ----------------------------------------------------------------

  private async assertOwnership(userId: string, id: string): Promise<CredentialRow> {
    const cred = await this.prisma.userCredential.findUnique({ where: { id } })
    if (!cred) throw new NotFoundException('자격증명을 찾을 수 없습니다.')
    if (cred.userId !== userId) {
      throw new ForbiddenException('본인 자격증명만 수정/삭제할 수 있습니다.')
    }
    return cred as CredentialRow
  }

  private toMaskedDto(row: CredentialRow, plainOverride?: string) {
    let plain = plainOverride
    if (!plain) plain = this.tryDecryptForDisplay(row.valueEnc) ?? ''
    return {
      id: row.id,
      userId: row.userId,
      kind: row.kind,
      targetId: row.targetId,
      label: row.label,
      metadata: row.metadata ?? null,
      status: row.status,
      lastVerifiedAt: row.lastVerifiedAt ? row.lastVerifiedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      maskedValue: maskCredentialValue(plain),
      lastFour: lastFourOf(plain),
    }
  }

  private tryDecryptForDisplay(valueEnc: string): string | null {
    try {
      return decryptCredential(valueEnc)
    } catch {
      return null
    }
  }

  /**
   * provider/tool/mcp 별 실 호출 검증.
   * 현재 구현은 Phase 10-4 첫 단계 — provider 일부에 대해서만 실 ping, 그 외는 형식 sanity.
   * 후속 Phase 에서 OAuth refresh / mcp ping 등 확장.
   */
  private async verifyByKind(
    kind: Kind,
    targetId: string,
    plain: string,
  ): Promise<{ ok: boolean; message: string }> {
    if (!plain || plain.length < 4) {
      return { ok: false, message: '값이 너무 짧습니다.' }
    }

    if (kind === 'provider') {
      const slug = targetId.toLowerCase()
      try {
        if (slug === 'openai') {
          const res = await fetch('https://api.openai.com/v1/models', {
            method: 'GET',
            headers: { Authorization: `Bearer ${plain}` },
          })
          return res.ok
            ? { ok: true, message: 'OpenAI 키 검증 성공' }
            : { ok: false, message: `OpenAI 응답 ${res.status}` }
        }
        if (slug === 'anthropic') {
          const res = await fetch('https://api.anthropic.com/v1/models', {
            method: 'GET',
            headers: {
              'x-api-key': plain,
              'anthropic-version': '2023-06-01',
            },
          })
          return res.ok
            ? { ok: true, message: 'Anthropic 키 검증 성공' }
            : { ok: false, message: `Anthropic 응답 ${res.status}` }
        }
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : 'verify failed' }
      }
    }

    // 기본: 형식 sanity 만 확인 (실 ping 미구현)
    return { ok: true, message: 'sanity check 통과 (실 호출 검증 미구현 — 후속 단계)' }
  }

  private isUniqueViolation(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code?: string }).code === 'P2002'
    )
  }
}
