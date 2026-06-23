/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "127.0.0.1", port: "8787" },
      { protocol: "http", hostname: "localhost", port: "8787" },
      { protocol: "http", hostname: "35.238.201.88", port: "8787" },
      { protocol: "http", hostname: "35.226.128.72", port: "8787" },
    ],
  },
};

module.exports = nextConfig;
