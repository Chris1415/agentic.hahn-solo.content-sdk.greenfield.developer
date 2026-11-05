# Design skills: what `/design` loads, where to get them, what happens without them

The design stage (`.agent/commands/project/dev-flow/04b-design.md`) assigns skills to **roles**: a spine that sets the process, a direction, a taste pre-flight, product-UI polish, motion, and a fresh critic (`stages.design.skill_roles` in `pack.json`). One of them is Anthropic's; five are third-party. The third-party ones are **never republished by this project**, so they are not in `.claude/skills/` of this repo.

| Role | Skill | Where to get it | Licence |
|---|---|---|---|
| spine | `frontend-design:frontend-design` | Anthropic's plugin: `claude plugin install frontend-design@claude-plugins-official` | Anthropic's |
| direction, critic | `impeccable` | https://github.com/pbakaus/impeccable (`plugin/skills/impeccable`) | Apache-2.0 |
| taste pre-flight | `design-taste-frontend` | https://github.com/leonxlnx/taste-skill (`skills/taste-skill`) | MIT |
| product polish | `emil-design-eng` | https://github.com/emilkowalski/skill (`skills/emil-design-eng`) | MIT |
| motion build | `animate` | https://github.com/emilkowalski/skill (`skills/animate`) | MIT |
| critic (motion axis) | `review-animations` | https://github.com/emilkowalski/skill (`skills/review-animations`) | MIT |

To install a third-party skill, follow its upstream's own instructions, or copy its skill folder to `.claude/skills/<name>/` in this repo (or to `~/.claude/skills/<name>/` for all projects). The names must match the table: the brief cites them by name. The upstream locations and licences above are read from the `.upstream.json` that sits next to each skill in the private source, and a test keeps this table in step with them.

## When one is missing

The stage **does not stop**. A missing skill is a missing input, not an error:

1. **Record it.** Each missing skill goes into the variant spec § 1 as `skill not available: <name>` and into the run manifest's `operator_attention[]`, so the reader of the result knows which role ran without its skill.
2. **Do not stand in for it from memory.** A skill's rules are not paraphrased as if they had been loaded; a role without its skill works from the pack's `constraints` (fields-shaped props, empty and overlong states, three-state theme, editor chrome room, rule `86-component-authorability`) and the stage's own steps: ground the direction in the subject, write the compact token plan, run the ledger check (`node .agent/scripts/designs-ledger.mjs check`), review the plan for genericness.
3. **The spine matters most.** Without `frontend-design:frontend-design` the process comes from the stage steps alone. Say so in the variant spec; the critic's verdict is then weaker, and the design gate (the operator's pick) is where that is decided.
4. **The critic stays a fresh agent.** It uses the tell lists of the skills that are present; with none, it checks the pack's constraints and the generic tells the stage names.

If the roles matter to you, install the skills first. If you just want to see the stage run, it runs without them.
