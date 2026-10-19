import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { LectureFlow } from "@/components/flow/lecture-flow";
import { resolveNotionAuth } from "@/lib/notion/auth";
import { isBlobConfigured } from "@/lib/storage/default-storage";

export const dynamic = "force-dynamic";

export default async function AppPage() {
  const cookieStore = await cookies();
  const auth = resolveNotionAuth({ cookies: cookieStore }, process.env);
  if (auth.mode === "none") redirect("/connect");

  return (
    <main className="mx-auto flex min-h-0 w-[60%] flex-1 flex-col py-2">
      <LectureFlow directUpload={isBlobConfigured()} />
    </main>
  );
}
