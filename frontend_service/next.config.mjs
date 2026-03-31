/** @type {import('next').NextConfig} */
const resolvedBackend = (process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "").replace(/\/+$/, "");
const isDeployedProduction = process.env.NODE_ENV === "production" && process.env.VERCEL_ENV === "production";
if (isDeployedProduction && !resolvedBackend) {
  throw new Error("Missing API_URL or NEXT_PUBLIC_API_URL for Next.js rewrites in production.");
}

const nextConfig = {
  images: {
    unoptimized: true,
  },
  output: 'standalone',
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    missingSuspenseWithCSRBailout: false,
  },
  async rewrites() {
    const backend = resolvedBackend || "http://localhost:5000";
    return [
      {
        source: "/backend/:path*",
        destination: `${backend}/:path*`,
      },
    ];
  },
}

export default nextConfig
