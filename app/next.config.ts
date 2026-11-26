import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { devOrigins } from "./src/dev-origins";
import { syncBrandIcons } from "./src/sync-brand-icons";
import { syncMascotAppIcons } from "./src/sync-mascot-app-icons";
import { syncMascotWebps } from "./src/sync-mascot-webps";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export default async function nextConfig(): Promise<NextConfig> {
  syncBrandIcons();
  await syncMascotAppIcons();
  await syncMascotWebps();
  return {
    reactStrictMode: true,
    transpilePackages: ["@steve/profile", "@steve/shared", "@steve/triage", "@steve/voice"],
    outputFileTracingRoot: root,
    allowedDevOrigins: devOrigins,
    agentRules: false,
  };
}
