/**
 * PM2: запуск в продакшене
 *   npm run build
 *   pm2 start ecosystem.config.cjs --env production
 * Файл .env в корне проекта подхватит Node через load-env (как при обычном старте).
 */
module.exports = {
  apps: [
    {
      name: 'vibetelegram',
      cwd: __dirname,
      script: 'server/index.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
}
