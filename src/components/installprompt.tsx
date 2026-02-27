import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";

export default function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const promptRef = useRef<Event | null>(null);

  useEffect(() => {
    // Detect if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      return;
    }

    // Detect iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(iOS);

    // Listen for install prompt
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      promptRef.current = e;
      setCanInstall(true);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    // For iOS, show after 3 seconds with instructions
    if (iOS) {
      setTimeout(() => setShow(true), 3000);
    }

    // For Android/Desktop, always show after 5 seconds
    if (!iOS) {
      setTimeout(() => {
        if (promptRef.current) {
          setCanInstall(true);
        }
        setShow(true);
      }, 5000);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
    };
  }, []);

  const handleInstall = async () => {
    if (isIOS) {
      setShow(false);
      return;
    }
    
    const prompt = promptRef.current as any;
    if (!prompt) return;
    
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") {
      setIsInstalled(true);
      // Salva no localStorage para detectar como instalado
      localStorage.setItem('pwaInstalled', 'true');
    }
    setShow(false);
    promptRef.current = null;
  };

  const handleDismiss = () => {
    setShow(false);
    localStorage.setItem("installPromptDismissed", Date.now().toString());
  };

  // Check if dismissed recently (24 hours)
  const dismissedTime = localStorage.getItem("installPromptDismissed");
  if (dismissedTime && Date.now() - parseInt(dismissedTime) < 24 * 60 * 60 * 1000) {
    return null;
  }

  if (isInstalled) {
    return null;
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 100, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 100, scale: 0.9 }}
          className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-sm z-50"
        >
          <div className="bg-dark-800/95 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl shadow-black/50">
            <div className="flex items-start gap-3">
              {/* Icon */}
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-white text-sm mb-1">
                  Instalar AnimeVerse App
                </h3>
                {isIOS ? (
                  <p className="text-xs text-gray-400 mb-2">
                    Toque em <strong>Compartilhar</strong> → <strong>Adicionar à Tela de Início</strong>
                  </p>
                ) : canInstall ? (
                  <p className="text-xs text-gray-400 mb-2">
                    Instale para experiência completa offline!
                  </p>
                ) : (
                  <p className="text-xs text-gray-400 mb-2">
                    Veja instruções de instalação!
                  </p>
                )}
              </div>

              {/* Close button */}
              <button
                onClick={handleDismiss}
                className="text-gray-500 hover:text-white transition-colors p-1"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Actions */}
            <div className="flex gap-2 mt-3">
              {isIOS ? (
                <button
                  onClick={handleDismiss}
                  className="flex-1 py-2 px-4 rounded-lg bg-brand-500 text-white font-semibold text-sm hover:bg-brand-600 transition-colors"
                >
                  Entendi!
                </button>
              ) : canInstall ? (
                <>
                  <button
                    onClick={handleDismiss}
                    className="flex-1 py-2 px-4 rounded-lg bg-white/10 text-gray-300 font-semibold text-sm hover:bg-white/20 transition-colors"
                  >
                    Agora não
                  </button>
                  <button
                    onClick={handleInstall}
                    className="flex-1 py-2 px-4 rounded-lg bg-brand-500 text-white font-semibold text-sm hover:bg-brand-600 transition-colors"
                  >
                    Instalar
                  </button>
                </>
              ) : (
                <Link
                  to="/download"
                  onClick={handleDismiss}
                  className="flex-1 py-2 px-4 rounded-lg bg-brand-500 text-white font-semibold text-sm hover:bg-brand-600 transition-colors text-center"
                >
                  Ver Instruções
                </Link>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
