module.exports = {
  apps: [{
    name: 'hermy-hq',
    script: 'node_modules/.bin/next',
    args: 'start -p 3002',
    cwd: '/home/andy/projects/hermy-hq',
    env: {
      NODE_ENV: 'production',
      PORT: 3002
    },
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G'
  }]
}
