# Prerequisites for the stages that touch a tenant

The planning stages up to and including `/design` and `/task-breakdown` need no tenant (`/discover-sitecoreai`, which reads an existing site, does). From `/provision-sitecoreai` on, the flow acts on a real SitecoreAI organisation, and it needs the pieces below. Every statement here comes from the stage files, the rules and the skills in this repo; where the repo says nothing, the last section says so instead of guessing.

## 1. The organisation-level automation client ("deploy admin")

- `/provision-sitecoreai` runs all of its cloud operations non-interactively from **one organisation "deploy admin" automation client**: a client id and secret created once in the Deploy Portal (`.agent/packs/platform/content-sdk/stages/provision-sitecoreai.md`, the paragraph above step 1). The secret is collected for the session only.
- CLI side: `dotnet sitecore cloud login --client-credentials`. Token side: `POST https://auth.sitecorecloud.io/oauth/token`, grant `client_credentials`, audience `https://api.sitecorecloud.io` (skill `sitecoreai-auth`).
- That client holds, among others, the `xmclouddeploy.deployments:manage` and `xmclouddeploy.sourcecontrol:manage` scopes (stage file, step 5 and the table of what an automation client can do). It cannot create the **first** git link of an editing host (it answers 403: only the integration's creator can), and it is **not** accepted for writes to the Sites (XM Apps) API: step 6 mints a second, **environment-level** client for that.
- **Naming and storage of the minted client.** Store it as `SITECORE_CM_CLIENT_ID_<ORG>` and `SITECORE_CM_CLIENT_SECRET_<ORG>`, with an organisation suffix, never the bare names. The reason is in the stage file (step 6): an `.env` can hold several estates' clients side by side, and an unsuffixed pair names no estate.
- Environment quota is **per project and per environment type** (production and non-production are counted apart); a `402` is a hard gate, and its wording says which one is full (stage file, step 3).

## 2. The Marketer MCP (for `/author-content` and `/test-content`)

The agents (`14-content-author`, `08-developer`) list the tools `mcp__sitecore-marketer__*`, so the server has to be registered under the name **`sitecore-marketer`**.

- **Endpoint.** `https://marketer.sitecorecloud.io/mcp/marketer-mcp-prod` (rule `83-content-authoring-mcp-first`). It is a remote HTTP server.
- **Claude Code.** One way to register it, in the project:

  ```sh
  claude mcp add --transport http --scope project sitecore-marketer https://marketer.sitecorecloud.io/mcp/marketer-mcp-prod
  ```

  which writes a `.mcp.json` like this one (a project `.mcp.json` is the file Claude Code reads for project-scoped servers; check `claude mcp add --help` for the flags of your version):

  ```json
  {
    "mcpServers": {
      "sitecore-marketer": {
        "type": "http",
        "url": "https://marketer.sitecorecloud.io/mcp/marketer-mcp-prod"
      }
    }
  }
  ```

- **Login.** The URL carries **no tenant, environment or host**: where a write lands is decided entirely by the account you authenticate with (rule 83). That is why the rule makes you probe the binding before the first write of a session: create one throwaway item, read it back through two independent instruments, delete it. Do that; the endpoint cannot tell you.
- **Not documented in this repo:** the OAuth flow's steps and scopes, and how a session is re-bound to another environment. Use Claude Code's `/mcp` command for the login and the Sitecore documentation for the rest.

## 3. What the repo says about provisioning limits

- Creating an editing-host environment without its binding to the content-management environment is accepted with a `201` and silently creates the **wrong kind** of environment, which consumes a slot: verify `type: "eh"` and `editingHostEnvironmentDetails.cmEnvironmentId` on the response (stage file, step 3).
- Editing-host variables the platform injects (`SITECORE_EDGE_CONTEXT_ID`, `NEXT_PUBLIC_*`, `SITECORE_EDITING_SECRET`) are **not** to be set by hand on the editing host: an upsert builds green and never starts a container. `node .agent/scripts/assert-eh-vars.mjs --env <ehEnvId> --org <org>` checks it before a deploy (stage file, step 5c).
- `SITECORE_EDITING_SECRET` is organisation- and project-dependent; there is no global default (`/publish` stage).

## 4. Not documented here

The repo does not say, and this flow does not claim: the number of production environments an organisation may hold, how to rotate an automation client, how long a new content-management hostname takes before it resolves, or what `obtain-editing-secret` returns on a new project. Look these up in the Sitecore documentation or ask your account contact before you depend on them.
