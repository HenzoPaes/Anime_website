// src/hooks/usePWACheck.ts
import { useState, useEffect } from "react";

/**
 * Detecta:
 *  - PWA real instalada (standalone / fullscreen / minimal-ui)
 *  - Safari iOS standalone
 *  - Lançamento via ícone (?utm_source=homescreen ou ?pwa=1)
 *  - Flag de sessão
 *  - Fullscreen manual (F11)
 *
 * Retorna:
 *  - isPWA (app instalado real)
 *  - isFullscreen (F11 ou requestFullscreen)
 *  - isBrowser (modo navegador normal)
 *  - isLoading (primeiro render)
 */

export function usePWACheck() {
  const [isPWA, setIsPWA] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;

    function detectPWA(): boolean {
      // 1️⃣ display-mode (Chrome/Edge/Firefox/Samsung)
      if (window.matchMedia("(display-mode: standalone)").matches)
        return true;

      if (window.matchMedia("(display-mode: fullscreen)").matches)
        return true;

      if (window.matchMedia("(display-mode: minimal-ui)").matches)
        return true;

      // 2️⃣ Safari iOS
      if ((navigator as any).standalone === true)
        return true;

      // 3️⃣ Parâmetros de lançamento
      const params = new URLSearchParams(window.location.search);
      if (params.get("utm_source") === "homescreen") return true;
      if (params.get("pwa") === "1") return true;

      // 4️⃣ Flag persistida na sessão
      if (sessionStorage.getItem("pwa_launched") === "true")
        return true;

      return false;
    }

    function detectFullscreen(): boolean {
      if (document.fullscreenElement) return true;

      // F11 detection fallback
      if (window.innerHeight === screen.height) return true;

      return false;
    }

    function updateState() {
      const pwa = detectPWA();
      const fullscreen = detectFullscreen();

      setIsPWA(pwa);
      setIsFullscreen(fullscreen);

      if (pwa) {
        sessionStorage.setItem("pwa_launched", "true");
      }
    }

    updateState();
    setIsLoading(false);

    // 🎧 Listeners
    const standaloneMQ = window.matchMedia("(display-mode: standalone)");
    const fullscreenMQ = window.matchMedia("(display-mode: fullscreen)");

    standaloneMQ.addEventListener("change", updateState);
    fullscreenMQ.addEventListener("change", updateState);

    window.addEventListener("resize", updateState);
    document.addEventListener("fullscreenchange", updateState);

    return () => {
      standaloneMQ.removeEventListener("change", updateState);
      fullscreenMQ.removeEventListener("change", updateState);
      window.removeEventListener("resize", updateState);
      document.removeEventListener("fullscreenchange", updateState);
    };
  }, []);

  return {
    isPWA,
    isFullscreen,
    isBrowser: !isPWA && !isFullscreen,
    isLoading,
  };
}