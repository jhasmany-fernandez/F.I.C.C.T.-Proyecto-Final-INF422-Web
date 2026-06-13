/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  allowedDevOrigins: ["34.69.89.232"],
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "34.69.89.232", port: "8787" },
      { protocol: "http", hostname: "127.0.0.1", port: "8787" },
      { protocol: "http", hostname: "localhost", port: "8787" },
    ],
  },
};

module.exports = nextConfig;
