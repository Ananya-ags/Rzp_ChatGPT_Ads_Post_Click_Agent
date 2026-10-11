import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // let phones on the same Wi-Fi load dev assets (LAN IP of this Mac + Bonjour hostname)
  allowedDevOrigins: ["172.16.5.6", "*.local"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
