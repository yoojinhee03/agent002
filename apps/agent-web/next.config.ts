import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@agent-studio/shared"],
  output: "standalone",
  env: {
    PORT: "28002",
  },
};

export default nextConfig;
