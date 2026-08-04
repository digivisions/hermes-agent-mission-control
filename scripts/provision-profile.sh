#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# provision-profile.sh — stand up a Hermes profile for a client on the VPS.
#
# This is the scripted version of how `klaily` was provisioned by hand. It runs
# ON THE VPS, against the `hermes` docker container. It is never invoked by the
# app or the bridge — Andy (or Hermes, via a kanban task) runs it deliberately.
#
#   ./scripts/provision-profile.sh <client-slug> [profile-name]
#
# Env:
#   HERMES_CONTAINER   docker container name              (default: hermes)
#   TEMPLATE_PROFILE   profile to clone config/skills from (default: admin)
#   CLIENT_MODEL       model default for the new profile  (default: deepseek-v4-flash)
#   CLIENT_PROVIDER    provider for that model            (default: deepseek)
#   DEEPSEEK_API_KEY   written into the profile .env if the key is absent there
#   DATABASE_URL       if set and psql exists, flips Client.status to 'active'
#   DRY_RUN=1          print every command instead of running it
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SLUG="${1:-}"
PROFILE="${2:-$SLUG}"
CONTAINER="${HERMES_CONTAINER:-hermes}"
TEMPLATE="${TEMPLATE_PROFILE:-admin}"
MODEL="${CLIENT_MODEL:-deepseek-v4-flash}"
PROVIDER="${CLIENT_PROVIDER:-deepseek}"

die()  { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
ok()   { printf '\033[32m✓ %s\033[0m\n' "$*"; }
step() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }

[ -n "$SLUG" ] || die "usage: $0 <client-slug> [profile-name]"
[[ "$SLUG"    =~ ^[a-z0-9][a-z0-9-]*$ ]] || die "slug must be lowercase alphanumeric + dashes: '$SLUG'"
[[ "$PROFILE" =~ ^[a-z0-9][a-z0-9-]*$ ]] || die "profile must be lowercase alphanumeric + dashes: '$PROFILE'"

# All hermes invocations go through the container.
hx() {
  if [ "${DRY_RUN:-0}" = "1" ]; then printf '  DRY docker exec %s hermes %s\n' "$CONTAINER" "$*"; return 0; fi
  docker exec -i "$CONTAINER" hermes "$@"
}

step "0/6  Preflight"
command -v docker >/dev/null || die "docker not found — are you on the VPS?"
docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true \
  || die "container '$CONTAINER' is not running (docker ps)"
ok "container '$CONTAINER' is up"

step "1/6  Create profile '$PROFILE' (clone of '$TEMPLATE')"
if hx profile list 2>/dev/null | grep -qE "(^|[[:space:]])${PROFILE}([[:space:]]|$)"; then
  ok "profile '$PROFILE' already exists — skipping create (idempotent)"
else
  hx profile create "$PROFILE" \
     --clone-from "$TEMPLATE" \
     --description "Client workspace agent for ${SLUG}. Handles chat, reporting, and client-scoped tasks."
  ok "created"
fi

step "2/6  Pin model → $PROVIDER / $MODEL"
# Cloned config.yaml inherits the template's model (admin's may be an OpenAI
# model). Pin it explicitly — this is the cost decision, not a default.
hx --profile "$PROFILE" config set model.default  "$MODEL"
hx --profile "$PROFILE" config set model.provider "$PROVIDER"
ok "model pinned"

step "3/6  Profile .env"
if [ "${DRY_RUN:-0}" = "1" ]; then
  echo "  DRY  ensure DEEPSEEK_API_KEY in \$(hermes --profile $PROFILE config env-path)"
elif [ -z "${DEEPSEEK_API_KEY:-}" ]; then
  echo "  ⚠ DEEPSEEK_API_KEY not set in this shell — relying on the global auth store."
  echo "    If the smoke test fails on auth, re-run with: DEEPSEEK_API_KEY=… $0 $SLUG"
else
  ENV_PATH="$(docker exec -i "$CONTAINER" hermes --profile "$PROFILE" config env-path | tail -n 1 | tr -d '\r')"
  [ -n "$ENV_PATH" ] || die "could not resolve env-path for '$PROFILE'"
  # Key travels as an env var on the exec, never as an argv token (ps-safe).
  docker exec -i -e DS_KEY="$DEEPSEEK_API_KEY" "$CONTAINER" sh -c '
    set -e
    touch "$0"; chmod 600 "$0"
    if grep -q "^DEEPSEEK_API_KEY=" "$0" 2>/dev/null; then
      echo "  (key already present — left untouched)"
    else
      printf "DEEPSEEK_API_KEY=%s\n" "$DS_KEY" >> "$0"
      echo "  (key appended)"
    fi
  ' "$ENV_PATH"
  ok "env ready at $ENV_PATH"
fi

step "4/6  Smoke test"
if [ "${DRY_RUN:-0}" = "1" ]; then
  echo "  DRY  hermes --profile $PROFILE chat -q ping"
else
  SMOKE="$(timeout 120 docker exec -i "$CONTAINER" hermes --profile "$PROFILE" chat -q "ping" 2>&1)" \
    || die "smoke test FAILED for '$PROFILE':
$SMOKE"
  [ -n "$SMOKE" ] || die "smoke test returned empty output for '$PROFILE'"
  ok "smoke test passed — first 200 chars:"
  printf '  %s\n' "$(printf '%s' "$SMOKE" | head -c 200)"
fi

step "5/6  Registry"
SQL="UPDATE \"Client\" SET status='active', \"hermesProfile\"='${PROFILE}', model='${MODEL}', \"updatedAt\"=now() WHERE slug='${SLUG}';"
if [ "${DRY_RUN:-0}" = "1" ] || [ -z "${DATABASE_URL:-}" ] || ! command -v psql >/dev/null; then
  echo "  Run this against the app database to mark the client active:"
  printf '\n    psql "$DATABASE_URL" -c %s\n\n' "\"$SQL\""
else
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "$SQL"
  ok "Client '$SLUG' marked active"
fi

step "6/6  Done"
echo "  Profile:   $PROFILE"
echo "  Model:     $PROVIDER / $MODEL"
echo "  Workspace: https://myhq.digivisions.net/clients/$SLUG"
echo
echo "  If chat still doesn't answer, check the bridge:  pm2 logs hermes-bridge --lines 50"
