// src/hooks/usePWACheck.ts
import { useState, useEffect } from "react";

/**
 * Detecta se o app está rodando como PWA instalado.
 *
 * Critérios (qualquer um basta):
 *  - display-mode: standalone / fullscreen / minimal-ui
 *  - navigator.standalone (Safari iOS)
 *  - URL contém ?utm_source=homescreen ou ?pwa=1
 *  - sessionStorage flag definida pelo service worker
 *
 * isLoading fica true apenas no primeiro render (SSR-safe).
 */
export function usePWACheck() {
  const [isPWA, setIsPWA] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    function detect(): boolean {
      // 1. matchMedia — funciona em Chrome/Edge/Firefox/Samsung
      const standaloneQuery = window.matchMedia("(display-mode: standalone)");
      if (standaloneQuery.matches) return true;

      const fullscreenQuery = window.matchMedia("(display-mode: fullscreen)");
      if (fullscreenQuery.matches) return true;

      const minimalQuery = window.matchMedia("(display-mode: minimal-ui)");
      if (minimalQuery.matches) return true;

      // 2. Safari iOS
      if ((navigator as any).standalone === true) return true;

      // 3. Parâmetro na URL (deeplink do ícone)
      const params = new URLSearchParams(window.location.search);
      if (params.get("utm_source") === "homescreen") return true;
      if (params.get("pwa") === "1") return true;

      // 4. Flag gravada pelo service worker no sessionStorage
      if (sessionStorage.getItem("pwa_launched") === "true") return true;

      return false;
    }

    const result = detect();
    setIsPWA(result);
    setIsLoading(false);

    // Persiste flag na sessão para navegação interna (SPA)
    if (result) sessionStorage.setItem("pwa_launched", "true");

    // Ouve mudanças (caso o usuário abra numa janela standalone depois)
    const mq = window.matchMedia("(display-mode: standalone)");
    const handler = (e: MediaQueryListEvent) => setIsPWA(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return { isPWA, isLoading };
} 