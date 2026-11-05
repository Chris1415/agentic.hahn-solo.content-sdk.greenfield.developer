---
name: reference_xmcloud_editing_host_git_linked_repo_rename_breaks_pull
description: "Renaming a git-linked GitHub repo breaks the SitecoreAI editing-host source pull; and a git-linked EH builds a fixed branch, so deployed code must be merged to THAT branch"
metadata: 
  node_type: memory
  type: reference
---

Two coupled gotchas hit when an editing host wouldn't show a rebrand in SitecoreAI Pages (2026-07-13). The **public Vercel site can be correct while the Pages editor stays stale** — they are different deploy surfaces.

**1. A git-linked EH builds a FIXED branch (usually `main`), `deployOnCommit:false` — code must reach that branch.**
The EH was git-linked to `<owner>/<repo>` branch `main`, path `./`. The rename lived on `prd-000` (pushed) but was never merged to `main`; `origin/main` was still the pre-rename PR-merge commit. Re-triggering the git build just rebuilt the old commit. Fix = get the code onto the branch the EH builds (merge `prd-000`→`main` + push), THEN trigger. Note `origin/main` = a PR **merge commit** is NOT a fast-forward target of the feature branch — verify with `git merge-base --is-ancestor origin/main <branch>`; if not FF, do a real `--no-ff` merge (tree comes out identical to the feature branch; verify with `git diff <branch> HEAD` = empty). Trigger the build explicitly: `dotnet sitecore cloud editinghost deploy -id <envId> --no-watch` (NO `--upload` — upload is rejected on a git-linked env: "Uploading source code is not permitted").

**2. Renaming the GitHub repo breaks the EH's GitHub integration pull (private repo).**
After renaming `<old-name>`→`<new-name>` on GitHub, the git build resolved the correct commit but failed the build phase with `Failed to download content from GitHub`. Root cause: SitecoreAI's GitHub App integration grant lost pull access to the renamed PRIVATE repo (the EH still stores the OLD repo name; repo id is stable but the token can't fetch). Fix = one of: (A) re-authorize the GitHub source-control integration / re-grant the GitHub App to the renamed repo in the Deploy Portal, keeps git-linked; (B) unlink the branch on the EH env (Portal) then `--upload -dir <headapp>` to bypass GitHub entirely (fastest, but flips the EH to upload mode). Neither is CLI-only — both need a Portal action. This is a real integration boundary — the CLI can't repair the grant.

Deploy needs a Deploy-scoped token (`xmclouddeploy.deployments:manage` + `rh:mng`). The `.env.local` CM client (`xmcloud.cm:admin`) is scope-insufficient (403 on the Deploy API). Get one via `dotnet sitecore cloud login` (device flow — writes `<dir>/.sitecore/user.json` xmCloud endpoint) or client-credentials with the org deploy-admin client.
