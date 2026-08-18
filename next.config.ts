import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  allowedDevOrigins: ["*.ngrok-free.dev", "aside-drew-flavored.ngrok-free.dev"],
};

export default nextConfig;
