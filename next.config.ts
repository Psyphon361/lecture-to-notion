import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep AGENTS.md as the project instructions. Next would otherwise append its own block on dev.
  agentRules: false,
};

export default nextConfig;
