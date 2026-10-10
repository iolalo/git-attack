"use client";

import { useEffect } from "react";

export default function SWRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // instalación offline no disponible; la app sigue funcionando online
      });
    }
  }, []);
  return null;
}
