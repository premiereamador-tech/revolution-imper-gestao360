"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    // Ao chegar no login (ex.: após sair), limpa páginas em cache do usuário anterior
    if (location.pathname === "/login") navigator.serviceWorker.controller?.postMessage("clear");
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* PWA é progressivo: sem SW o app continua funcionando online */
    });
  }, []);
  return null;
}
