#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# seed-profile-context.sh — write hermes-context/<clients|projects>/<slug>/
# {MEMORY.md,SKILL.md} into a Hermes profile's memories/ and skills/ dirs,
# inside the `hermes` docker container.
#
# This runs ON THE VPS, against the `hermes` container — same family as
# provision-profile.sh, same die/ok/step/hx idioms, same DRY_RUN convention.
# It never brings a profile into existence; that is provision-profile.sh's
# job. It is re-runnable: a sha marker on line 1 of the seeded MEMORY.md
# makes a repeat run with unchanged content a no-op.
#
#   scripts/seed-profile-context.sh [--all | <slug> …] [--kind clients|projects] [--dry-run] [--force]
#
# Env:
#   HERMES_CONTAINER   docker container name              (default: hermes)
#   CONTEXT_DIR        repo dir holding the seed content   (default: hermes-context)
#   DATABASE_URL       required to resolve Client/Project.hermesProfile (psql)
#   DRY_RUN=1          print every write instead of running it (same as --dry-run)
#
# Design note on DRY_RUN and reads: unlike provision-profile.sh's hx(), the
# read-only docker execs here (profile-list check, marker read, post-write
# verify) run for real even under --dry-run — a dry run needs real state to
# report whether a slug is unchanged, would-be-created-fresh, or missing its
# profile. Only WRITES (mkdir -p, backup, cat >) are gated behind DRY_RUN and
# print "DRY docker exec …" instead of running, mirroring provision-profile.sh:41-45.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

CONTAINER="${HERMES_CONTAINER:-hermes}"
CONTEXT_DIR="${CONTEXT_DIR:-hermes-context}"
DRY_RUN="${DRY_RUN:-0}"
FORCE=0
KIND=""
ALL=0
SLUGS=()

die()  { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; }
ok()   { printf '\033[32m✓ %s\033[0m\n' "$*"; }
step() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }
warn() { printf '\033[33m⚠ %s\033[0m\n' "$*"; }

usage() {
  cat >&2 <<'EOF'
Usage: scripts/seed-profile-context.sh [--all | <slug> …] [--kind clients|projects] [--dry-run] [--force]

Env: HERMES_CONTAINER=hermes   CONTEXT_DIR=hermes-context
EOF
  exit 1
}

while [ $# -gt 0 ]; do
  case "$1" in
    --all)       ALL=1; shift ;;
    --kind)      KIND="${2:-}"; shift 2 ;;
    --kind=*)    KIND="${1#*=}"; shift ;;
    --dry-run)   DRY_RUN=1; shift ;;
    --force)     FORCE=1; shift ;;
    -h|--help)   usage ;;
    --*)         die "unknown flag: $1"; usage ;;
    *)           SLUGS+=("$1"); shift ;;
  esac
done

[ -n "$KIND" ] && [ "$KIND" != "clients" ] && [ "$KIND" != "projects" ] \
  && { die "invalid --kind '$KIND' (must be clients|projects)"; exit 1; }

[ "$ALL" -eq 1 ] || [ "${#SLUGS[@]}" -gt 0 ] || usage

# All hermes invocations against the container, WRITES only. Reads (profile
# list, marker line, verify line) call docker directly and are never dry-gated.
hxw() {
  if [ "$DRY_RUN" = "1" ]; then printf '  DRY docker exec %s %s\n' "$CONTAINER" "$*"; return 0; fi
  docker exec -i "$CONTAINER" "$@"
}

step "Preflight"
command -v docker     >/dev/null || { die "docker not found — are you on the VPS?"; exit 1; }
command -v sha256sum  >/dev/null || { die "sha256sum not found"; exit 1; }
command -v sed        >/dev/null || { die "sed not found"; exit 1; }
docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true \
  || { die "container '$CONTAINER' is not running (docker ps)"; exit 1; }
[ -f "$CONTEXT_DIR/_lib/rewrite-paths.sed" ] \
  || { die "$CONTEXT_DIR/_lib/rewrite-paths.sed not found — run from the repo root"; exit 1; }
if [ -z "${DATABASE_URL:-}" ] || ! command -v psql >/dev/null; then
  die "DATABASE_URL + psql are required to resolve Client/Project.hermesProfile"; exit 1
fi
ok "preflight passed"

KINDS_TO_SCAN=()
if [ -n "$KIND" ]; then KINDS_TO_SCAN=("$KIND"); else KINDS_TO_SCAN=(clients projects); fi

