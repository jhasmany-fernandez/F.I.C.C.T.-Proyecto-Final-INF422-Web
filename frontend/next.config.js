/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "127.0.0.1", port: "8787" },
      { protocol: "http", hostname: "localhost", port: "8787" },
      { protocol: "http", hostname: "35.238.201.88", port: "8787" },
    ],
  },
};

module.exports = nextConfig;
