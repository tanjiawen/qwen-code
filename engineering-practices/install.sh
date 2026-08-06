#!/usr/bin/env bash
# ============================================================
# Engineering Practices — installer
#
# Copies the engineering-practices pack into a target project so the
# practices (skills + glossary + AGENTS fragment) are enforced there.
#
# Usage:
#   ./install.sh [target] [--dry-run] [--skills|--agents|--glossary|--all]
#
#   target    project directory to install into (default: current dir)
#   --dry-run print what would be copied without changing anything
#   --skills  copy only the skills
#   --agents  copy only the AGENTS fragment
#   --glossary copy only the glossary template
#   --all     (default) copy everything
#
# Idempotent: re-running never duplicates or overwrites an existing skill or
# GLOSSARY.md. Never edits the target's AGENTS.md — it drops AGENTS.partial.md
# and asks you to merge it manually (merging is your call).
# ============================================================
set -euo pipefail

PACK_ROOT="$(cd "$(dirname "$0")" && pwd)"
TARGET=""
DRY_RUN=false
MODE="all"

# ---- parse args ----
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=true ;;
    --skills) MODE="skills" ;;
    --agents) MODE="agents" ;;
    --glossary) MODE="glossary" ;;
    --all) MODE="all" ;;
    -h|--help)
      sed -n 's/^# \{0,1\}//p' "$0" | sed -n '2,/^$/p'
      exit 0
      ;;
    -*) echo "unknown option: $1" >&2; exit 1 ;;
    *) TARGET="$1" ;;
  esac
  shift
done

TARGET="${TARGET:-$PWD}"
TARGET="$(cd "$TARGET" 2>/dev/null && pwd)" || { echo "target not a directory: $TARGET" >&2; exit 1; }

echo "Engineering Practices → $TARGET"
echo "Pack root: $PACK_ROOT"
[ "$DRY_RUN" = true ] && echo "(dry-run: no files will be written)"
echo

copy_if_missing() {
  local src="$1" dst="$2"
  if [ -e "$dst" ]; then
    echo "  skip (exists): ${dst#$TARGET/}"
    return
  fi
  if [ "$DRY_RUN" = true ]; then
    echo "  would copy: ${src#$PACK_ROOT/} → ${dst#$TARGET/}"
  else
    mkdir -p "$(dirname "$dst")"
    cp -R "$src" "$dst"
    echo "  copied: ${src#$PACK_ROOT/} → ${dst#$TARGET/}"
  fi
}

# ---- skills ----
if [ "$MODE" = "all" ] || [ "$MODE" = "skills" ]; then
  echo "skills:"
  for skill in "$PACK_ROOT"/skills/*/; do
    [ -d "$skill" ] || continue
    name="$(basename "$skill")"
    copy_if_missing "$skill" "$TARGET/.qwen/skills/$name"
  done
fi

# ---- AGENTS fragment ----
if [ "$MODE" = "all" ] || [ "$MODE" = "agents" ]; then
  echo "AGENTS fragment:"
  copy_if_missing "$PACK_ROOT/AGENTS.partial.md" "$TARGET/AGENTS.partial.md"
  echo "  NOTE: merge AGENTS.partial.md into $TARGET/AGENTS.md manually."
fi

# ---- glossary ----
if [ "$MODE" = "all" ] || [ "$MODE" = "glossary" ]; then
  echo "glossary:"
  copy_if_missing "$PACK_ROOT/GLOSSARY.template.md" "$TARGET/GLOSSARY.md"
  echo "  NOTE: fill in the terms; use the domain-glossary skill to maintain it."
fi

echo
echo "Done. See $PACK_ROOT/README.md for how to use the practices."