import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
    // Monorepo: trace dependencies from repo root so Vercel bundles workspace packages.
    outputFileTracingRoot: path.join(__dirname, "../.."),
    turbopack: {
        // Ensure Next/Turbopack uses this project directory as the root,
        // even if another lockfile exists higher up the filesystem.
        // In a monorepo with hoisted dependencies, Next may be installed at the repo root.
        // Point Turbopack at the repo root so it can resolve `next` from the hoisted node_modules.
        root: path.join(__dirname, "../.."),
    },
    transpilePackages: ["@bsc/ui", "@bsc/shared"],
    images: {
        remotePatterns: [
            {
                // Firebase Storage — covers all buckets under firebasestorage.app
                protocol: "https",
                hostname: "*.firebasestorage.app",
                pathname: "/**",
            },
            {
                // Firebase Storage — legacy appspot.com domain
                protocol: "https",
                hostname: "firebasestorage.googleapis.com",
                pathname: "/**",
            },
            {
                // Firebase Storage — alternative storage.googleapis.com
                protocol: "https",
                hostname: "storage.googleapis.com",
                pathname: "/**",
            },
            {
                // Google user profile photos
                protocol: "https",
                hostname: "lh3.googleusercontent.com",
                pathname: "/**",
            },
        ],
    },
};

export default nextConfig;
