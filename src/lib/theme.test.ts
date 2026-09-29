import { describe, expect, it } from "vitest";

import { THEME_STORAGE_KEY, themeIsDark } from "@/lib/theme";

describe("themeIsDark", () => {
  it("keeps a saved dark choice when the system is light or dark", () => {
    expect(themeIsDark("dark", false)).toBe(true);
    expect(themeIsDark("dark", true)).toBe(true);
  });

  it("keeps a saved light choice when the system is light or dark", () => {
    expect(themeIsDark("light", false)).toBe(false);
    expect(themeIsDark("light", true)).toBe(false);
  });

  it("uses the system when the saved value is empty", () => {
    expect(themeIsDark(null, true)).toBe(true);
    expect(themeIsDark(null, false)).toBe(false);
    expect(themeIsDark("", true)).toBe(true);
    expect(themeIsDark("", false)).toBe(false);
  });

  it("stores the choice under a stable key", () => {
    expect(THEME_STORAGE_KEY).toBe("lecture-to-notes-theme");
  });
});
