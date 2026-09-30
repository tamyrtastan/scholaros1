import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["mammoth", "unpdf"],
  experimental: { serverActions: { bodySizeLimit: "30mb" } },
};

export default config;
