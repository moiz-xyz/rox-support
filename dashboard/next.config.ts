import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // workspace packages ship compiled ESM, but transpiling keeps dev rebuilds instant
  transpilePackages: ["@roxshield/support-sdk", "@roxshield/support-widget"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // microphone is needed for calls and voice messages
          { key: "Permissions-Policy", value: "microphone=(self), camera=(self), geolocation=()" },
        ],
      },
      { source: "/((?!embed).*)", headers: [{ key: "X-Frame-Options", value: "DENY" }] },
    ];
  },
};

export default nextConfig;
