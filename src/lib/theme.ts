export const THEME_STORAGE_KEY = "lecture-to-notes-theme";

/** Saved "dark" or "light" wins. Anything else, including an empty value, follows the system. */
export function themeIsDark(saved: string | null, systemDark: boolean): boolean {
  if (saved === "dark") return true;
  if (saved === "light") return false;
  return systemDark;
}

/** Blocking script for the document head. Sets `class="dark"` before first paint. */
export const themeInitScript = `(function(){try{var saved=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});var systemDark=window.matchMedia("(prefers-color-scheme: dark)").matches;var dark=saved==="dark"||(saved!=="light"&&systemDark);document.documentElement.classList.toggle("dark",dark);}catch(e){}})();`;
