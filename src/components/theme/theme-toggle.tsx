"use client";

import { THEME_STORAGE_KEY } from "@/lib/theme";

export function ThemeToggle() {
  function onClick() {
    const nextDark = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", nextDark);
    localStorage.setItem(THEME_STORAGE_KEY, nextDark ? "dark" : "light");
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 dark:border-zinc-700 dark:text-zinc-200"
    >
      <span className="dark:hidden">Switch to dark mode</span>
      <span className="hidden [.dark_&]:inline">Switch to light mode</span>
    </button>
  );
}
