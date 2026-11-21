import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@roxshield/support-sdk", "@roxshield/support-widget"],
};

export default nextConfig;
