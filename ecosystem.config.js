const BASE = '/home/workspace/agent002'

module.exports = {
  apps: [
    {
      name: 'api',
      cwd: `${BASE}/apps/api`,
      script: 'node',
      args: 'dist/main.js',
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 28001,
        CORS_ORIGINS: 'http://dweax.iptime.org:28002',
        RUNNER_URL: 'http://localhost:28003',
      },
    },
    {
      name: 'web',
      cwd: `${BASE}/apps/agent-web/.next/standalone/apps/agent-web`,
      script: 'node',
      args: 'server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 28002,
        HOSTNAME: '0.0.0.0',
      },
    },
    {
      name: 'runner',
      cwd: `${BASE}/apps/agent-runner-py`,
      script: `${BASE}/apps/agent-runner-py/.venv/bin/uvicorn`,
      args: 'src.main:app --host 0.0.0.0 --port 28003',
      interpreter: 'none',
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        PUBLIC_OAUTH_CALLBACK_URL: 'http://dweax.iptime.org:28003/oauth/callback',
      },
    },
  ],
}
