import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    turbopack: {
        // Ensure Next/Turbopack uses this project directory as the root,
        // even if another lockfile exists higher up the filesystem.
        root: __dirname,
    },
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
