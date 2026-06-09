import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "bcryptjs"],
  output: "standalone",
  outputFileTracingRoot: process.cwd(),
  async rewrites() {
    // /ops/* rewrites to the ops API for assignment-compliant paths.
    // Ops UI lives under /console/* to avoid conflicting with those rewrites.
    return [
      { source: "/v1/:path*", destination: "/api/v1/:path*" },
      { source: "/ops/:path*", destination: "/api/ops/:path*" },
      { source: "/webhooks/:path*", destination: "/api/webhooks/:path*" },
    ];
  },
};

export default nextConfig;
