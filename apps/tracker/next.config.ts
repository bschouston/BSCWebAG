import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
  transpilePackages: ["@bsc/ui", "@bsc/shared"],
};

export default nextConfig;

