# Friction Log — <run_id>

**Run manifest:** `<canonical_artifacts path>`
**Product:** `<product-slug>`
**Min severity captured:** `<min_severity from manifest.friction_log.min_severity>`

> Append-only. Never edit or remove past entries — supersede with a follow-up entry that references the original timestamp.
> See `.agent/manifests/README.md` § Friction log for the contract (write triggers, severity scale, who writes, what gets logged).

---

<!--
Entry template — copy below this comment for each new friction event.
Delete this comment block on the first real append.

## <ISO-8601 timestamp> — <command> § <section> (<agent-or-stage>)
**Severity:** low|medium|high|critical
**Observed by:** Team Lead | self-flag from agent NN | user-correction | stage-failure
**What happened:** <one-paragraph factual description, no blame, no speculation>
**User correction (if any):** "<verbatim trigger phrase from the user>"
**Skill / command at fault:** <repo-relative path or null>
**Suggested patch target:** <"add X rule to Y" | "extend skill Z with W" | null>
**Status:** open
-->
