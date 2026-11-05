#!/usr/bin/env bash
# sync-agents.sh — Generate .claude/agents/ mirrors from .agent/agents/ canonical files
#
# Usage: bash .agent/scripts/sync-agents.sh
#
# Reads every agent file under .agent/agents/team/ and
# .agent/agents/product-managers/, validates its frontmatter against the
# contract in .agent/agents/README.md, and copies each file into
# .claude/agents/<name>.md (flat layout, numeric prefix stripped).
#
# Companion to sync-wrappers.sh. Run after editing any agent file under
# .agent/agents/.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FLOWS_JSON="$REPO_ROOT/.agent/flows.json"
TEAM_DIR="$REPO_ROOT/.agent/agents/team"
PM_DIR="$REPO_ROOT/.agent/agents/product-managers"
CLAUDE_AGENTS_DIR="$REPO_ROOT/.claude/agents"

if [[ ! -f "$FLOWS_JSON" ]]; then
  echo "ERROR: $FLOWS_JSON not found. Cannot sync agents."
  exit 1
fi

if [[ ! -d "$TEAM_DIR" ]]; then
  echo "ERROR: $TEAM_DIR not found."
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

# Build a "role_id|file|type" lookup from flows.json agent_registry.
extract_registry() {
  if [[ "$JSON_TOOL" == "jq" ]]; then
    jq -r '.agent_registry | to_entries[] | "\(.key)|\(.value.file)|\(.value.type)"' "$FLOWS_JSON"
  else
    local flows_path="$FLOWS_JSON"
    if command -v cygpath &>/dev/null; then
      flows_path="$(cygpath -w "$FLOWS_JSON")"
    fi
    FLOWS_PATH="$flows_path" node -e "
      const fs = require('fs');
      const data = JSON.parse(fs.readFileSync(process.env.FLOWS_PATH, 'utf8'));
      for (const [id, agent] of Object.entries(data.agent_registry)) {
        console.log(id + '|' + agent.file + '|' + agent.type);
      }
    "
  fi
}

# Read a frontmatter scalar field from the top of an agent file.
# Multi-line scalars (folded with `>`) are joined into one line.
read_frontmatter_field() {
  local file="$1"
  local field="$2"
  awk -v field="$field" '
    BEGIN { in_fm = 0; in_field = 0; capture = ""; }
    NR == 1 && /^---[[:space:]]*$/ { in_fm = 1; next }
    in_fm && /^---[[:space:]]*$/ { in_fm = 0; exit }
    in_fm {
      # Match "field: value" or "field: >"
      if (match($0, "^" field ":[[:space:]]*")) {
        rest = substr($0, RSTART + RLENGTH)
        if (rest == ">" || rest == "|") {
          in_field = 1
          next
        }
        # strip surrounding quotes
        gsub(/^"|"$/, "", rest)
        gsub(/^'\''|'\''$/, "", rest)
        print rest
        exit
      }
      # Continuation lines under a folded scalar (indented)
      if (in_field) {
        if (match($0, /^[[:space:]]+/)) {
          line = $0
          sub(/^[[:space:]]+/, "", line)
          if (capture == "") capture = line
          else capture = capture " " line
        } else {
          # Top-level field reached — stop capture
          if (capture != "") { print capture; exit }
        }
      }
    }
    END { if (in_field && capture != "") print capture }
  ' "$file"
}

# Build a quick "role_id -> registry_file" map for cross-checks.
declare -A REGISTRY_FILE
declare -A REGISTRY_TYPE
while IFS='|' read -r role_id reg_file reg_type; do
  REGISTRY_FILE["$role_id"]="$reg_file"
  REGISTRY_TYPE["$role_id"]="$reg_type"
done < <(extract_registry)

valid_models="opus sonnet haiku fable"
valid_efforts="low medium high xhigh max"
valid_output_verbosity="minimal verbose"

