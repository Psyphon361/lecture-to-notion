# Spike S4 — Notion OAuth

**Status:** implementation is in the app; the live flow has not been run yet.
**Date started:** Oct 19, 2026.

The code is covered by mocked tests. This spike is the manual check that a real public connection authorizes, refreshes, lists pages, and exports.

## Prerequisites

- Access to the Notion Developer portal for the target workspace.
- The app running locally at `http://localhost:3000`.
- A Notion page to use as the export parent, shared during authorization.

## Create the public connection

1. Developer portal -> **Public connections** -> **Create new connection**.
2. Name it, pick the development workspace.
3. Installation scope: **Selected workspaces only**; select the target workspace.
4. Capabilities: **Read content** and **Insert content**.
5. Redirect URI: `http://localhost:3000/api/notion/oauth/callback`.
   - Add the production URL later if the app is deployed. Each value must match exactly.
6. Copy the **OAuth client ID** and **OAuth client secret** from the Configuration tab.

## Environment

Add to `.env.local` (never commit):

```
NOTION_OAUTH_CLIENT_ID=...
NOTION_OAUTH_CLIENT_SECRET=...
NOTION_OAUTH_REDIRECT_URI=http://localhost:3000/api/notion/oauth/callback
NOTION_OAUTH_ENCRYPTION_KEY=...
```

Generate the key with:

```bash
openssl rand -base64 32
```

Keep `NOTION_TOKEN` if the fallback path is still wanted. `NOTION_PARENT_PAGE_ID` is ignored for OAuth (it is only for the `NOTION_TOKEN` fallback). Export goes to the page selected on the consent screen; remove the variable from `.env.local` if present.

## Checks

Record each result here.

| Check | Result |
|---|---|
| Authorize URL opens from `GET /api/notion/oauth/start` | not run |
| State cookie is set and verified | not run |
| Page picker appears and pages can be selected | not run |
| Callback exchanges the code at `/v1/oauth/token` | not run |
| Token response includes `access_token` and `refresh_token` | not run |
| Session cookie is `HttpOnly` and encrypted; tokens are not readable from the browser | not run |
| `/api/notion/status` shows the workspace name and no tokens | not run |
| Export parent is the page selected on the consent screen (not its children) | not run |
| Export creates a page under the chosen parent | not run |
| Disconnect clears the session and disables export | not run |
| A forced 401 refreshes once and retries the export | not run |
| A failed refresh asks the user to reconnect | not run |

## Items to verify against live Notion

- `[VERIFY]` Whether a **Selected workspaces only** public connection can authorize immediately, or whether Notion requires a review before the authorization URL is usable. The guide says the authorization URL field populates after submission; the public-connections guide does not mention a review for non-Marketplace use.
- `[VERIFY]` The refresh request shape and response. The Authorization guide documents `grant_type: "refresh_token"` at `/v1/oauth/token`; the reference page currently shows only the authorization-code body.
- `[VERIFY]` That `http://localhost:3000` is accepted as a redirect URI for the connection.
- `[VERIFY]` That the access token expiry behavior matches the refresh design. If Notion does not expire access tokens in practice, the refresh path should remain a 401 recovery only.
- `[VERIFY]` That `POST /v1/search` returns the selected page with a non-page parent (workspace) so `selectExportParent` finds it as the root.

## Rollback

The OAuth path is additive. Remove the four `NOTION_OAUTH_*` variables (or leave them unset) and the exporter falls back to `NOTION_TOKEN`. Disconnecting clears the browser session cookie.
