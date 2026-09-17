"use client";

import { useEffect } from "react";

/**
 * Registers the offline service worker (public/sw.js) in production only.
 *
 * In development the SW is actively harmful: Next's dev chunk URLs never
 * change (`/_next/static/chunks/app/(order)/menu/page.js`), so a cached copy
 * silently masks every code change until the cache is cleared. So in dev we
 * unregister any SW left over from an earlier session and drop its caches.
 */
export function PWARegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations().then(regs => {
        regs.forEach(r => void r.unregister());
      });
      if ("caches" in window) {
        void caches.keys().then(keys => keys.forEach(k => void caches.delete(k)));
      }
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // SW registration failed — app still works without it
    });
  }, []);

  return null;
}
