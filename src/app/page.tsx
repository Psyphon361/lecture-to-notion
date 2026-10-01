import Link from "next/link";

export default function Home() {
  return (
    <main className="relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-background text-foreground">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-[20%] top-[10%] h-[55%] w-[65%] rounded-full bg-emerald-500/20 blur-[120px] dark:bg-emerald-500/35" />
        <div className="absolute -right-[15%] bottom-[5%] h-[50%] w-[55%] rounded-full bg-green-400/15 blur-[110px] dark:bg-green-400/25" />
        <div className="absolute left-[25%] top-[45%] h-[40%] w-[45%] rounded-full bg-teal-400/10 blur-[90px] dark:bg-teal-400/20" />
      </div>
      <div className="relative z-10 flex max-w-lg flex-col items-center gap-6 px-6 text-center">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Lecture to Notes</h1>
        <p className="text-lg text-zinc-600 sm:text-xl dark:text-zinc-300">
          Turn a lecture PowerPoint into Notion study notes.
        </p>
        <Link
          href="/app"
          className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
        >
          Open the app
        </Link>
      </div>
    </main>
  );
}
