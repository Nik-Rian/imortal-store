import type { NextConfig } from "next";

const blobHostnames = (process.env.VERCEL_BLOB_HOSTNAMES ?? "")
  .split(",")
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  allowedDevOrigins: ["*.ngrok-free.dev", "aside-drew-flavored.ngrok-free.dev"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      ...blobHostnames.map((hostname) => ({
        protocol: "https" as const,
        hostname,
        port: "",
        pathname: "/products/**",
      })),
    ],
  },
};

export default nextConfig;
