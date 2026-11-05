---
name: commit-message
intent: maintenance
writes: []
depends_on:
  - .agent/glossary.md
  - .agent/scripts/validate-commit-msg.mjs
---

# /commit-message — Draft a compliant commit message (manual helper)

## Goal

Generate a commit message you can use manually that passes this repo's commit guardrails (`.githooks/commit-msg`) and matches the commit-message convention in `.agent/glossary.md`.

Default behavior is **draft-only** (no commit execution): this command helps you compose a compliant message when you want to commit manually.

## Inputs

Arguments are optional and can be mixed:

- `type=feat|fix|docs|refactor|test|chore|perf|build`
- `scope=<slug-or-area>`
- `work_item=PRD-###|FRD-###|BUG-###`
- `ship_status=shipped|shipped_with_caveats|incomplete`
- `source=staged|working` (default: `staged`; fallback to `working` when staged is empty)
- `context="<one sentence>"` (extra intent signal)
- free text (treated as additional context)

Examples:

- `/commit-message`
- `/commit-message type=fix scope=triage work_item=BUG-012`
- `/commit-message source=working context="first commit after repo init"`

## Steps

1. Resolve git repo context at current working directory. If not in a git repo, stop and explain.
2. Read changes from `source`:
   - `staged`: `git diff --cached --name-status` + `git diff --cached --compact-summary`
   - `working`: `git diff --name-status` + `git diff --compact-summary`
   - If selected source has no changes, fallback once (`staged -> working`).
3. If no diff context exists after fallback, ask the user for a one-sentence commit intent and draft from that.
4. Resolve `type` and `scope`:
   - Use explicit args when provided.
   - Else infer `type` from change shape (tests only -> `test`, docs only -> `docs`, bug-fix wording -> `fix`, default `chore`).
   - Else infer `scope` from top changed area or current product slug.
5. Draft **one primary message**:
   - Subject: `type(scope): summary` and <= 72 chars.
   - Body: 1-4 non-empty rationale lines/sentences.
   - Add trailing lines only when available: `work_item`, `Ship status:`.
6. Validate the draft by running `.agent/scripts/validate-commit-msg.mjs` against a temp file; if validation fails, revise until it passes.
7. Return the final message in a single copy/paste block.

## Output rules

- Keep the output compact: one final message block + one short note on detected `type`/`scope`.
- Do not run `git commit` from this command unless the user explicitly asks in a follow-up.
- Do not invent a work-item id or ship status.

## Validation

- Subject matches `type(scope): summary` and is <= 72 chars.
- Rationale body is 1-4 non-empty lines/sentences.
- Message passes `.agent/scripts/validate-commit-msg.mjs`.
