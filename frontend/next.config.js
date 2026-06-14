/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "127.0.0.1", port: "8787" },
      { protocol: "http", hostname: "localhost", port: "8787" },
    ],
  },
};

module.exports = nextConfig;
