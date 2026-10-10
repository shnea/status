import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  allowedDevOrigins: [new URL(process.env.APP_PUBLIC_URL || "http://localhost:30165").hostname],
};

export default config;
