import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Add custom webpack config to handle client-side only code
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Client-side only configurations
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },
  // Reduce hydration mismatches
  reactStrictMode: true,
};

export default nextConfig;
