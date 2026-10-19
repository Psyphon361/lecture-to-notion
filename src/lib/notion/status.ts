import type { NotionAuth } from "@/lib/notion/auth";
import type { NotionStatus } from "@/lib/notion/contracts";

/** Safe connection summary for the browser. Tokens never leave the server. */
export function notionStatusFromAuth(
  auth: NotionAuth,
  oauthConfigured: boolean,
): NotionStatus {
  const connected = auth.mode !== "none";
  const parentPageId = auth.parentPageId ?? null;
  return {
    ok: true,
    oauthConfigured,
    connected,
    mode: auth.mode,
    workspaceName: auth.session?.workspaceName ?? null,
    parentPageId,
    needsParentPage: auth.mode === "token" && !parentPageId,
  };
}
