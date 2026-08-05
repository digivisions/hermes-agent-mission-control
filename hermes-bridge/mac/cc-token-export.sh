#!/bin/bash
# Export the Claude Code OAuth token from the macOS keychain to a file the
# VPS->Mac SSH session can read (the keychain is GUI-session-only, so the
# non-interactive SSH session the bridge uses cannot reach it).
# Runs via LaunchAgent com.hermes.cc-token-export every 10 min.
# File: ~/.hermes/state/cc-oauth-token (0600).
#
# READ ONLY. This never refreshes, rotates or re-auths anything (Spec G, G-R2):
# rotating the token out of band would log Claude Code out on this Mac. It
# copies whatever blob the keychain currently holds, verbatim.
#
# 2026-08-05: the login keychain holds MORE THAN ONE generic-password item
# under the service "Claude Code-credentials" — a January item with
# acct="Claude Code" and the live one with acct=$USER, which current Claude
# Code rewrites on every refresh. A bare `-s <service>` lookup returns the
# first match, which on this Mac is the January item: a six-month-dead token
# that the usage API answers with 401. Hence the account-aware search below,
# ranked by expiresAt so the freshest credential always wins.
set -e

STATE="$HOME/.hermes/state"
NODE="$HOME/.hermes/node/bin/node"
SERVICE="Claude Code-credentials"
mkdir -p "$STATE"

log() { echo "$(date -u +%FT%TZ) $1" >> "$STATE/cc-token-export.log"; }

# Reads one keychain item. $1 = account, or "" for the legacy first-match lookup.
read_item() {
  if [ -n "$1" ]; then
    security find-generic-password -a "$1" -s "$SERVICE" -w 2>/dev/null || true
  else
    security find-generic-password -s "$SERVICE" -w 2>/dev/null || true
  fi
}

# Prints claudeAiOauth.expiresAt (ms epoch) for the blob on stdin, or 0.
# Without node we print 0 for everything, which leaves the candidate ordering
# below as the tiebreak — and that order already puts the live item first.
expiry_of() {
  if [ -x "$NODE" ]; then
    "$NODE" -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let v=0;try{v=Number(JSON.parse(s).claudeAiOauth.expiresAt)||0}catch{};process.stdout.write(String(v))})' 2>/dev/null || echo 0
  else
    echo 0
  fi
}

BEST=""
BEST_EXP=-1
BEST_SRC=""
for ACCT in "$USER" "Claude Code" ""; do
  BLOB=$(read_item "$ACCT")
  [ -n "$BLOB" ] || continue
  EXP=$(printf '%s' "$BLOB" | expiry_of)
  case "$EXP" in ''|*[!0-9]*) EXP=0 ;; esac
  if [ "$EXP" -gt "$BEST_EXP" ]; then
    BEST="$BLOB"
    BEST_EXP="$EXP"
    BEST_SRC="${ACCT:-first-match}"
  fi
done

if [ -n "$BEST" ]; then
  umask 077
  printf '%s' "$BEST" > "$STATE/cc-oauth-token"
  chmod 600 "$STATE/cc-oauth-token"
  log "token exported (len ${#BEST}, acct=${BEST_SRC}, expiresAt=${BEST_EXP})"
else
  # Leave any previous export in place — an empty file would turn a recoverable
  # "keychain locked right now" into "no credentials found" for the usage read.
  log "keychain unavailable — kept previous export"
fi
