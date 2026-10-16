import type { NextConfig } from "next";

// The browser only ever talks to this app: /api/* is proxied to the .NET backend. That
// keeps the STB API bound to loopback and means there is no cross-origin request to
// configure, since the browser sees a single origin.
const API_ORIGIN = process.env.STB_API_ORIGIN ?? "http://127.0.0.1:5080";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_ORIGIN}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
