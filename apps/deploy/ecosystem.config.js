// ───────────────────────────────────────────────────
//  PM2 Ecosystem Configuration
//  Masjid Al-Rahma Platform — Backend
// ───────────────────────────────────────────────────

module.exports = {
  apps: [
    {
      name: 'masjid-al-rahma-api',
      cwd: '/var/www/masjid-al-rahma/backend',
      script: 'dist/server.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      env_file: '.env.production',
      // Auto-restart on crash
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      // Logging
      error_file: '/var/log/masjid-al-rahma/error.log',
      out_file: '/var/log/masjid-al-rahma/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      // Graceful shutdown
      kill_timeout: 10000,
      listen_timeout: 5000,
    },
  ],
};