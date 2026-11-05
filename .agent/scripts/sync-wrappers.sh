#!/usr/bin/env bash
# sync-wrappers.sh — Generate .claude/ and .cursor/ command wrappers from .agent/flows.json
#
# Usage: bash .agent/scripts/sync-wrappers.sh
#
# Reads flows.json to discover all commands and their canonical file paths,
# then generates thin wrappers in .claude/commands/ and .cursor/commands/
# that delegate to the canonical .agent/commands/ definitions.
#
# Run this after adding, renaming, or moving any command file.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FLOWS_JSON="$REPO_ROOT/.agent/flows.json"
CLAUDE_DIR="$REPO_ROOT/.claude/commands"
CURSOR_DIR="$REPO_ROOT/.cursor/commands"

if [[ ! -f "$FLOWS_JSON" ]]; then
  echo "ERROR: $FLOWS_JSON not found. Cannot sync wrappers."
  exit 1
fi

# We need jq or node to parse JSON. Try jq first, fall back to node.
if command -v jq &>/dev/null; then
  JSON_TOOL="jq"
elif command -v node &>/dev/null; then
  JSON_TOOL="node"
else
  echo "ERROR: Neither jq nor node is available. Install one to run this script."
  exit 1
fi

# Extract command entries as "id|file|intent|interactive" lines
extract_commands() {
  if [[ "$JSON_TOOL" == "jq" ]]; then
    jq -r '.commands | to_entries[] | "\(.key)|\(.value.file)|\(.value.intent)|\(.value.interactive)"' "$FLOWS_JSON"
  else
    # Convert MSYS/Cygwin path to native form when running under Git Bash on Windows
    local flows_path="$FLOWS_JSON"
    if command -v cygpath &>/dev/null; then
      flows_path="$(cygpath -w "$FLOWS_JSON")"
    fi
    FLOWS_PATH="$flows_path" node -e "
      const fs = require('fs');
      const data = JSON.parse(fs.readFileSync(process.env.FLOWS_PATH, 'utf8'));
      for (const [id, cmd] of Object.entries(data.commands)) {
        console.log(id + '|' + cmd.file + '|' + cmd.intent + '|' + cmd.interactive);
      }
    "
  fi
}

# Map command id to wrapper subdirectory
get_wrapper_subdir() {
  local cmd_file="$1"
  if [[ "$cmd_file" == commands/research/* ]]; then
    echo "research"
  elif [[ "$cmd_file" == commands/sitecore/* ]]; then
    echo "sitecore"
  else
    echo "project"
  fi
}

# Generate a wrapper file
generate_wrapper() {
  local cmd_id="$1"
  local cmd_file="$2"
  local target_dir="$3"
  local flavor="$4"  # "Claude" or "Cursor"

  local subdir
  subdir=$(get_wrapper_subdir "$cmd_file")
  local wrapper_path="$target_dir/$subdir/$cmd_id.md"

  mkdir -p "$(dirname "$wrapper_path")"

  cat > "$wrapper_path" <<WRAPPER
# /$cmd_id — $flavor wrapper

Read and follow \`.agent/$cmd_file\` exactly.

## Wrapper rules
- \`.agent/$cmd_file\` is the source of truth.
- Pass through any slash-command arguments unchanged.
- If this wrapper conflicts with the source command, follow the source command.
- Read any templates or referenced files mentioned by the source command before proceeding.
- Preserve the source command's rules, constraints, writes, validation steps, and output format.

\$ARGUMENTS
WRAPPER

  echo "  $flavor: $subdir/$cmd_id.md"
}

echo "Syncing wrappers from $FLOWS_JSON ..."
echo ""

count=0
while IFS='|' read -r cmd_id cmd_file cmd_intent cmd_interactive; do
  # Verify canonical file exists
  if [[ ! -f "$REPO_ROOT/.agent/$cmd_file" ]]; then
    echo "  WARN: canonical file .agent/$cmd_file not found for command '$cmd_id' — skipping"
    continue
  fi

  generate_wrapper "$cmd_id" "$cmd_file" "$CLAUDE_DIR" "Claude"
  generate_wrapper "$cmd_id" "$cmd_file" "$CURSOR_DIR" "Cursor"
  count=$((count + 1))
done < <(extract_commands)

echo ""
echo "Done. Synced $count commands to .claude/commands/ and .cursor/commands/."
echo ""
echo "NOTE: Wrappers are intentionally thin. All command logic lives in .agent/commands/."
echo "      If you need command-specific wrapper additions, edit the wrapper after syncing."
