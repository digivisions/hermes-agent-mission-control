module.exports = {
  apps: [{
    name: "hermes-bridge",
    script: "bridge.mjs",
    cwd: "/home/andy/projects/hermy-hq/hermes-bridge",
    env: {
      DATABASE_URL: "postgresql://postgres:Nddx5zhX2kRLrh8T@db.qeekugudfqvxiykvtrcj.supabase.co:5432/postgres",
      HERMES_BOARD: "default",
      HERMES_BIN: "/home/andy/hermes-wrapper.sh",
      HERMES_WIKI: "/home/andy/wiki",
      INTERNAL_API_SECRET: "5d844224e02993bbcf318f85792e5caffa23798ddc2f324ad81716896f354ac0"
    },
    autorestart: true,
    watch: false,
    max_memory_restart: "500M"
  }]
}
