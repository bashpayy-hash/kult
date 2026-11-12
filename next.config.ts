import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Story screenshots and venue photos are downscaled in the browser to
  // ~1600px before upload, so 4mb is plenty and stays under the request
  // limits of serverless functions (Netlify 6MB, Vercel 4.5MB).
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  poweredByHeader: false,
};

export default nextConfig;
