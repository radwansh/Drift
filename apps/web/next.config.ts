import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  transpilePackages: ["@saas/types", "@saas/db", "@saas/payroll-core", "@saas/ai"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};
export default nextConfig;
