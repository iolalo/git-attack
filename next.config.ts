import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite probar el server de desarrollo desde el celu en la misma red
  // Wi-Fi (la IP local puede cambiar si el router reparte otra por DHCP).
  allowedDevOrigins: ["192.168.0.226", "192.168.0.*"],
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