# Build the (kind, slug) work list.
WORK=()
BAD_SLUGS=0
if [ "$ALL" -eq 1 ]; then
  for k in "${KINDS_TO_SCAN[@]}"; do
    [ -d "$CONTEXT_DIR/$k" ] || continue
    for d in "$CONTEXT_DIR/$k"/*/; do
      [ -d "$d" ] || continue
      WORK+=("$k:$(basename "$d")")
    done
  done
else
  for s in "${SLUGS[@]}"; do
    [[ "$s" =~ ^[a-z0-9][a-z0-9-]*$ ]] || { die "slug must be lowercase alphanumeric + dashes: '$s'"; exit 1; }
    found=0
    for k in "${KINDS_TO_SCAN[@]}"; do
      [ -d "$CONTEXT_DIR/$k/$s" ] && { WORK+=("$k:$s"); found=1; }
    done
    if [ "$found" -eq 0 ]; then
      die "no $CONTEXT_DIR/{$( IFS=,; echo "${KINDS_TO_SCAN[*]}")}/$s directory found"
      BAD_SLUGS=$((BAD_SLUGS + 1))
    fi
  done
fi

FAIL=$BAD_SLUGS
TOTAL=${#WORK[@]}

seed_one() {
  local kind="$1" slug="$2"
  local table src_dir profile

  case "$kind" in
    clients)  table="Client"  ;;
    projects) table="Project" ;;
  esac
  src_dir="$CONTEXT_DIR/$kind/$slug"

  # SAME_AS pointer — content lives elsewhere (e.g. projects/immersive-travel-asia
  # reuses clients/immersive-travel-asia verbatim; two copies drift, a pointer cannot).
  if [ -f "$src_dir/SAME_AS" ]; then
    local target
    target="$(tr -d '[:space:]' < "$src_dir/SAME_AS")"
    [ -d "$CONTEXT_DIR/$target" ] || { die "$slug: SAME_AS target '$target' does not exist"; return 1; }
    src_dir="$CONTEXT_DIR/$target"
  fi

  [ -f "$src_dir/MEMORY.md" ] || { warn "$slug ($kind): no MEMORY.md in $src_dir — skipping"; return 0; }

  step "$slug ($kind)"

  # 1. Resolve profile. Never invent one from the slug.
  profile="$(psql "$DATABASE_URL" -tAc "SELECT \"hermesProfile\" FROM \"$table\" WHERE slug='$slug';" 2>/dev/null | tr -d '[:space:]')"
  if [ -z "$profile" ]; then
    warn "$slug: hermesProfile is NULL/absent in $table — skipping (not an error)"
    return 0
  fi

  # 2. Refuse to create.
  if ! docker exec "$CONTAINER" hermes profile list 2>/dev/null | grep -qx "$profile"; then
    die "$slug: profile '$profile' does not exist — run ./scripts/provision-profile.sh $slug first"
    return 1
  fi

  # 3. Rewrite paths.
  local tmp memory_rw skill_rw
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN
  sed -f "$CONTEXT_DIR/_lib/rewrite-paths.sed" "$src_dir/MEMORY.md" > "$tmp/MEMORY.md"
  memory_rw="$tmp/MEMORY.md"
  if [ -f "$src_dir/SKILL.md" ]; then
    sed -f "$CONTEXT_DIR/_lib/rewrite-paths.sed" "$src_dir/SKILL.md" > "$tmp/SKILL.md"
    skill_rw="$tmp/SKILL.md"
  fi

  local leaks
  leaks="$(grep -nE '/Users/|/Volumes/|Obsidian Vault' "$memory_rw" ${skill_rw:+"$skill_rw"} || true)"
  if [ -n "$leaks" ]; then
    die "$slug: a Mac path survived rewriting — fix rewrite-paths.sed or the source prose:
$leaks"
    return 1
  fi

  # Marker is computed here, not stored in the repo source — it can't hash
  # itself. sha covers MEMORY.md + SKILL.md together: an edit to either
  # invalidates the pair's idempotency, even though the marker only lives on
  # MEMORY.md's line 1 (SKILL.md frontmatter must stay on its own line 1).
  local sha marker now
  sha="$(cat "$memory_rw" ${skill_rw:+"$skill_rw"} | sha256sum | cut -c1-12)"
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  marker="<!-- hermes-context v1 slug=$slug sha=$sha seeded=$now -->"

  # 4. Enforce budget — on the file as Hermes will actually load it (marker
  # included). No head -c. Ever. Die, don't truncate.
  local final_memory memory_bytes
  final_memory="$tmp/MEMORY.final.md"
  { printf '%s\n' "$marker"; cat "$memory_rw"; } > "$final_memory"
  memory_bytes="$(wc -c < "$final_memory" | tr -d '[:space:]')"
  if [ "$memory_bytes" -gt 2200 ]; then
    die "$slug: MEMORY.md is $memory_bytes bytes, limit 2200 (config.yaml:350) — distil it, the seeder will not truncate"
    return 1
  fi

  # 5. Sha-stamp + idempotency.
  local remote_line1 remote_sha mem_path skill_dir skill_path today
  mem_path="/opt/data/profiles/$profile/memories/MEMORY.md"
  skill_dir="/opt/data/profiles/$profile/skills/${slug}-operations"
  skill_path="$skill_dir/SKILL.md"
  remote_line1="$(docker exec "$CONTAINER" sh -c 'sed -n "1p" "$0" 2>/dev/null' "$mem_path" || true)"
  remote_sha="$(printf '%s' "$remote_line1" | sed -n 's/.*sha=\([0-9a-f]\{12\}\).*/\1/p')"
  if [ "$FORCE" -ne 1 ] && [ -n "$remote_sha" ] && [ "$remote_sha" = "$sha" ]; then
    ok "= $slug unchanged (sha=$sha)"
    return 0
  fi

  # 6. Back up before write — once per day.
  today="$(date -u +%Y%m%d)"
  hxw sh -c 'f="$0"; b="${f}.bak-$1"; [ -f "$b" ] || { [ -f "$f" ] && cp "$f" "$b"; } ; true' "$mem_path" "$today"

  # 7. Write (stdin, never argv — content has quotes, §, and newlines).
  hxw sh -c 'mkdir -p "$0"' "$skill_dir"
  if [ "$DRY_RUN" = "1" ]; then
    printf '  DRY docker exec %s sh -c '"'"'cat > "%s"'"'"' < %s\n' "$CONTAINER" "$mem_path" "$final_memory"
    [ -n "${skill_rw:-}" ] && printf '  DRY docker exec %s sh -c '"'"'cat > "%s"'"'"' < %s\n' "$CONTAINER" "$skill_path" "$skill_rw"
  else
    docker exec -i "$CONTAINER" sh -c 'cat > "$0"' "$mem_path" < "$final_memory"
    [ -n "${skill_rw:-}" ] && docker exec -i "$CONTAINER" sh -c 'cat > "$0"' "$skill_path" < "$skill_rw"
  fi

  # 8. Verify.
  if [ "$DRY_RUN" = "1" ]; then
    ok "$slug → $profile (memory ${memory_bytes}c) [dry-run, not written]"
    return 0
  fi
  local verify_line1 verify_sha
  verify_line1="$(docker exec "$CONTAINER" sh -c 'sed -n "1p" "$0"' "$mem_path")"
  verify_sha="$(printf '%s' "$verify_line1" | sed -n 's/.*sha=\([0-9a-f]\{12\}\).*/\1/p')"
  if [ "$verify_sha" != "$sha" ]; then
    die "$slug: post-write verify mismatch — expected sha=$sha, container has sha=${verify_sha:-<none>}"
    return 1
  fi
  local skill_bytes=0
  [ -n "${skill_rw:-}" ] && skill_bytes="$(wc -c < "$skill_rw" | tr -d '[:space:]')"
  ok "$slug → $profile (memory ${memory_bytes}c, skill ${skill_bytes}c)"
}

if [ "${#WORK[@]}" -gt 0 ]; then
  for item in "${WORK[@]}"; do
    k="${item%%:*}"; s="${item#*:}"
    seed_one "$k" "$s" || FAIL=$((FAIL + 1))
  done
fi

echo
echo "$((TOTAL - (FAIL - BAD_SLUGS)))/$TOTAL slugs OK.$( [ "$BAD_SLUGS" -gt 0 ] && printf ' (%d slug(s) had no hermes-context directory)' "$BAD_SLUGS" )"
[ "$FAIL" -gt 125 ] && FAIL=125
exit "$FAIL"
