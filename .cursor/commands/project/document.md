# /document — Cursor wrapper

Read and follow `.agent/commands/project/dev-flow/09-document.md` exactly.

## Wrapper rules
- `.agent/commands/project/dev-flow/09-document.md` is the source of truth.
- Pass through any slash-command arguments unchanged.
- If this wrapper conflicts with the source command, follow the source command.
- Read any templates or referenced files mentioned by the source command before proceeding.
- Preserve the source command's rules, constraints, writes, validation steps, and output format.

$ARGUMENTS
