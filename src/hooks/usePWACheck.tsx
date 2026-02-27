import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

export function usePWACheck() {
  const [isPWA, setIsPWA] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const checkedRef = useRef(false);

  useEffect(() => {
    // Evita verificação dupla
    if (checkedRef.current) return;
    checkedRef.current = true;

    // Verifica se está rodando como PWA instalado
    const checkPWA = () => {
      // Só verifica uma vez na inicialização
      // Não reage a mudanças de display-mode para evitar conflitos com cinema mode
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
      const isInWebAppiOS = (window.navigator as any).standalone === true;
      const isInstalled = localStorage.getItem('pwaInstalled') === 'true';
      
      setIsPWA(isStandalone || isInWebAppiOS || isInstalled);
      setIsLoading(false);
    };

    checkPWA();
  }, []);

  return { isPWA, isLoading };
}

// Função para marcar como instalado
export function setPWAInstalled() {
  localStorage.setItem('pwaInstalled', 'true');
}

// Componente que redireciona se não for PWA
export function PWAProtect({ children }: { children: React.ReactNode }) {
  const { isPWA, isLoading } = usePWACheck();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !isPWA) {
      // Se não é PWA e não é a página de download, redireciona
      if (window.location.pathname !== '/download') {
        navigate('/download', { replace: true });
      }
    }
  }, [isPWA, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-dark-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand-500"></div>
      </div>
    );
  }

  return <>{children}</>;
}
