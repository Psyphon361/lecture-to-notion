import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep AGENTS.md as the project instructions. Next would otherwise append its own block on dev.
  agentRules: false,
  // Image storage uses a dynamic path under .data. Without this, the deploy traces the whole repo.
  outputFileTracingExcludes: {
    "*": [
      "public/**",
      "fixtures/**",
      "docs/**",
      "scripts/**",
      "**/*.test.ts",
      "**/*.test.tsx",
    ],
  },
};

export default nextConfig;
