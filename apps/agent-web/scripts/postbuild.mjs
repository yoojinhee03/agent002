import { cpSync, rmSync } from 'fs'

const standalone = '.next/standalone/apps/agent-web'

rmSync(`${standalone}/.next/static`, { recursive: true, force: true })
rmSync(`${standalone}/public`, { recursive: true, force: true })
cpSync('.next/static', `${standalone}/.next/static`, { recursive: true })
cpSync('public', `${standalone}/public`, { recursive: true })
