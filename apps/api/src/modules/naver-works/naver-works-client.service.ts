import { Injectable, Logger } from '@nestjs/common'
import type { NaverWorksContent } from './naver-works-content.util'

const WORKS_API_BASE = 'https://www.worksapis.com/v1.0'

@Injectable()
export class NaverWorksClient {
  private readonly logger = new Logger(NaverWorksClient.name)

  /**
   * 봇 → 사용자 1:1 메시지 전송. 성공 시 201.
   * contents 리스트가 들어오면 순차적으로 전송한다(긴 텍스트 분할 송신).
   */
  async sendUserMessages(params: {
    botId: string
    accessToken: string
    naverUserId: string
    contents: NaverWorksContent[]
  }): Promise<void> {
    const { botId, accessToken, naverUserId, contents } = params
    for (const content of contents) {
      await this.sendOne({ botId, accessToken, naverUserId, content })
    }
  }

  private async sendOne(params: {
    botId: string
    accessToken: string
    naverUserId: string
    content: NaverWorksContent
  }): Promise<void> {
    const { botId, accessToken, naverUserId, content } = params
    const url = `${WORKS_API_BASE}/bots/${encodeURIComponent(botId)}/users/${encodeURIComponent(naverUserId)}/messages`

    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
      })
    } catch (err) {
      this.logger.error(
        `NAVER WORKS 메시지 전송 네트워크 오류 (botId=${botId}, userId=${naverUserId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
      throw err
    }

    if (res.status !== 201 && !res.ok) {
      const text = await res.text().catch(() => '')
      this.logger.error(
        `NAVER WORKS 메시지 전송 실패 HTTP ${res.status} (botId=${botId}, userId=${naverUserId}): ${text.slice(0, 300)}`,
      )
      throw new Error(`NAVER WORKS send failed: HTTP ${res.status}`)
    }
  }
}
