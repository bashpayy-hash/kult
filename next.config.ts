import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Story screenshots and venue photos are downscaled in the browser to
  // ~1600px before upload, so 4mb is plenty and stays under Vercel's 4.5MB
  // request limit for functions.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  poweredByHeader: false,
};

export default nextConfig;
