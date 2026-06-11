import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'

const OUT_DIR = path.resolve(__dirname, '../public/docs/screenshots')
const EMAIL = process.env.DOCS_CAPTURE_EMAIL ?? 'admin@example.com'
const PASSWORD = process.env.DOCS_CAPTURE_PASSWORD ?? 'password'

fs.mkdirSync(OUT_DIR, { recursive: true })

async function login(page: Page) {
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  if (page.url().includes('/login')) {
    await page.fill('input[type="email"]', EMAIL)
    await page.fill('input[type="password"]', PASSWORD)
    await page.getByRole('button', { name: '로그인' }).first().click()
    await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 15_000 })
  }
}

async function shot(page: Page, name: string) {
  const file = path.join(OUT_DIR, `${name}.png`)
  await page.screenshot({ path: file, fullPage: false })
  console.log(`saved: ${file}`)
}

test.describe('AgentStudio docs screenshots', () => {
  test('login page', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(300)
    await shot(page, 'login')
  })

  test('dashboard + agents flows', async ({ page }) => {
    await login(page)

    await page.goto('/agents')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(500)
    await shot(page, 'agents-list')

    const newAgentBtn = page.getByRole('button', { name: /New Agent|새 에이전트/i }).first()
    if (await newAgentBtn.count()) {
      await newAgentBtn.click()
      await page.waitForTimeout(400)
      await shot(page, 'agents-new-modal')
      const cancelBtn = page.getByRole('button', { name: /취소|Cancel/i }).first()
      if (await cancelBtn.count()) {
        await cancelBtn.click().catch(() => {})
      } else {
        await page.keyboard.press('Escape')
      }
      await page.goto('/agents')
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(400)
    }

    let agentId: string | null = null
    const firstCard = page
      .locator('div.cursor-pointer.group, div[class*="cursor-pointer"][class*="rounded-xl"]')
      .first()
    if (await firstCard.count()) {
      await firstCard.click()
      try {
        await page.waitForURL(/\/agents\/[^\/?#]+/, { timeout: 8_000 })
        const match = page.url().match(/\/agents\/([^\/?#]+)/)
        if (match) agentId = match[1]
      } catch {
        console.warn('agent card click did not navigate')
      }
    }

    if (agentId) {
      await page.goto(`/agents/${agentId}`)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(1500)
      await shot(page, 'agent-builder')

      const settingsBtn = page
        .getByRole('button', { name: /Main Agent|설정/i })
        .first()
      if (await settingsBtn.count()) {
        await settingsBtn.click()
        await page.waitForTimeout(500)
        await shot(page, 'agent-builder-settings')
        await page.keyboard.press('Escape')
      }

      await page.goto(`/agents/${agentId}/deployments`)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(500)
      await shot(page, 'deployments')
    } else {
      console.warn('agent id not found — skipping builder/deployments shots')
    }

    await page.goto('/skills')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(500)
    await shot(page, 'skills')

    await page.goto('/tools')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(500)
    await shot(page, 'tools')

    await page.goto('/settings/providers')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(500)
    await shot(page, 'providers')

    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(500)
    await shot(page, 'dashboard')
  })

  test('client area', async ({ page }) => {
    await login(page)

    await page.goto('/client/agents')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(700)
    await shot(page, 'client-agents')

    const firstClientCard = page.locator('a[href^="/client/agents/"]').first()
    if (await firstClientCard.count()) {
      await firstClientCard.click()
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(700)
      await shot(page, 'client-agent-detail')
    }
  })
})

// keep TS happy if expect is unused
void expect
