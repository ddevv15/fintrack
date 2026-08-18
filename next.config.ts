import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root. Without this Turbopack walks up and finds the stray
  // package-lock.json in the home directory, then warns on every build.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
