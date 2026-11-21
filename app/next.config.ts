import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { syncBrandIcons } from "./src/sync-brand-icons";

syncBrandIcons();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@steve/shared"],
  outputFileTracingRoot: root,
  agentRules: false,
} satisfies NextConfig;

export default nextConfig;
