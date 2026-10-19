import { cookies } from "next/headers";
import Link from "next/link";

import { ConnectGate } from "@/components/notion/connect-gate";
import { resolveNotionAuth } from "@/lib/notion/auth";
import { tryOAuthConfig } from "@/lib/notion/oauth";
import { notionStatusFromAuth } from "@/lib/notion/status";

export const dynamic = "force-dynamic";

export default async function ConnectPage() {
  const cookieStore = await cookies();
  const auth = resolveNotionAuth({ cookies: cookieStore }, process.env);
  const initialStatus = notionStatusFromAuth(
    auth,
    tryOAuthConfig(process.env) !== null,
  );

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 px-6 py-8">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Step 1
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Connect Notion
        </h1>
        <p className="mt-3 text-zinc-600 dark:text-zinc-400">
          Connect the Notion workspace where this lecture&apos;s notes should go.
          The upload step stays locked until the connection is ready.
        </p>
      </div>

      <ConnectGate initialStatus={initialStatus} />

      <Link href="/" className="self-start text-sm font-medium underline">
        Back
      </Link>
    </main>
  );
}
