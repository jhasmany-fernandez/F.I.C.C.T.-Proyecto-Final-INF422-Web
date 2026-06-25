/** @type {import('next').NextConfig} */
const apiUrl = process.env.NEXT_PUBLIC_API_URL;

function readApiHost(url) {
  if (!url) {
    return null;
  }

  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

const apiHost = readApiHost(apiUrl);
const remotePatterns = [
  { protocol: "http", hostname: "127.0.0.1", port: "8787" },
  { protocol: "http", hostname: "localhost", port: "8787" },
];

if (apiHost && !remotePatterns.some((pattern) => pattern.hostname === apiHost)) {
  remotePatterns.push({ protocol: "http", hostname: apiHost, port: "8787" });
}

const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns,
  },
};

module.exports = nextConfig;