validate_agent_file() {
  local file="$1"           # absolute path
  local rel_file="$2"       # repo-relative path used by registry
  local kind="$3"           # "team" | "specialization"
  local errors=0

  # Rule 1: frontmatter present at top
  if ! head -n1 "$file" | grep -qE '^---[[:space:]]*$'; then
    echo "    ERROR: missing frontmatter (file must start with ---)"
    return 1
  fi

  local name role_id type model effort output_verbosity extends description
  name=$(read_frontmatter_field "$file" "name")
  role_id=$(read_frontmatter_field "$file" "role_id")
  type=$(read_frontmatter_field "$file" "type")
  model=$(read_frontmatter_field "$file" "model" || true)
  effort=$(read_frontmatter_field "$file" "effort" || true)
  output_verbosity=$(read_frontmatter_field "$file" "output_verbosity" || true)
  extends=$(read_frontmatter_field "$file" "extends" || true)
  description=$(read_frontmatter_field "$file" "description" || true)

  # Strip surrounding quotes that survived
  role_id="${role_id//\"/}"

  # Rule 2: name matches filename slug
  local fname slug
  fname=$(basename "$file" .md)
  slug="${fname#[0-9][0-9]-}"   # strip "NN-" prefix if present
  if [[ "$name" != "$slug" ]]; then
    echo "    ERROR: name ('$name') does not match filename slug ('$slug')"
    errors=$((errors + 1))
  fi

  # Rule 5: description present and non-empty
  if [[ -z "$description" ]]; then
    echo "    ERROR: description is empty"
    errors=$((errors + 1))
  fi

  # Rule 7: model (if specified) is one of $valid_models
  if [[ -n "$model" ]]; then
    case " $valid_models " in
      *" $model "*) ;;
      *)
        echo "    ERROR: model '$model' is not one of: $valid_models"
        errors=$((errors + 1))
        ;;
    esac
  fi

  # Rule 7b: effort (if specified) is low|medium|high|xhigh|max
  if [[ -n "$effort" ]]; then
    case " $valid_efforts " in
      *" $effort "*) ;;
      *)
        echo "    ERROR: effort '$effort' is not one of: $valid_efforts"
        errors=$((errors + 1))
        ;;
    esac
  fi

  # Rule 7c: output_verbosity (if specified) is minimal|verbose
  if [[ -n "$output_verbosity" ]]; then
    case " $valid_output_verbosity " in
      *" $output_verbosity "*) ;;
      *)
        echo "    ERROR: output_verbosity '$output_verbosity' is not one of: $valid_output_verbosity"
        errors=$((errors + 1))
        ;;
    esac
  fi

  # Rule 3 + 4: role_id exists in agent_registry, registry file points back, type matches
  if [[ -z "$role_id" ]]; then
    echo "    ERROR: role_id is missing"
    errors=$((errors + 1))
  else
    local reg_file="${REGISTRY_FILE[$role_id]:-}"
    local reg_type="${REGISTRY_TYPE[$role_id]:-}"
    if [[ -z "$reg_file" ]]; then
      echo "    ERROR: role_id '$role_id' not found in flows.json agent_registry"
      errors=$((errors + 1))
    elif [[ "$kind" == "team" && "$reg_file" != "$rel_file" ]]; then
      # Team-agent registry file must point back to this exact file
      echo "    ERROR: flows.json agent_registry[$role_id].file = '$reg_file' but this file is '$rel_file'"
      errors=$((errors + 1))
    fi
    if [[ -n "$reg_type" && -n "$type" && "$reg_type" != "$type" ]]; then
      echo "    ERROR: type '$type' does not match flows.json agent_registry[$role_id].type = '$reg_type'"
      errors=$((errors + 1))
    fi
  fi

  # Rule 10: specialization layers must declare extends -> real team agent name
  if [[ "$kind" == "specialization" ]]; then
    if [[ -z "$extends" ]]; then
      echo "    ERROR: specialization missing 'extends' field"
      errors=$((errors + 1))
    else
      # Verify the extends target exists as a team-agent name
      local found=0
      for tf in "$TEAM_DIR"/*.md; do
        [[ -f "$tf" ]] || continue
        local tname
        tname=$(read_frontmatter_field "$tf" "name")
        if [[ "$tname" == "$extends" ]]; then
          found=1
          break
        fi
      done
      if [[ "$found" -eq 0 ]]; then
        echo "    ERROR: extends '$extends' does not resolve to a team agent"
        errors=$((errors + 1))
      fi
    fi
  fi

  return "$errors"
}

mirror_agent_file() {
  local file="$1"
  local name="$2"
  local target="$CLAUDE_AGENTS_DIR/$name.md"
  mkdir -p "$CLAUDE_AGENTS_DIR"
  cp "$file" "$target"
  echo "  Claude: $name.md"
}

echo "Syncing agents from .agent/agents/ ..."
echo ""

count_ok=0
count_err=0

# --- Team agents ---
for file in "$TEAM_DIR"/*.md; do
  [[ -f "$file" ]] || continue
  fname=$(basename "$file")
  rel_file="agents/team/$fname"
  echo "Validating $rel_file"
  if validate_agent_file "$file" "$rel_file" "team"; then
    name=$(read_frontmatter_field "$file" "name")
    mirror_agent_file "$file" "$name"
    count_ok=$((count_ok + 1))
  else
    count_err=$((count_err + 1))
  fi
done

# --- Pack agents (tranche 5, 2026-08-22) ---
# An agent owned by a pack lives with its pack, not in agents/team/. It is still a
# first-class agent: same frontmatter contract, same registry, same mirror. Only its
# location differs, so it is validated as "team" here.
#
# The glob is one level deep by kind (packs/<kind>/<id>/agents/*.md). A FLAT scan finds
# nothing and reports clean — the exact defect measured on the Sitecore module discovery
# (root CLAUDE.md § Serialization module layout), so the shape is deliberate.
for packdir in "$REPO_ROOT"/.agent/packs/*/*/agents; do
  [[ -d "$packdir" ]] || continue
  for file in "$packdir"/*.md; do
    [[ -f "$file" ]] || continue
    rel_file="${file#"$REPO_ROOT"/.agent/}"
    echo "Validating $rel_file"
    if validate_agent_file "$file" "$rel_file" "team"; then
      name=$(read_frontmatter_field "$file" "name")
      mirror_agent_file "$file" "$name"
      count_ok=$((count_ok + 1))
    else
      count_err=$((count_err + 1))
    fi
  done
done

# --- PM specializations ---
if [[ -d "$PM_DIR" ]]; then
  for file in "$PM_DIR"/*.md; do
    [[ -f "$file" ]] || continue
    fname=$(basename "$file")
    rel_file="agents/product-managers/$fname"
    echo "Validating $rel_file"
    if validate_agent_file "$file" "$rel_file" "specialization"; then
      name=$(read_frontmatter_field "$file" "name")
      mirror_agent_file "$file" "$name"
      count_ok=$((count_ok + 1))
    else
      count_err=$((count_err + 1))
    fi
  done
fi

echo ""
if [[ "$count_err" -gt 0 ]]; then
  echo "Done with errors. Synced $count_ok ok, $count_err failed."
  echo "Fix the failed files and re-run. The .claude/agents/ mirror was not"
  echo "regenerated for files that failed validation."
  exit 1
fi

echo "Done. Synced $count_ok agents to .claude/agents/."
echo ""
echo "NOTE: Mirrors are regenerated, not edited. Source of truth is .agent/agents/."
echo "      Run this script again after any change to a canonical agent file."
