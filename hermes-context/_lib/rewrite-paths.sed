# rewrite-paths.sed — Mac path -> container-safe rewriting rules.
#
# The `hermes` container cannot open /Volumes/DATA2, /Users/annguyen/…, or the
# Obsidian vault. Seeding those paths verbatim is worse than seeding nothing:
# the agent will confidently claim it read a file it cannot see. Every
# MEMORY.md / SKILL.md must pass through this file before being written into
# a profile. Run the caller's guard-grep afterwards (`/Users/|/Volumes/|Obsidian Vault`)
# — this file must leave no Mac path behind, not merely most of them.
#
# Order matters: the most specific substitutions run first, the catch-alls
# last.

s|/Volumes/DATA2/1-Development/Anh Ngu An Toan/anhnguantoan-dev|repo (Mac only, via Claude Code offload)|g
s|/Users/annguyen/Documents/Personal/Obsidian Vault/Projects/\([^`]*\)\.md|Obsidian note "\1" (Mac only)|g
s|/Users/annguyen/[^ `)"]*|(Mac path — not readable from this container)|g
s|/Volumes/[^ `)"]*|(external drive — not readable from this container)|g
