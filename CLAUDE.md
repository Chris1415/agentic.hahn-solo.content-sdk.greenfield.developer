# CLAUDE.md — agentic.hahn-solo.content-sdk.greenfield.developer

> **GENERATED — do not hand-edit.** Produced from a private source repo. Edits here are lost on the
> next export and create the drift this mechanism exists to prevent.

## What this is

A staged, agent-driven delivery pipeline for **Sitecore Content SDK head-app builds**: a **personal example** of how such a flow works
and what it needs. It is not an official Sitecore product, it is offered as is, and it may not run end to
end. `README.md` has the per-stage status (what was run from an export, what only in the private source,
what not at all); do not tell the operator a stage works because it is described here.

**Composition:**

- `platform:content-sdk`

Agents are identities. Commands are tasks. **Packs are domains.** The pipeline engine carries no
platform knowledge — each stage resolves a **pack brief** and applies what it says. With no pack
active, the same engine runs generically.

```sh
node .agent/scripts/resolve-packs.mjs --list
node .agent/scripts/resolve-packs.mjs --platform content-sdk --stage implement --md
```

## Running a stage

Type the namespaced form: **`/project:<command>`** (`/project:prime`, `/project:create-prd`, `/project:design`). A bare `/design`,
`/code-review`, `/doctor`, `/status` or `/resume` can resolve to a Claude Code built-in instead of this flow's command. Every
`/name` in these docs means `/project:name`.

The flow ends at an open pull request: `/ship` pushes and opens it, and a human reviews and merges. Nothing here merges.

## Skills

This export **vendors** its skills: 61 skills are committed under
`.claude/skills/`, so a fresh clone has everything with **no install step**.

The design stage also names third-party skills that are never republished; if one is absent the stage continues and records it.
See `.agent/packs/platform/content-sdk/reference/design-skills.md`.

## Verify this export

```sh
node .agent/scripts/validate-framework.mjs
```

It must pass **inside this folder**. If the closure missed a file, a `depends_on` path fails to
resolve and it fails loudly rather than shipping a broken flow.
